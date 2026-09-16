import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { createModuleService, createWorkspaceDomain } from '@worknaru/core';
import { testDirectory } from '../../../packages/dev-environment/testing.mjs';
import { openWorkspaceStore } from '../server/workspace-store.mjs';
import { openModuleStore } from '../server/module-store.mjs';
import { textStats } from '../server/modules.mjs';

async function fixture(t, implementation = textStats) {
  const directory = await testDirectory('modules');
  const filename = path.join(directory, 'module-runs.sqlite');
  const ws = openWorkspaceStore(path.join(directory, 'worknaru-domain.sqlite'));
  const store = openModuleStore(filename);
  const workspace = createWorkspaceDomain({ store: ws });
  const api = createModuleService({ store, workspace, implementations: [implementation] });
  t.after(async () => { await api.close(); store.close(); ws.close(); });
  const w = await workspace.createWorkspace({ name: 'Work' });
  const p = await workspace.createProject({ workspaceId: w.id, name: 'One' });
  const other = await workspace.createProject({ workspaceId: w.id, name: 'Two' });
  return { api, store, workspace, w, p, other, filename };
}
const request = (target = { type: 'standalone' }, text = '가😀\r\nB') => ({ requestId: crypto.randomUUID(), moduleId: 'text-stats', target, input: { text } });

test('text-stats validates input, reports code points/lines, and isolates exact contexts', async t => {
  const f = await fixture(t);
  assert.deepEqual(await f.api.list(), [textStats.definition]);
  const targets = [{ type: 'standalone' }, { type: 'workspace', workspaceId: f.w.id }, { type: 'project', projectId: f.p.id }];
  for (const target of targets) {
    const result = await f.api.execute(request(target));
    assert.equal(result.status, 'succeeded');
    assert.deepEqual(result.result, { characters: 5, lines: 2 });
    assert.equal(result.context.workspaceId, target.type === 'standalone' ? null : f.w.id);
    assert.deepEqual(await f.api.listRuns({ target }), [result]);
    assert.deepEqual(await f.api.getRun({ id: result.id }), result);
  }
  assert.deepEqual(await f.api.listRuns({ target: { type: 'project', projectId: f.other.id } }), []);
  const empty = await f.api.execute(request(undefined, ''));
  assert.deepEqual(empty.result, { characters: 0, lines: 0 });
  assert.deepEqual(textStats.validateResult(await textStats.execute({ text: 'a\rb\nc\r\n' })), { characters: 7, lines: 4 });
  for (const [input, code] of [
    [{ ...request(), target: undefined }, 'invalid_input'],
    [{ ...request(), requestId: 'prefix' }, 'invalid_input'],
    [{ ...request(), input: { text: 'x', extra: true } }, 'invalid_input'],
    [request(undefined, 'x'.repeat(100001)), 'invalid_input'],
    [{ ...request(), moduleId: 'unregistered' }, 'module_not_found'],
    [request({ type: 'project', projectId: f.p.id, workspaceId: f.w.id }), 'invalid_input'],
    [request({ type: 'project', projectId: crypto.randomUUID() }), 'project_not_found'],
    [request({ type: 'workspace', workspaceId: crypto.randomUUID() }), 'workspace_not_found'],
  ]) await assert.rejects(f.api.execute(input), { code });
  assert.equal((await f.api.listRuns({ target: targets[0] })).length, 2);
  await assert.rejects(f.api.getRun({ id: 'bad' }), { code: 'invalid_input' });
  await assert.rejects(f.api.getRun({ id: crypto.randomUUID() }), { code: 'run_not_found' });
});

test('concurrent same-ID requests execute once and reject changed input/context', async t => {
  let release, calls = 0;
  const gate = new Promise(resolve => { release = resolve; });
  const f = await fixture(t, { ...textStats, async execute(input) { calls++; await gate; return textStats.execute(input); } });
  const input = request();
  const first = f.api.execute(input);
  t.after(() => release());
  const duplicate = await f.api.execute(input);
  assert.equal(duplicate.status, 'running');
  assert.equal(calls, 1);
  await assert.rejects(f.api.execute({ ...input, input: { text: 'different' } }), { code: 'request_conflict' });
  await assert.rejects(f.api.execute({ ...input, target: { type: 'project', projectId: f.p.id } }), { code: 'request_conflict' });
  release();
  const completed = await first;
  assert.equal(completed.id, duplicate.id);
  assert.deepEqual(await f.api.execute(input), completed);
  completed.result.characters = 999;
  assert.equal((await f.api.getRun({ id: completed.id })).result.characters, 5);
});

test('execution/output failures are durable and never expose implementation errors', async t => {
  for (const implementation of [
    { ...textStats, async execute() { throw Error('private filename'); } },
    { ...textStats, async execute() { return { characters: -1, lines: 0 }; } },
  ]) {
    const f = await fixture(t, implementation);
    const input = request();
    const failed = await f.api.execute(input);
    assert.equal(failed.status, 'failed');
    assert.equal(failed.error.code, 'execution_failed');
    assert.ok(!JSON.stringify(failed).includes('private'));
    assert.deepEqual(await f.api.execute(input), failed);
  }
});

