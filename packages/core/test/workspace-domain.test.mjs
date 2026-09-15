import assert from 'node:assert/strict';
import test from 'node:test';
import { createWorkspaceDomain, WorkspaceDomainError } from '../dist/workspace-domain.js';

function fixture() {
  const workspaces = new Map();
  const projects = new Map();
  const store = {
    insertWorkspace: value => { workspaces.set(value.id, value); },
    findWorkspace: id => workspaces.get(id) ?? null,
    listWorkspaces: () => [...workspaces.values()],
    insertProject: value => { projects.set(value.id, value); },
    findProject: id => projects.get(id) ?? null,
    listProjects: id => [...projects.values()].filter(value => value.workspaceId === id),
  };
  return { store, api: createWorkspaceDomain({ store }) };
}

const errorCode = code => error => error instanceof WorkspaceDomainError && error.code === code;

test('explicit empty domain needs no Agent, Runtime, cwd or hidden defaults', async () => {
  const { api } = fixture();
  assert.deepEqual(await api.listWorkspaces(), []);
  const workspace = await api.createWorkspace({ name: '  제품 개발  ' });
  assert.equal(workspace.name, '제품 개발');
  assert.match(workspace.id, /^[0-9a-f-]{36}$/);
  assert.equal(new Date(workspace.createdAt).toISOString(), workspace.createdAt);
  assert.deepEqual(Object.keys(workspace).sort(), ['createdAt', 'id', 'name']);
  assert.deepEqual(await api.getWorkspace({ id: workspace.id }), workspace);
  assert.deepEqual(await api.listProjects({ workspaceId: workspace.id }), []);
});

test('each project belongs to one explicit workspace; names need not be unique', async () => {
  const { api } = fixture();
  const one = await api.createWorkspace({ name: '공간' });
  const two = await api.createWorkspace({ name: '공간' });
  const p = await api.createProject({ workspaceId: one.id, name: '  분석  ' });
  const q = await api.createProject({ workspaceId: two.id, name: '분석' });
  assert.notEqual(one.id, two.id);
  assert.notEqual(p.id, q.id);
  assert.equal(p.name, '분석');
  assert.deepEqual(await api.listProjects({ workspaceId: one.id }), [p]);
  assert.deepEqual(await api.listProjects({ workspaceId: two.id }), [q]);
  assert.deepEqual(await api.getProject({ id: p.id }), p);
  assert.deepEqual(Object.keys(p).sort(), ['createdAt', 'id', 'name', 'workspaceId']);
});

test('unknown entities have explicit not-found errors, not empty or default containers', async () => {
  const { api } = fixture();
  const missing = crypto.randomUUID();
  await assert.rejects(api.getWorkspace({ id: missing }), errorCode('workspace_not_found'));
  await assert.rejects(api.listProjects({ workspaceId: missing }), errorCode('workspace_not_found'));
  await assert.rejects(api.createProject({ workspaceId: missing, name: '업무' }), errorCode('workspace_not_found'));
  await assert.rejects(api.getProject({ id: missing }), errorCode('project_not_found'));
  assert.deepEqual(await api.listWorkspaces(), []);
});

test('invalid inputs cannot assign IDs, timestamps, cwd, or an implicit parent', async () => {
  const { api } = fixture();
  for (const input of [undefined, null, [], 'name', {}, { name: '' }, { name: ' \t ' },
    { name: 42 }, { name: 'x'.repeat(201) }, { name: 'a\nb' }, { name: 'a\0b' },
    { name: 'valid', id: crypto.randomUUID() }, { name: 'valid', cwd: '/tmp' },
    { name: 'valid', createdAt: new Date().toISOString() }]) {
    await assert.rejects(api.createWorkspace(input), errorCode('invalid_input'));
  }
  const w = await api.createWorkspace({ name: 'x'.repeat(200) });
  for (const input of [{ name: 'missing parent' }, { name: 'bad', workspaceId: '' },
    { name: 'bad', workspaceId: [w.id] }, { name: 'bad', workspaceId: w.id, id: crypto.randomUUID() },
    { name: '', workspaceId: w.id }, { name: 'bad', workspaceId: w.id, cwd: '/tmp' }]) {
    await assert.rejects(api.createProject(input), errorCode('invalid_input'));
  }
  for (const id of [undefined, '', '../file', 'current', [], 42]) {
    await assert.rejects(api.getWorkspace({ id }), errorCode('invalid_input'));
    await assert.rejects(api.getProject({ id }), errorCode('invalid_input'));
    await assert.rejects(api.listProjects({ workspaceId: id }), errorCode('invalid_input'));
  }
  assert.equal((await api.listWorkspaces()).length, 1);
  assert.deepEqual(await api.listProjects({ workspaceId: w.id }), []);
});

test('returned objects and lists cannot mutate persistent state', async () => {
  const { api } = fixture();
  const w = await api.createWorkspace({ name: 'Original' });
  const p = await api.createProject({ workspaceId: w.id, name: 'Original project' });
  w.name = 'Changed';
  p.workspaceId = crypto.randomUUID();
  (await api.getWorkspace({ id: w.id })).name = 'Changed again';
  (await api.getProject({ id: p.id })).name = 'Changed again';
  const listed = await api.listWorkspaces();
  listed[0].name = 'Changed list';
  listed.length = 0;
  (await api.listProjects({ workspaceId: w.id }))[0].name = 'Changed list';
  assert.equal((await api.getWorkspace({ id: w.id })).name, 'Original');
  assert.equal((await api.getProject({ id: p.id })).workspaceId, w.id);
  assert.equal((await api.getProject({ id: p.id })).name, 'Original project');
});

test('failed inserts do not report success or leak driver errors', async () => {
  const { api, store } = fixture();
  const w = await api.createWorkspace({ name: 'Existing' });
  const secret = 'SQLITE_CANTOPEN C:/private/customer/worknaru-domain.sqlite';
  store.insertProject = () => { throw new Error(secret); };
  store.insertWorkspace = async () => { throw new Error(secret); };
  for (const operation of [api.createProject({ workspaceId: w.id, name: 'Fail' }), api.createWorkspace({ name: 'Fail' })]) {
    await assert.rejects(operation, error => {
      assert.ok(errorCode('storage_error')(error));
      assert.ok(!error.message.includes(secret));
      return true;
    });
  }
  assert.deepEqual(await api.listProjects({ workspaceId: w.id }), []);
  assert.equal((await api.listWorkspaces()).length, 1);
  store.findWorkspace = () => { throw new Error(secret); };
  await assert.rejects(api.getWorkspace({ id: w.id }), errorCode('storage_error'));
});

test('asynchronous persistence is awaited before returning created data', async () => {
  const { store } = fixture();
  const original = store.insertWorkspace;
  let release;
  store.insertWorkspace = async value => {
    await new Promise(resolve => { release = resolve; });
    original(value);
  };
  const api = createWorkspaceDomain({ store });
  const result = api.createWorkspace({ name: 'Async' });
  assert.deepEqual(await api.listWorkspaces(), []);
  release();
  const w = await result;
  assert.deepEqual(await api.getWorkspace({ id: w.id }), w);
});
