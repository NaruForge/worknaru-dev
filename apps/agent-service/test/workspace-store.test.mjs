import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, mkdirSync, rmSync, symlinkSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { createWorkspaceDomain } from '../../../packages/core/dist/workspace-domain.js';
import { openWorkspaceStore } from '../server/workspace-store.mjs';

const resources = new WeakMap();
function track(t, resource) { resources.get(t).push(resource); }

function filename(t) {
  const root = process.env.WORKNARU_TEST_ROOT || path.join(os.tmpdir(), 'worknaru-tests');
  mkdirSync(root, { recursive: true });
  const directory = mkdtempSync(path.join(root, 'workspace-domain-'));
  resources.set(t, []);
  t.after(() => {
    try { for (const resource of resources.get(t).reverse()) resource.close(); }
    finally { rmSync(directory, { recursive: true, force: true }); }
  });
  return path.join(directory, 'worknaru-domain.sqlite');
}
function fixture(t) {
  const file = filename(t);
  const store = openWorkspaceStore(file);
  track(t, store);
  return { file, store, api: createWorkspaceDomain({ store }) };
}
const imports = `
  import { createWorkspaceDomain } from ${JSON.stringify(new URL('../../../packages/core/dist/workspace-domain.js', import.meta.url).href)};
  import { openWorkspaceStore } from ${JSON.stringify(new URL('../server/workspace-store.mjs', import.meta.url).href)};
`;
function child(code, args) {
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', imports + code, ...args], { encoding: 'utf8', timeout: 15000 });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

test('normal close and reopen preserve identity, membership and timestamps', async t => {
  const { api, store, file } = fixture(t);
  const w = await api.createWorkspace({ name: '개발' });
  const p = await api.createProject({ workspaceId: w.id, name: '업무' });
  store.close();
  const reopened = openWorkspaceStore(file);
  track(t, reopened);
  const next = createWorkspaceDomain({ store: reopened });
  assert.deepEqual(await next.getWorkspace({ id: w.id }), w);
  assert.deepEqual(await next.getProject({ id: p.id }), p);
  assert.deepEqual(await next.listProjects({ workspaceId: w.id }), [p]);
});

test('a completely new process reads the data created by the previous process', t => {
  const file = filename(t);
  const written = child(`
    const store = openWorkspaceStore(process.argv[1]);
    const api = createWorkspaceDomain({ store });
    const workspace = await api.createWorkspace({ name: 'Persisted workspace' });
    const project = await api.createProject({ workspaceId: workspace.id, name: 'Persisted project' });
    store.close();
    console.log(JSON.stringify({ workspace, project }));
  `, [file]);
  const read = child(`
    const store = openWorkspaceStore(process.argv[1]);
    const api = createWorkspaceDomain({ store });
    const workspace = await api.getWorkspace({ id: process.argv[2] });
    const project = await api.getProject({ id: process.argv[3] });
    store.close();
    console.log(JSON.stringify({ workspace, project }));
  `, [file, written.workspace.id, written.project.id]);
  assert.deepEqual(read, written);
});

test('foreign keys and primary keys reject partial/duplicate writes at the storage boundary', async t => {
  const { store, api } = fixture(t);
  const w = await api.createWorkspace({ name: 'Workspace' });
  const p = await api.createProject({ workspaceId: w.id, name: 'Project' });
  assert.throws(() => store.insertProject({ ...p, id: crypto.randomUUID(), workspaceId: crypto.randomUUID() }), /FOREIGN KEY/);
  assert.throws(() => store.insertWorkspace({ ...w, name: 'overwrite' }), /UNIQUE/);
  assert.throws(() => store.insertProject({ ...p, name: 'overwrite' }), /UNIQUE/);
  assert.deepEqual(await api.listWorkspaces(), [w]);
  assert.deepEqual(await api.listProjects({ workspaceId: w.id }), [p]);
});

test('separate connections see live inserts rather than overwriting stale snapshots', async t => {
  const { store, api, file } = fixture(t);
  const other = openWorkspaceStore(file);
  track(t, other);
  const next = createWorkspaceDomain({ store: other });
  const a = await api.createWorkspace({ name: 'Same name' });
  const b = await next.createWorkspace({ name: 'Same name' });
  const p = await next.createProject({ workspaceId: a.id, name: 'Visible to both' });
  assert.deepEqual(new Set((await api.listWorkspaces()).map(w => w.id)), new Set([a.id, b.id]));
  assert.deepEqual(store.listProjects(a.id), [p]);
  assert.deepEqual(await next.listProjects({ workspaceId: b.id }), []);
});

test('simultaneous processes initialize and insert without losing earlier data', async t => {
  const file = filename(t);
  const code = imports + `
    const store = openWorkspaceStore(process.argv[1]);
    const api = createWorkspaceDomain({ store });
    for (let i = 0; i < 5; i++) {
      const w = await api.createWorkspace({ name: 'Concurrent workspace' });
      await api.createProject({ workspaceId: w.id, name: 'Concurrent project' });
    }
    store.close();
  `;
  const writers = await Promise.allSettled(Array.from({ length: 4 }, () => new Promise((resolve, reject) => {
    const worker = spawn(process.execPath, ['--input-type=module', '-e', code, file], { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    const timer = setTimeout(() => { stderr += 'Concurrent writer timed out'; worker.kill(); }, 15000);
    worker.stderr.on('data', chunk => { stderr += chunk; });
    worker.on('error', error => { clearTimeout(timer); reject(error); });
    worker.on('close', status => {
      clearTimeout(timer);
      if (status === 0) resolve(); else reject(new Error(stderr || `Writer exited ${status}`));
    });
  })));
  for (const writer of writers) assert.equal(writer.status, 'fulfilled', writer.reason?.message);
  const store = openWorkspaceStore(file);
  track(t, store);
  assert.equal(store.listWorkspaces().length, 20);
  assert.equal(new Set(store.listWorkspaces().map(w => w.id)).size, 20);
  for (const w of store.listWorkspaces()) assert.equal(store.listProjects(w.id).length, 1);
});

test('stable ordering and SQL values are preserved without SQL interpretation', async t => {
  const { api } = fixture(t);
  const name = "Robert'); DROP TABLE workspaces;--";
  const w = await api.createWorkspace({ name });
  await api.createWorkspace({ name: 'Second' });
  const p = await api.createProject({ workspaceId: w.id, name });
  assert.equal((await api.getWorkspace({ id: w.id })).name, name);
  assert.equal((await api.getProject({ id: p.id })).name, name);
  const list = await api.listWorkspaces();
  assert.deepEqual(list, [...list].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)));
});

test('unsupported schema is rejected without resetting existing data', t => {
  const file = filename(t);
  const db = new DatabaseSync(file);
  db.exec("CREATE TABLE preserved (value TEXT); INSERT INTO preserved VALUES ('keep'); PRAGMA user_version=999;");
  db.close();
  assert.throws(() => openWorkspaceStore(file), /Unsupported/);
  const check = new DatabaseSync(file);
  track(t, check);
  assert.equal(check.prepare('SELECT value FROM preserved').get().value, 'keep');
  assert.equal(check.prepare('PRAGMA user_version').get().user_version, 999);
});

test('an unrelated version-zero database is never repurposed as the domain store', t => {
  const file = filename(t);
  const db = new DatabaseSync(file);
  db.exec("CREATE TABLE state (document TEXT); INSERT INTO state VALUES ('agent queue');");
  db.close();
  assert.throws(() => openWorkspaceStore(file), /Unrecognized/);
  const check = new DatabaseSync(file);
  track(t, check);
  assert.equal(check.prepare('SELECT document FROM state').get().document, 'agent queue');
  assert.equal(check.prepare("SELECT count(*) AS count FROM sqlite_master WHERE name='workspaces'").get().count, 0);
});

test('invalid database paths do not silently fall back to cwd or memory', () => {
  for (const file of [undefined, '', ':memory:', 'relative.sqlite']) assert.throws(() => openWorkspaceStore(file), /absolute/);
});

test('symbolic links to database files are rejected', { skip: process.platform === 'win32' ? 'Symlink creation requires Windows privileges; Linux test covers this guard.' : false }, t => {
  const file = filename(t);
  const target = `${file}.target`;
  const db = new DatabaseSync(target);
  db.close();
  symlinkSync(target, file);
  assert.throws(() => openWorkspaceStore(file), /regular file/);
});

test('closed stores fail safely and closing twice is harmless', async t => {
  const { api, store } = fixture(t);
  store.close();
  store.close();
  await assert.rejects(api.listWorkspaces(), { code: 'storage_error' });
  await assert.rejects(api.createWorkspace({ name: 'Must not succeed' }), { code: 'storage_error' });
});