test('restart preserves completed data and marks accepted/running uncertain without execution', async t => {
  const f = await fixture(t);
  const input = request();
  const completed = await f.api.execute(input);
  await f.api.close(); f.store.close();
  let store = openModuleStore(f.filename);
  const pending = ['accepted', 'running'].map(status => ({ ...completed, id: crypto.randomUUID(), requestId: crypto.randomUUID(),
    status, result: null, error: null, startedAt: status === 'accepted' ? null : completed.startedAt, finishedAt: null }));
  pending.forEach(run => store.accept(run)); store.close();
  store = openModuleStore(f.filename);
  let calls = 0;
  const api = createModuleService({ store, workspace: f.workspace, implementations: [{ ...textStats, async execute() { calls++; throw Error(); } }] });
  try {
    assert.deepEqual(await api.getRun({ id: completed.id }), completed);
    for (const run of pending) {
      const result = await api.execute({ ...input, requestId: run.requestId });
      assert.equal(result.id, run.id);
      assert.equal(result.status, 'uncertain');
    }
    assert.equal(calls, 0);
  } finally { await api.close(); store.close(); }
});

test('process death after execution starts leaves one uncertain Run on recovery', { timeout: 15000 }, async t => {
  const f = await fixture(t);
  await f.api.close(); f.store.close();
  const input = request();
  const source = `
    import { createModuleService } from './packages/core/dist/index.js';
    import { openModuleStore } from './apps/agent-service/server/module-store.mjs';
    import { textStats } from './apps/agent-service/server/modules.mjs';
    const api = createModuleService({ store: openModuleStore(process.argv[1]), workspace: {},
      implementations: [{ ...textStats, async execute() { process.send('running'); await new Promise(() => {}); } }] });
    setInterval(() => {}, 1000);
    api.execute(JSON.parse(process.argv[2]));
  `;
  const child = spawn(process.execPath, ['--input-type=module', '-e', source, f.filename, JSON.stringify(input)], {
    cwd: path.resolve(import.meta.dirname, '../../..'), stdio: ['ignore', 'ignore', 'pipe', 'ipc'], windowsHide: true,
  });
  t.after(() => { if (child.exitCode === null) child.kill(); });
  await Promise.race([once(child, 'message'), once(child, 'exit').then(() => { throw Error('Child exited before execution'); })]);
  child.kill(); await once(child, 'exit');
  const store = openModuleStore(f.filename);
  const api = createModuleService({ store, workspace: f.workspace, implementations: [textStats] });
  try { assert.equal((await api.execute(input)).status, 'uncertain'); }
  finally { await api.close(); store.close(); }
});

test('unknown Module schema is rejected without mutation', async t => {
  const f = await fixture(t);
  await f.api.close(); f.store.close();
  const db = new DatabaseSync(f.filename);
  db.exec('DROP INDEX runs_by_context'); db.close();
  const before = await readFile(f.filename);
  assert.throws(() => openModuleStore(f.filename), /Invalid Module/);
  assert.deepEqual(await readFile(f.filename), before);
});

test('storage failures cannot start unrecorded execution or report unpersisted success', async t => {
  const f = await fixture(t);
  await f.api.close();
  let calls = 0;
  let failAt = 'accept';
  const store = { ...f.store,
    accept(run) { if (failAt === 'accept') throw Error('private SQL'); return f.store.accept(run); },
    transition(id, from, run) { if (failAt === from) throw Error('private SQL'); f.store.transition(id, from, run); },
  };
  const api = createModuleService({ store, workspace: f.workspace,
    implementations: [{ ...textStats, async execute(input) { calls++; return textStats.execute(input); } }] });
  try {
    for (const phase of ['accept', 'accepted', 'running']) {
      failAt = phase;
      await assert.rejects(api.execute(request()), error => error.code === 'storage_error' && !error.message.includes('private'));
      assert.equal(calls, phase === 'running' ? 1 : 0);
    }
    const runs = await api.listRuns({ target: { type: 'standalone' } });
    assert.deepEqual(runs.map(run => run.status).sort(), ['accepted', 'running']);
  } finally { await api.close(); }
});

test('graceful close waits for active execution and rejects new submissions', async t => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const f = await fixture(t, { ...textStats, async execute(input) { await gate; return textStats.execute(input); } });
  const task = f.api.execute(request());
  // Yield so context validation has completed and execution owns a durable Run.
  await new Promise(resolve => setImmediate(resolve));
  let closed = false;
  const closing = f.api.close().then(() => { closed = true; });
  await assert.rejects(f.api.execute(request()), { code: 'service_error' });
  assert.equal(closed, false);
  release(); await closing;
  assert.equal((await task).status, 'succeeded');
});
