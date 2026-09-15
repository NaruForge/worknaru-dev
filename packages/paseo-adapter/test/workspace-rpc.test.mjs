import assert from 'node:assert/strict';
import test from 'node:test';
import { setImmediate } from 'node:timers/promises';
import { DaemonClient } from '@getpaseo/client/internal/daemon-client';
import { createPaseoRuntime } from '../dist/index.js';

const workspace = { id: '11111111-1111-4111-8111-111111111111', name: '업무', createdAt: '2026-09-15T01:00:00.000Z' };
const project = { ...workspace, id: '22222222-2222-4222-8222-222222222222', workspaceId: workspace.id };
function fixture(t, timeoutMs = 1000) {
  const connect = t.mock.method(DaemonClient.prototype, 'connect', async () => {});
  const info = t.mock.method(DaemonClient.prototype, 'getLastServerInfoMessage', () => ({ serverId: 'fixture', version: '0.8.0' }));
  const rpc = t.mock.method(DaemonClient.prototype, 'invokePluginRpc', async (_, __, { operation }) => ({ ok: true,
    data: operation === 'listWorkspaces' ? [workspace] : operation === 'listProjects' ? [project] : operation.endsWith('Project') ? project : workspace,
  }));
  const close = t.mock.method(DaemonClient.prototype, 'close', async () => {});
  const api = createPaseoRuntime({ targetId: 'test', endpoint: 'ws://127.0.0.1/ws', expectedServerId: 'fixture', timeoutMs }).workspace;
  return { api, connect, info, rpc, close };
}

test('six Workspace capabilities use the existing private RPC and return public entities', async t => {
  const f = fixture(t);
  const calls = [
    ['createWorkspace', { name: '업무' }, workspace], ['listWorkspaces', {}, [workspace]],
    ['getWorkspace', { id: workspace.id }, workspace],
    ['createProject', { workspaceId: workspace.id, name: '업무' }, project],
    ['listProjects', { workspaceId: workspace.id }, [project]], ['getProject', { id: project.id }, project],
  ];
  for (const [operation, input, expected] of calls) {
    assert.deepEqual(await f.api[operation](input), expected);
    assert.deepEqual(f.rpc.mock.calls.at(-1).arguments, ['worknaru-agent-service', 'workspace.execute', { operation, input }]);
  }
  assert.equal(f.close.mock.callCount(), calls.length);
});

test('identity and version are checked before any RPC; malformed and unrelated results fail safely', async t => {
  const f = fixture(t);
  f.info.mock.mockImplementation(() => ({ serverId: 'other', version: '0.8.0' }));
  await assert.rejects(f.api.createWorkspace({ name: '업무' }), { code: 'target_mismatch' });
  f.info.mock.mockImplementation(() => ({ serverId: 'fixture', version: 'unknown' }));
  await assert.rejects(f.api.listWorkspaces(), { code: 'unsupported_version' });
  assert.equal(f.rpc.mock.callCount(), 0);
  f.info.mock.mockImplementation(() => ({ serverId: 'fixture', version: '0.8.0' }));
  for (const [operation, input, response] of [
    ['getWorkspace', { id: project.id }, { ok: true, data: workspace }],
    ['createProject', { workspaceId: project.id, name: '업무' }, { ok: true, data: project }],
    ['listProjects', { workspaceId: project.id }, { ok: true, data: [project] }],
    ['getProject', { id: workspace.id }, { ok: true, data: project }],
    ['listWorkspaces', {}, { ok: true, data: [{ ...workspace, createdAt: 'yesterday' }] }],
    ['listWorkspaces', {}, { ok: false, error: { code: 'unknown', message: 'secret' } }],
    ['listWorkspaces', {}, { ok: false }],
  ]) {
    f.rpc.mock.mockImplementation(async () => response);
    await assert.rejects(f.api[operation](input), error => error.code === 'invalid_response' && !error.message.includes('secret'));
  }
  f.rpc.mock.mockImplementation(async () => ({ ok: false, error: { code: 'workspace_not_found', message: 'private SQL filename' } }));
  await assert.rejects(f.api.getWorkspace({ id: workspace.id }), error => error.code === 'workspace_not_found' && !error.message.includes('private'));
  f.rpc.mock.mockImplementation(async () => { throw Object.assign(Error('private plugin details'), { name: 'DaemonRpcError', code: 'handler_error' }); });
  await assert.rejects(f.api.listWorkspaces(), error => error.code === 'service_error' && !error.message.includes('private'));
  assert.equal(f.close.mock.callCount(), f.connect.mock.callCount());
});

test('connect and RPC share one deadline; late connect never sends and uncertain creation never retries', async t => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 0 });
  const f = fixture(t, 100);
  let release;
  f.connect.mock.mockImplementation(() => new Promise(resolve => { release = resolve; }));
  const connecting = f.api.createWorkspace({ name: '업무' });
  const rejected = assert.rejects(connecting, { code: 'timeout' });
  t.mock.timers.tick(101);
  await rejected;
  release();
  await setImmediate();
  assert.equal(f.rpc.mock.callCount(), 0);

  const creating = f.api.createWorkspace({ name: '업무' });
  const uncertain = assert.rejects(creating, error => error.code === 'timeout' && error.message.includes('생성됐을 수'));
  t.mock.timers.tick(60);
  f.rpc.mock.mockImplementation(() => new Promise(() => {}));
  release();
  await setImmediate();
  assert.equal(f.rpc.mock.callCount(), 1);
  t.mock.timers.tick(41);
  await uncertain;
  t.mock.timers.tick(1000);
  assert.equal(f.rpc.mock.callCount(), 1);
  assert.equal(f.close.mock.callCount(), 2);
});
