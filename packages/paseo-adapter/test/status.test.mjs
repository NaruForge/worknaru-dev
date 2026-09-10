import assert from 'node:assert/strict';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import test from 'node:test';
import { WebSocketServer } from 'ws';
import { createPaseoRuntime, SUPPORTED_PASEO_VERSION } from '../dist/index.js';
import { createStatusWebSocket } from '../dist/status-websocket.js';
import { DaemonClient } from '@getpaseo/client/internal/daemon-client';

const serverId = 'srv_test_worknaru';
const secret = 'test-only-password';
const optionsFor = endpoint => ({ targetId: 'test-daemon', endpoint, expectedServerId: serverId, timeoutMs: 1000 });

// Real pinned SDK over loopback WebSocket; no mocked SDK methods or provider processes.
// The frames follow the pinned Paseo protocol. Keep this fixture independent of
// adapter output so it can catch changes in SDK parsing and connection cleanup.
async function withDaemon(behavior, verify) {
  const wss = new WebSocketServer({ host: '127.0.0.1', port: 0 });
  const connected = new Set();
  const commands = [];
  let connectionCount = 0;
  wss.on('connection', socket => {
    connected.add(socket);
    connectionCount++;
    socket.on('close', () => connected.delete(socket));
    const send = message => socket.send(JSON.stringify({ type: 'session', message }));
    if (behavior.closeReason) {
      socket.close(4401, behavior.closeReason);
      return;
    }
    socket.on('message', bytes => {
      const envelope = JSON.parse(bytes.toString());
      if (envelope.type === 'hello') {
        if (!behavior.silentConnect) send({
          type: 'status', payload: {
            status: 'server_info', serverId, version: SUPPORTED_PASEO_VERSION,
            ...behavior.serverInfo,
          },
        });
        return;
      }
      if (envelope.type !== 'session') return;
      const message = envelope.message;
      commands.push(message.type);
      if (message.type !== 'daemon.get_status.request' || behavior.silentStatus) return;
      if (behavior.rpcError) {
        send({ type: 'rpc_error', payload: { requestId: message.requestId, error: secret, code: 'unexpected_failure' } });
      } else {
        send({
          type: 'daemon.get_status.response', payload: behavior.malformedStatus
            ? { requestId: message.requestId, serverId }
            : {
              requestId: message.requestId, serverId, version: SUPPORTED_PASEO_VERSION,
              pid: 1234, nodePath: '/fixture/private/node', startedAt: '2026-09-10T00:00:00.000Z',
              listen: '127.0.0.1:0', providers: [{ provider: 'fixture', available: false, error: secret }],
              ...behavior.detail,
            },
        });
      }
    });
  });
  await once(wss, 'listening');
  const endpoint = `ws://127.0.0.1:${wss.address().port}/ws`;
  try {
    await verify({ endpoint, commands, get connectionCount() { return connectionCount; } });
    const deadline = Date.now() + 1000;
    while (connected.size && Date.now() < deadline) await delay(10);
    assert.equal(connected.size, 0, 'Probe must close all of its sockets before test teardown');
    assert.ok(commands.every(command => command === 'daemon.get_status.request'), 'Read-only status probe issued another RPC');
  } finally {
    for (const socket of wss.clients) socket.terminate();
    await new Promise(resolve => wss.close(resolve));
  }
}

test('status returns Worknaru data, strips SDK fields and closes its connection', async () => {
  await withDaemon({}, async ({ endpoint, commands }) => {
    const result = await createPaseoRuntime({ ...optionsFor(endpoint), password: secret }).getDaemonStatus();
    assert.equal(result.outcome, 'available');
    assert.equal(result.failure, null);
    assert.deepEqual(result.server, { id: serverId, version: SUPPORTED_PASEO_VERSION });
    assert.deepEqual(result.target, { id: 'test-daemon', endpoint, expectedServerId: serverId });
    assert.equal(result.connection, 'connected');
    assert.equal(result.localProcess, 'unknown');
    assert.ok(Number.isFinite(Date.parse(result.checkedAt)));
    assert.ok(!JSON.stringify(result).includes(secret));
    assert.ok(!JSON.stringify(result).includes('nodePath'));
    assert.deepEqual(commands, ['daemon.get_status.request']);
  });
});

test('identity mismatch stops before requesting status', async () => {
  await withDaemon({ serverInfo: { serverId: 'srv_other' } }, async ({ endpoint, commands }) => {
    const result = await createPaseoRuntime(optionsFor(endpoint)).getDaemonStatus();
    assert.equal(result.failure.code, 'target_mismatch');
    assert.equal(result.failure.stage, 'identity');
    assert.equal(result.server.id, 'srv_other');
    assert.deepEqual(commands, []);
  });
});

test('an unverified daemon version stops before the status RPC', async () => {
  await withDaemon({ serverInfo: { version: '0.9.0' } }, async ({ endpoint, commands }) => {
    const result = await createPaseoRuntime(optionsFor(endpoint)).getDaemonStatus();
    assert.equal(result.failure.code, 'unsupported_version');
    assert.equal(result.server.version, '0.9.0');
    assert.deepEqual(commands, []);
  });
});

test('status identity and version must agree with the handshake', async t => {
  for (const [detail, code] of [
    [{ serverId: 'srv_other' }, 'target_mismatch'],
    [{ version: '0.9.0' }, 'invalid_response'],
  ]) await t.test(code, async () => {
    await withDaemon({ detail }, async ({ endpoint }) => {
      const result = await createPaseoRuntime(optionsFor(endpoint)).getDaemonStatus();
      assert.equal(result.failure.code, code);
      assert.equal(result.failure.stage, 'status');
    });
  });
});

