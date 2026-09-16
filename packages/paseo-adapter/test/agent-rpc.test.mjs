import assert from 'node:assert/strict';
import { once } from 'node:events';
import test from 'node:test';
import { WebSocketServer } from 'ws';
import { createPaseoRuntime, SUPPORTED_PASEO_VERSION } from '../dist/index.js';

// Exercise the real SDK parser and Agent RPC identity gate, not the status probe.
test('Agent create and send reach only the verified server identity', async t => {
  const wss = new WebSocketServer({ host: '127.0.0.1', port: 0 });
  const commands = [];
  let serverId = 'server-before-reset';
  let responseOverride;
  wss.on('connection', socket => {
    const identity = serverId;
    const send = message => socket.send(JSON.stringify({ type: 'session', message }));
    socket.on('message', bytes => {
      const envelope = JSON.parse(bytes.toString());
      if (envelope.type === 'hello') {
        send({ type: 'status', payload: { status: 'server_info', serverId: identity, version: SUPPORTED_PASEO_VERSION } });
      } else if (envelope.type === 'session') {
        const message = envelope.message;
        commands.push({ serverId: identity, ...message });
        const data = responseOverride ?? { observed: message.input.operation, ...(message.input.operation === 'send' ? { id: message.input.input.id, text: message.input.input.text, context: { type: 'standalone', workspaceId: null, projectId: null } } : {}) };
        send({ type: 'plugin.rpc.invoke.response', payload: { requestId: message.requestId, output: { ok: true, data } } });
      }
    });
  });
  await once(wss, 'listening');
  t.after(async () => {
    for (const socket of wss.clients) socket.terminate();
    await new Promise(resolve => wss.close(resolve));
  });
  const options = { targetId: 'fixture', endpoint: `ws://127.0.0.1:${wss.address().port}/ws`, expectedServerId: serverId, timeoutMs: 1000 };
  const old = createPaseoRuntime(options).agents;
  const create = { id: 'create-one', name: 'Wire fixture', cwd: 'C:\\Fixture', model: 'fixture' };
  const message = { agent: 'fixture-agent', id: 'send-one', text: 'Wire only' };
  assert.deepEqual(await old.create(create), { observed: 'create' });
  assert.equal((await old.send(message)).observed, 'send');
  assert.deepEqual(commands.map(c => [c.type, c.pluginId, c.method, c.input.operation]), [
    ['plugin.rpc.invoke.request', 'worknaru-agent-service', 'agents.execute', 'create'],
    ['plugin.rpc.invoke.request', 'worknaru-agent-service', 'agents.execute', 'send'],
  ]);
  serverId = 'server-after-reset';
  await assert.rejects(old.create(create), { code: 'target_mismatch' });
  await assert.rejects(old.send(message), { code: 'target_mismatch' });
  assert.equal(commands.filter(c => c.serverId === serverId).length, 0);
  const fresh = createPaseoRuntime({ ...options, expectedServerId: serverId }).agents;
  assert.equal((await fresh.send(message)).observed, 'send');
  assert.deepEqual(commands.filter(c => c.serverId === serverId).map(c => c.input.operation), ['send']);
  const workspaceId = '11111111-1111-4111-8111-111111111111';
  const target = { type: 'workspace', workspaceId };
  const contextual = { ...message, target };
  responseOverride = { id: message.id, text: message.text, context: { ...target, projectId: null } };
  assert.deepEqual((await fresh.send(contextual)).context, responseOverride.context);
  assert.deepEqual(commands.at(-1).input.input.target, target);
  for (const context of [undefined, { type: 'standalone', workspaceId: null, projectId: null }, { type: 'workspace', workspaceId: 'prefix', projectId: null }, { type: 'project', projectId: workspaceId }]) {
    responseOverride = { id: message.id, text: message.text, context };
    await assert.rejects(fresh.send(contextual), { code: 'invalid_response' });
    responseOverride = { requests: [{ context }] };
    if (context?.type !== 'standalone') await assert.rejects(fresh.requests({ agent: 'agent' }), { code: 'invalid_response' });
  }
});
