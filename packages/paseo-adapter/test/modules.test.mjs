import assert from 'node:assert/strict';
import test from 'node:test';
import { setImmediate } from 'node:timers/promises';
import { DaemonClient } from '@getpaseo/client/internal/daemon-client';
import { createPaseoRuntime } from '../dist/index.js';

const input = { requestId: crypto.randomUUID(), moduleId: 'text-stats', target: { type: 'standalone' }, input: { text: 'a' } };
const run = { id: crypto.randomUUID(), requestId: input.requestId, moduleId: 'text-stats', moduleVersion: '1.0.0',
  context: { type: 'standalone', workspaceId: null, projectId: null }, input: input.input,
  status: 'succeeded', result: { characters: 1, lines: 1 }, error: null,
  createdAt: '2026-09-16T00:00:00.000Z', startedAt: '2026-09-16T00:00:00.000Z', finishedAt: '2026-09-16T00:00:00.000Z' };
function fixture(t, timeoutMs = 1000) {
  const connect = t.mock.method(DaemonClient.prototype, 'connect', async () => {});
  const info = t.mock.method(DaemonClient.prototype, 'getLastServerInfoMessage', () => ({ serverId: 'fixture', version: '0.8.0' }));
  const rpc = t.mock.method(DaemonClient.prototype, 'invokePluginRpc', async () => ({ ok: true, data: run }));
  const close = t.mock.method(DaemonClient.prototype, 'close', async () => {});
  const api = createPaseoRuntime({ targetId: 'test', endpoint: 'ws://127.0.0.1/ws', expectedServerId: 'fixture', timeoutMs }).modules;
  return { api, connect, info, rpc, close };
}
test('Module RPC validates server identity before sending and cleans up all calls', async t => {
  const f = fixture(t);
  assert.deepEqual(await f.api.execute(input), run);
  assert.deepEqual(f.rpc.mock.calls[0].arguments, ['worknaru-agent-service', 'modules.execute', { operation: 'execute', input }]);
  f.info.mock.mockImplementation(() => ({ serverId: 'different', version: '0.8.0' }));
  await assert.rejects(f.api.execute(input), { code: 'target_mismatch' });
  f.info.mock.mockImplementation(() => ({ serverId: 'fixture', version: '0.9' }));
  await assert.rejects(f.api.execute(input), { code: 'unsupported_version' });
  assert.equal(f.rpc.mock.callCount(), 1);
  assert.equal(f.close.mock.callCount(), 3);
});
test('Module RPC rejects malformed or unrelated results and redacts remote failures', async t => {
  const f = fixture(t);
  for (const data of [
    { ...run, requestId: crypto.randomUUID() }, { ...run, moduleId: 'other' },
    { ...run, input: { text: 'other' } }, { ...run, context: { ...run.context, workspaceId: crypto.randomUUID() } },
    { ...run, status: 'succeeded', result: null }, { ...run, status: 'running' },
    { ...run, finishedAt: 'bad' }, { ...run, error: { code: 'execution_failed', message: 'secret' } },
  ]) {
    f.rpc.mock.mockImplementation(async () => ({ ok: true, data }));
    await assert.rejects(f.api.execute(input), { code: 'invalid_response' });
  }
  f.rpc.mock.mockImplementation(async () => ({ ok: true, data: [run] }));
  await assert.rejects(f.api.listRuns({ target: { type: 'project', projectId: crypto.randomUUID() } }), { code: 'invalid_response' });
  f.rpc.mock.mockImplementation(async () => ({ ok: true, data: run }));
  await assert.rejects(f.api.getRun({ id: crypto.randomUUID() }), { code: 'invalid_response' });
  f.rpc.mock.mockImplementation(async () => ({ ok: false, error: { code: 'storage_error', message: 'private SQL filename' } }));
  await assert.rejects(f.api.execute(input), error => error.code === 'storage_error' && !error.message.includes('private'));
});
test('a single total deadline prevents late connections from submitting and never retries execution', async t => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 0 });
  const f = fixture(t, 100);
  let release;
  f.connect.mock.mockImplementation(() => new Promise(resolve => { release = resolve; }));
  const call = f.api.execute(input);
  const rejected = assert.rejects(call, { code: 'timeout' });
  t.mock.timers.tick(101); await rejected;
  release(); await setImmediate();
  assert.equal(f.rpc.mock.callCount(), 0);
  f.connect.mock.mockImplementation(async () => {});
  f.rpc.mock.mockImplementation(() => new Promise(() => {}));
  const sent = f.api.execute(input);
  const timedOut = assert.rejects(sent, { code: 'timeout' });
  await setImmediate(); t.mock.timers.tick(101); await timedOut;
  assert.equal(f.rpc.mock.callCount(), 1);
  assert.equal(f.close.mock.callCount(), 2);
});