test('missing version stays unknown and does not pass the compatibility check', async () => {
  await withDaemon({ serverInfo: { version: undefined }, detail: { version: null } }, async ({ endpoint }) => {
    const result = await createPaseoRuntime(optionsFor(endpoint)).getDaemonStatus();
    assert.equal(result.server.version, null);
    assert.equal(result.failure.code, 'unsupported_version');
  });
});

test('known authentication close reasons map to separate failures', async t => {
  for (const [closeReason, code] of [
    ['Password required', 'authentication_required'],
    ['Incorrect password', 'authentication_failed'],
  ]) await t.test(code, async () => {
    await withDaemon({ closeReason }, async ({ endpoint }) => {
      const result = await createPaseoRuntime({ ...optionsFor(endpoint), password: secret }).getDaemonStatus();
      assert.equal(result.outcome, 'unavailable');
      assert.equal(result.failure.code, code);
      assert.equal(result.server, null);
      assert.equal(result.localProcess, 'unknown');
      assert.ok(!JSON.stringify(result).includes(secret));
    });
  });
});

test('silent handshake and silent status are bounded and cleaned up', async t => {
  for (const stage of ['connect', 'status']) await t.test(stage, async () => {
    await withDaemon({ silentConnect: stage === 'connect', silentStatus: stage === 'status' }, async context => {
      const start = Date.now();
      const result = await createPaseoRuntime({ ...optionsFor(context.endpoint), timeoutMs: 100 }).getDaemonStatus();
      assert.equal(result.failure.code, 'timeout');
      assert.equal(result.failure.stage, stage);
      assert.ok(Date.now() - start < 1500, 'Probe ignored its time budget');
      assert.equal(context.connectionCount, 1, 'Status probe must not reconnect automatically');
    });
  });
});

test('SDK-owned connect timeout closes the probe socket without relying on the outer deadline', async () => {
  await withDaemon({ silentConnect: true }, async ({ endpoint, commands }) => {
    const client = new DaemonClient({
      url: endpoint, clientId: 'timeout-regression', clientType: 'cli',
      appVersion: SUPPORTED_PASEO_VERSION, connectTimeoutMs: 100,
      reconnect: { enabled: false }, webSocketFactory: createStatusWebSocket,
      logger: { debug() {}, info() {}, warn() {}, error() {} },
    });
    try {
      await assert.rejects(client.connect(), /Connection timed out/);
      assert.deepEqual(commands, []);
    } finally {
      await client.close();
    }
  });
});

test('malformed correlated status response is not reported as a stopped daemon', async () => {
  await withDaemon({ malformedStatus: true }, async ({ endpoint }) => {
    const result = await createPaseoRuntime(optionsFor(endpoint)).getDaemonStatus();
    assert.equal(result.failure.code, 'invalid_response');
    assert.equal(result.connection, 'connected');
    assert.equal(result.localProcess, 'unknown');
  });
});

test('unrecognized server failures do not leak raw SDK errors', async t => {
  for (const [behavior, code] of [
    [{ rpcError: true }, 'request_failed'],
    [{ closeReason: `private error ${secret}` }, 'unknown'],
  ]) await t.test(code, async () => {
    await withDaemon(behavior, async ({ endpoint }) => {
      const result = await createPaseoRuntime(optionsFor(endpoint)).getDaemonStatus();
      assert.equal(result.failure.code, code);
      assert.ok(!JSON.stringify(result).includes(secret));
      assert.equal(result.localProcess, 'unknown');
    });
  });
});

test('closed endpoint returns a connection failure without fallback', async () => {
  let endpoint;
  await withDaemon({}, async context => { endpoint = context.endpoint; });
  const result = await createPaseoRuntime(optionsFor(endpoint)).getDaemonStatus();
  assert.equal(result.outcome, 'unavailable');
  assert.equal(result.failure.code, 'connection_failed');
  assert.equal(result.target.endpoint, endpoint);
  assert.equal(result.server, null);
  assert.equal(result.localProcess, 'unknown');
});

test('each concurrent probe has independent connection ownership', async () => {
  await withDaemon({}, async context => {
    const runtime = createPaseoRuntime(optionsFor(context.endpoint));
    const results = await Promise.all([runtime.getDaemonStatus(), runtime.getDaemonStatus()]);
    assert.ok(results.every(result => result.outcome === 'available'));
    assert.equal(context.connectionCount, 2);
    assert.equal(context.commands.length, 2);
  });
});

test('configuration requires an explicit target, identity and safe endpoint', () => {
  const valid = optionsFor('ws://127.0.0.1:1/ws');
  for (const change of [
    { targetId: '' }, { endpoint: '' }, { endpoint: secret }, { expectedServerId: '' },
    { endpoint: 'http://127.0.0.1/ws' }, { endpoint: `ws://user:${secret}@127.0.0.1/ws` },
    { endpoint: `ws://127.0.0.1/ws?password=${secret}` }, { endpoint: 'ws://127.0.0.1/ws#fragment' },
    { timeoutMs: 0 }, { timeoutMs: 1.1 }, { timeoutMs: Infinity }, { timeoutMs: 2147483648 },
  ]) assert.throws(() => createPaseoRuntime({ ...valid, ...change }), error => {
    assert.ok(error instanceof TypeError || error instanceof RangeError);
    assert.ok(!error.message.includes(secret));
    return true;
  });
});
