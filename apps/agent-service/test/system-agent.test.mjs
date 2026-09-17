import assert from 'node:assert/strict';
import test from 'node:test';
import { createAgentService, initialAgentState } from '@worknaru/core/agent-service';

function fixture(t, initial = initialAgentState()) {
  let state = structuredClone(initial);
  const agents = new Map(); const calls = [];
  const driver = {
    list: async () => structuredClone([...agents.values()]), get: async id => structuredClone(agents.get(id)),
    options: async () => ({ available: true, models: [{ id: 'model', default: true }] }),
    create: async input => {
      calls.push(structuredClone(input));
      const agent = { ...input, id: 'separate-system-session', createId: input.id, managed: true,
        status: 'idle', turnId: null, archivedAt: null, parentId: null, permissions: [] };
      agents.set(agent.id, agent); return structuredClone(agent);
    }, watch: async () => {}, close: async () => {},
  };
  const systemAgent = { cwd: '/data/system-agent', validate: async () => {} };
  const services = [];
  const start = async () => {
    const service = createAgentService({ driver, systemAgent, validateDirectory: async () => {},
      store: { load: () => structuredClone(state), save: next => { state = structuredClone(next); }, close() {} } });
    await service.initialize(); services.push(service); return service;
  };
  t.after(async () => { for (const service of services) await service.close(); });
  return { start, driver, agents, calls, systemAgent, state: () => state };
}

test('concurrent open and restart reuse a distinct System Agent without sending a message', async t => {
  const f = fixture(t);
  f.agents.set('developer', { id: 'developer', name: 'System Agent', managed: true, cwd: '/checkout', permissions: [], archivedAt: null });
  const before = structuredClone(f.agents.get('developer'));
  const first = await f.start();
  const opened = await Promise.all(Array.from({ length: 8 }, () => first.openSystem()));
  assert.ok(opened.every(a => a.id === 'separate-system-session' && a.role === 'system'));
  assert.equal(f.calls.length, 1);
  assert.deepEqual(Object.keys(f.calls[0]).sort(), ['cwd', 'id', 'model', 'name', 'role']);
  await first.close();
  assert.equal((await (await f.start()).openSystem()).id, opened[0].id);
  assert.equal(f.calls.length, 1);
  assert.deepEqual(f.agents.get('developer'), before);
  assert.deepEqual(f.state().requests, []);
});

test('lost creation acknowledgement recovers from matching labels, absent results do not retry', async t => {
  const f = fixture(t); const create = f.driver.create;
  f.driver.create = async input => { await create(input); throw Error('lost response'); };
  const service = await f.start();
  await assert.rejects(service.openSystem(), /lost response/);
  assert.equal((await service.openSystem()).id, 'separate-system-session');
  assert.equal(f.calls.length, 1);
  f.agents.clear();
  await assert.rejects(service.openSystem(), { code: 'creation_uncertain' });
  assert.equal(f.calls.length, 1);
});

test('existing v2 normal creation IDs remain independent of the internal System Agent ID', async t => {
  for (const acknowledged of [true, false]) await t.test(acknowledged ? 'acknowledged creation' : 'lost acknowledgement', async t => {
    const input = { id: 'worknaru-system-agent', name: 'Existing normal Agent', cwd: '/checkout', model: 'model' };
    const initial = initialAgentState();
    assert.equal(initial.version, 2);
    initial.creations[input.id] = { signature: JSON.stringify([input.name, input.cwd, input.model]), agentId: acknowledged ? 'existing-normal' : null };
    const f = fixture(t, initial);
    const normal = { ...input, id: 'existing-normal', createId: input.id, managed: true, permissions: [], archivedAt: null };
    f.agents.set(normal.id, structuredClone(normal));
    const service = await f.start();
    const system = await service.openSystem();
    assert.equal(system.createId, 'worknaru:system-agent');
    assert.notEqual(system.id, normal.id);
    assert.deepEqual(f.state().creations[input.id], initial.creations[input.id]);
    assert.deepEqual(await service.create(input), normal);
    await service.close();
    const restarted = await f.start();
    assert.equal((await restarted.openSystem()).id, system.id);
    assert.deepEqual(await restarted.create(input), normal);
    assert.deepEqual(f.agents.get(normal.id), normal);
    assert.equal(f.calls.length, 1);
  });
});

test('provider readiness and invalid instructions fail before reserving creation', async t => {
  const f = fixture(t); const service = await f.start();
  f.driver.options = async () => ({ available: false, models: [] });
  await assert.rejects(service.openSystem(), { code: 'provider_unavailable' });
  assert.deepEqual(f.state().creations, {});
  f.systemAgent.validate = async () => { throw Error('instructions invalid'); };
  await assert.rejects(service.openSystem(), /instructions invalid/);
  assert.equal(f.calls.length, 0);
});

test('reserved identity, supplied cwd, label mismatch and non-standalone messages are rejected', async t => {
  const f = fixture(t); const service = await f.start();
  await assert.rejects(service.openSystem({ cwd: '/checkout' }), { code: 'invalid_input' });
  await assert.rejects(service.create({ id: 'worknaru:system-agent', name: 'fake', cwd: '/checkout', model: 'model' }), { code: 'invalid_input' });
  await assert.rejects(service.create({ id: 'fake', role: 'system', name: 'fake', cwd: '/checkout', model: 'model' }), { code: 'invalid_input' });
  const opened = await service.openSystem();
  await assert.rejects(service.send({ agent: opened.id, id: 'context', text: 'hello', target: { type: 'workspace', workspaceId: '11111111-1111-4111-8111-111111111111' } }), { code: 'invalid_input' });
  await assert.rejects(service.archivePreview({ agent: opened.id }), { code: 'system_agent_archive' });
  f.agents.get(opened.id).role = undefined;
  await assert.rejects(service.openSystem(), { code: 'system_agent_conflict' });
  assert.equal(f.calls.length, 1);
});
