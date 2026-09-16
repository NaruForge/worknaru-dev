import assert from 'node:assert/strict';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { createContextResolver, WorkspaceDomainError } from '@worknaru/core';
import { createAgentService, initialAgentState } from '@worknaru/core/agent-service';
const W = '11111111-1111-4111-8111-111111111111', P = '22222222-2222-4222-8222-222222222222';
const standalone = { type: 'standalone', workspaceId: null, projectId: null };
async function fixture(t, options = {}) {
  let state = options.state ?? initialAgentState();
  const calls = [];
  const agent = { id: 'agent', name: 'Agent', cwd: 'C:/explicit-folder', managed: true, status: 'idle', turnId: null, permissions: [], archivedAt: null };
  const workspace = {
    getWorkspace: async ({ id }) => { if (id !== W) throw new WorkspaceDomainError('workspace_not_found', 'No workspace'); return { id }; },
    getProject: async ({ id }) => { if (id !== P) throw new WorkspaceDomainError('project_not_found', 'No project'); return { id, workspaceId: W }; },
  };
  const driver = { list: async () => [structuredClone(agent)], get: async () => structuredClone(agent),
    watch: async () => {}, send: async (...args) => { calls.push(args); agent.status = 'running'; agent.turnId = 'turn'; }, close: async () => {} };
  const service = createAgentService({ driver, store: { load: () => structuredClone(state), save: value => { state = structuredClone(value); }, close() {} },
    validateDirectory: async () => {}, resolveContext: options.resolver ?? createContextResolver(workspace) });
  await service.initialize(); t.after(() => service.close());
  return { service, agent, calls, workspace, state: () => structuredClone(state), send: (id, target) => service.send({ agent: 'agent', id, text: 'unchanged prompt', ...(target ? { target } : {}) }) };
}
const settle = () => delay(25);
test('legacy standalone and explicit targets reach Driver and durable request without prompt/cwd changes', async t => {
  for (const target of [undefined, { type: 'standalone' }, { type: 'workspace', workspaceId: W }, { type: 'project', projectId: P }]) {
    const f = await fixture(t); const request = await f.send('request', target); await settle();
    const expected = target?.type === 'project' ? { type: 'project', workspaceId: W, projectId: P } : target?.type === 'workspace' ? { type: 'workspace', workspaceId: W, projectId: null } : standalone;
    assert.deepEqual(request.context, expected); assert.deepEqual(f.state().requests[0].context, expected);
    assert.deepEqual(f.calls[0], ['agent', 'unchanged prompt', 'request', 'queue', expected]);
    assert.equal(Object.isFrozen(f.calls[0][4]), true); assert.equal(f.agent.cwd, 'C:/explicit-folder');
  }
});
test('bad targets and resolver failures admit no request and cause no Driver execution', async t => {
  const f = await fixture(t);
  for (const target of [{ type: 'workspace', workspaceId: P }, { type: 'project', projectId: W }, { type: 'project', projectId: P, workspaceId: W }, { type: 'standalone', cwd: f.agent.cwd }]) await assert.rejects(f.send('bad', target));
  const broken = await fixture(t, { resolver: async () => { throw Error('private path'); } });
  await assert.rejects(broken.send('bad', { type: 'project', projectId: P }), { code: 'context_unavailable' });
  await settle(); assert.deepEqual(f.calls, []); assert.deepEqual(broken.calls, []); assert.deepEqual(f.state().requests, []);
});
test('same ID reuses original snapshot without lookup; different target conflicts, including concurrent sends', async t => {
  const f = await fixture(t); const target = { type: 'project', projectId: P };
  const results = await Promise.allSettled([f.send('shared', target), f.send('shared', { type: 'workspace', workspaceId: W })]);
  assert.equal(results[0].status, 'fulfilled'); assert.equal(results[1].reason.code, 'id_conflict');
  f.workspace.getProject = () => assert.fail('Retry must use original snapshot');
  assert.deepEqual((await f.send('shared', target)).context, results[0].value.context);
  await settle(); assert.equal(f.calls.length, 1);
});
test('caller, resolver and response mutations cannot change queued context or text', async t => {
  const enter = Promise.withResolvers(), release = Promise.withResolvers();
  const resolved = { type: 'project', workspaceId: W, projectId: P };
  const f = await fixture(t, { resolver: async () => { enter.resolve(); await release.promise; return resolved; } });
  f.agent.status = 'running';
  const input = { agent: 'agent', id: 'frozen', text: 'original', target: { type: 'project', projectId: P } };
  const pending = f.service.send(input); await enter.promise; input.target.projectId = W; input.text = 'mutated'; release.resolve();
  const response = await pending; resolved.workspaceId = P; response.context.workspaceId = P;
  const list = await f.service.requests({ agent: 'agent' }); list.requests[0].context.workspaceId = P;
  const preview = await f.service.archivePreview({ agent: 'agent' }); preview.queued[0].context.projectId = W;
  assert.deepEqual(f.state().requests[0].context, { type: 'project', workspaceId: W, projectId: P });
  assert.equal(f.state().requests[0].text, 'original');
});
test('restart dispatches saved snapshot without re-resolving and preserves it on recovery', async t => {
  const first = await fixture(t); first.agent.status = 'running';
  const accepted = await first.send('saved', { type: 'project', projectId: P }); await first.service.close();
  const second = await fixture(t, { state: first.state(), resolver: () => assert.fail('Must use snapshot') });
  await settle(); assert.deepEqual(second.calls[0][4], accepted.context);
  const seed = second.state(); await second.service.close();
  const third = await fixture(t, { state: seed });
  assert.equal((await third.service.requests({ agent: 'agent' })).requests[0].state, 'uncertain');
  assert.deepEqual(third.state().requests[0].context, accepted.context); assert.deepEqual(third.calls, []);
});
test('old storage and malformed stored context fail before any execution or state write', () => {
  for (const state of [{ ...initialAgentState(), version: 1 }, { ...initialAgentState(), requests: [{ id: 'missing', state: 'queued' }] }]) {
    assert.throws(() => createAgentService({ driver: {}, store: { load: () => state, save: () => assert.fail() }, validateDirectory: () => assert.fail() }), { code: 'storage_version' });
  }
});
