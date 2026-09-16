import assert from 'node:assert/strict';
import test from 'node:test';
import { DaemonClient } from '@getpaseo/client/internal/daemon-client';
import { connectAgentDriver } from '../src/agent-driver.mjs';

test('Driver accepts structured context while preserving SDK message and rejects malformed context before send', async t => {
  const proto = DaemonClient.prototype;
  const sends = [];
  const methods = {
    connect: async () => {}, close: async () => {},
    getLastServerInfoMessage: () => ({ serverId: 'fixture', version: '0.8.0' }),
    subscribe: () => () => {}, subscribeConnectionStatus: () => () => {},
    sendAgentMessage: async (...args) => { sends.push(args); },
  };
  for (const [name, fn] of Object.entries(methods)) {
    const original = Object.getOwnPropertyDescriptor(proto, name);
    Object.defineProperty(proto, name, { configurable: true, writable: true, value: fn });
    t.after(() => { if (original) Object.defineProperty(proto, name, original); else delete proto[name]; });
  }
  const connected = Object.getOwnPropertyDescriptor(proto, 'isConnected');
  Object.defineProperty(proto, 'isConnected', { configurable: true, get: () => true });
  t.after(() => { if (connected) Object.defineProperty(proto, 'isConnected', connected); else delete proto.isConnected; });
  const driver = await connectAgentDriver({ endpoint: 'ws://127.0.0.1:1/ws', serverId: 'fixture' });
  t.after(() => driver.close());
  const context = { type: 'project', projectId: '11111111-1111-4111-8111-111111111111', workspaceId: '22222222-2222-4222-8222-222222222222' };
  await driver.send('agent', 'original prompt', 'request', 'queue', context);
  assert.deepEqual(sends, [['agent', 'original prompt', { messageId: 'request', activeTurnBehavior: 'interrupt' }]]);
  assert.throws(() => driver.send('agent', 'must not send', 'bad', 'queue', { ...context, workspaceId: null }), { code: 'invalid_input' });
  assert.equal(sends.length, 1);
});
