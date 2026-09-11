import assert from 'node:assert/strict';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { createAgentService, initialAgentState } from '@worknaru/core/agent-service';
import { AgentError, conversationMessages } from '@worknaru/core';

const snapshot = (id = 'agent-one', extra = {}) => ({ id, name: id, cwd: '/project', model: 'codex-model', managed: true, status: 'idle', turnId: null, archivedAt: null, permissions: [], parentId: null, ...extra });
async function fixture(t, seed = initialAgentState(), extra = {}) {
  let stored = structuredClone(seed); const listeners = new Map(); const calls = [];
  const agents = new Map([['agent-one', snapshot()]]);
  let turn = 0;
  const driver = {
    list: async () => structuredClone([...agents.values()]), get: async id => structuredClone(agents.get(id)),
    options: async () => ({ models: [{ id: 'codex-model', default: true }], available: true, defaultCwd: '/project' }),
    create: async input => { calls.push(['create', input.id]); const a = snapshot('created-agent', { name: input.name, createId: input.id }); agents.set(a.id, a); return structuredClone(a); },
    watch: async (id, fn) => { listeners.set(id, fn); },
    send: async (id, text, messageId, mode) => {
      calls.push(['send', messageId, mode]); const a = agents.get(id);
      a.turnId ??= `turn-${++turn}`; a.status = 'running';
      listeners.get(id)?.({ type: 'timeline', turnId: a.turnId, item: { type: 'user_message', clientMessageId: messageId } });
    },
    permission: async (id, input) => { calls.push(['permission', input]); agents.get(id).permissions = []; },
    archive: async id => { calls.push(['archive', id]); Object.assign(agents.get(id), { archivedAt: '2026-09-11T00:00:00Z', turnId: null, status: 'closed', permissions: [] }); },
    history: async () => ({ entries: [], epoch: 'epoch', cursor: null }), close: async () => {}, ...extra,
  };
  const service = createAgentService({ driver, store: { load: () => structuredClone(stored), save: value => { stored = structuredClone(value); }, close() {} }, validateDirectory: async () => {} });
  await service.initialize(); t.after(() => service.close());
  const call = (op, input = {}) => service.execute(op, input);
  const send = (id, mode) => call('send', { agent: 'agent-one', id, text: id, ...(mode ? { mode } : {}) });
  const finish = (type = 'turn_completed', id = 'agent-one') => { const a = agents.get(id); const turnId = a.turnId; a.turnId = null; a.status = 'idle'; listeners.get(id)?.({ type, turnId }); };
  const settle = async () => { for (let i = 0; i < 10; i++) await delay(1); };
  return { service, driver, agents, calls, call, send, finish, settle, state: () => stored, listeners };
}

test('FIFO waits for a successful turn; retry IDs and follow-up do not duplicate a send', async t => {
  const f = await fixture(t);
  await Promise.all([f.send('first'), f.send('second'), f.send('third')]); await f.settle();
  assert.deepEqual(f.calls, [['send', 'first', 'queue']]);
  await f.send('first'); await f.settle(); assert.equal(f.calls.length, 1);
  f.finish(); await f.settle(); assert.equal(f.calls[1][1], 'second');
  f.finish(); await f.settle(); assert.equal(f.calls[2][1], 'third');
  f.finish(); await f.settle(); assert.ok(f.state().requests.every(r => r.state === 'completed'));
  await assert.rejects(f.call('send', { agent: 'agent-one', id: 'first', text: 'different' }), { code: 'id_conflict' });
});

test('fast completion events received before send acknowledgement still settle the correct request', async t => {
  const f = await fixture(t); const original = f.driver.send;
  f.driver.send = async (...args) => { await original(...args); f.finish(); };
  await f.send('fast'); await f.settle(); assert.equal(f.state().requests[0].state, 'completed');
});

test('failure pauses remaining queue; explicit resume and cancel operate only on pending messages', async t => {
  const f = await fixture(t); await f.send('first'); await f.send('second'); await f.send('third'); await f.settle();
  f.finish('turn_failed'); await f.settle(); assert.equal(f.calls.length, 1); assert.equal(f.state().paused['agent-one'], true);
  await f.call('cancel', { agent: 'agent-one', id: 'second' });
  await assert.rejects(f.call('cancel', { agent: 'agent-one', id: 'first' }), { code: 'not_queued' });
  await f.call('resume', { agent: 'agent-one' }); await f.settle(); assert.equal(f.calls[1][1], 'third');
});

test('restart preserves queued messages and settings, while ambiguous accepted sends are not retried', async t => {
  const seed = initialAgentState(); seed.settings = { sendMode: 'steer', revision: 3 };
  seed.requests.push({ id: 'old', agentId: 'agent-one', text: 'old', state: 'running', mode: 'queue', turnId: 'old-turn' }, { id: 'later', agentId: 'agent-one', text: 'later', state: 'queued', mode: 'queue' });
  const f = await fixture(t, seed); await f.settle(); assert.equal(f.calls.length, 0);
  assert.equal(f.state().requests[0].state, 'uncertain'); assert.equal((await f.call('settings')).sendMode, 'steer');
  await assert.rejects(f.call('resume', { agent: 'agent-one' }), { code: 'uncertain_request' });
  await f.call('discard', { agent: 'agent-one', id: 'old' }); await f.call('resume', { agent: 'agent-one' }); await f.settle(); assert.equal(f.calls[0][1], 'later');
  const pending = initialAgentState(); pending.requests.push({ id: 'persisted', agentId: 'agent-one', text: 'persisted', state: 'queued', mode: 'queue' });
  const resumed = await fixture(t, pending); await resumed.settle(); assert.equal(resumed.calls[0][1], 'persisted');
});

test('steer keeps the current turn and rejects unavailable steering without queue or interrupt fallback', async t => {
  const f = await fixture(t); await f.send('first'); await f.settle(); const turn = f.agents.get('agent-one').turnId;
  await f.send('steering', 'steer'); await f.settle(); assert.equal(f.state().requests[1].turnId, turn);
  f.driver.send = async () => { throw new AgentError('steer_unavailable', 'queue를 선택해 주세요.'); };
  const rejected = await f.send('unavailable', 'steer'); assert.equal(rejected.state, 'failed'); assert.equal(f.agents.get('agent-one').turnId, turn);
  f.finish(); await f.settle(); assert.equal(f.state().requests[0].state, 'completed'); assert.equal(f.state().requests[1].state, 'completed');
});

test('steer defaults to a normal turn when idle and keeps the retry identity', async t => {
  const f = await fixture(t); await f.send('idle-steer', 'steer'); await f.send('idle-steer', 'steer'); await f.settle();
  assert.equal(f.calls.length, 1); assert.equal(f.calls[0][2], 'queue');
});

test('permission holds the queue; stale actions are rejected and question answers reach the driver', async t => {
  const f = await fixture(t); f.agents.get('agent-one').permissions = [{ id: 'permission', actions: [{ id: 'allow-once', behavior: 'allow' }], input: {} }];
  await f.send('pending'); await f.settle(); assert.equal(f.calls.length, 0);
  await assert.rejects(f.send('steer', 'steer'), { code: 'steer_blocked' });
  await assert.rejects(f.call('permission', { agent: 'agent-one', id: 'permission', behavior: 'allow', actionId: 'wrong' }), { code: 'invalid_input' });
  const answers = { answers: { Choice: 'First' } };
  await f.call('permission', { agent: 'agent-one', id: 'permission', behavior: 'allow', actionId: 'allow-once', answers });
  assert.deepEqual(f.calls[0][1].answers, answers);
  await assert.rejects(f.call('permission', { agent: 'agent-one', id: 'permission', behavior: 'deny' }), { code: 'permission_resolved' });
});

test('archive checks changed impact, includes children, cancels queues and rejects future sends', async t => {
  const f = await fixture(t); f.agents.set('child', snapshot('child', { parentId: 'agent-one', managed: false }));
  const preview = await f.call('archivePreview', { agent: 'agent-one' }); assert.equal(preview.agents.length, 2);
  f.agents.get('agent-one').turnId = 'external-turn';
  await assert.rejects(f.call('archive', { token: preview.token }), { code: 'archive_changed' });
  await f.send('pending'); const confirmed = await f.call('archivePreview', { agent: 'agent-one' });
  assert.equal(confirmed.queued.length, 1);
  const result = await f.call('archive', { token: confirmed.token }); assert.deepEqual(result.failed, []); assert.equal(result.archived.length, 2);
  assert.equal(f.state().requests[0].state, 'canceled');
  await assert.rejects(f.send('after'), { code: 'archived' }); assert.equal((await f.call('list', { archived: true })).length, 1);
});

test('creation identity, ambiguous names and settings revisions are checked', async t => {
  const f = await fixture(t); const input = { id: 'create-one', name: 'same', cwd: '/project', model: 'codex-model' };
  await f.call('create', input); await f.call('create', input); assert.equal(f.calls.length, 1);
  await assert.rejects(f.call('create', { ...input, name: 'different' }), { code: 'id_conflict' });
  await assert.rejects(f.call('create', { ...input, id: '__proto__' }), { code: 'invalid_input' });
  f.agents.get('agent-one').name = 'same'; await assert.rejects(f.call('show', { agent: 'same' }), { code: 'ambiguous_agent' });
  await f.call('saveSettings', { sendMode: 'steer', revision: 0 });
  await assert.rejects(f.call('saveSettings', { sendMode: 'queue', revision: 0 }), { code: 'settings_conflict' });
});

test('conversation groups assistant deltas without mixing turns or modifying source data', () => {
  const entries = [{ seq: 1, type: 'assistant_message', text: 'READY', messageId: 'reply', turnId: 'one' }, { seq: 2, type: 'assistant_message', text: '-17', messageId: 'reply', turnId: 'one' }, { seq: 3, type: 'assistant_message', text: 'NEXT', messageId: 'reply', turnId: 'two' }];
  assert.deepEqual(conversationMessages(entries).map(e => e.text), ['READY-17', 'NEXT']); assert.equal(entries[0].text, 'READY');
});

test('connection loss and timeline replacement pause accepted requests without retry', async t => {
  for (const type of ['connection_lost', 'replacement']) {
    const f = await fixture(t); await f.send('first'); await f.send('next'); await f.settle();
    f.listeners.get('agent-one')({ type }); await f.settle();
    assert.equal(f.state().requests[0].state, 'uncertain'); assert.equal(f.calls.length, 1);
    await assert.rejects(f.call('discard', { agent: 'agent-one', id: 'first' }), { code: 'busy' });
  }
});

test('missing question answers remain pending', async t => {
  const f = await fixture(t); f.agents.get('agent-one').permissions = [{ id: 'question', actions: [], input: { questions: [{ header: 'Choice' }] } }];
  await assert.rejects(f.call('permission', { agent: 'agent-one', id: 'question', behavior: 'allow' }), { code: 'invalid_input' });
  assert.equal(f.calls.length, 0);
});

test('storage write failure prevents execution and marks health unavailable', async () => {
  let fail = false, sent = false;
  const service = createAgentService({ driver: { list: async () => [snapshot()], get: async () => snapshot(), send: async () => { sent = true; }, close: async () => {} },
    store: { load: () => null, save: () => { if (fail) throw Error('disk failure'); }, close() {} }, validateDirectory: async () => {} });
  await service.initialize(); fail = true;
  await assert.rejects(service.execute('send', { agent: 'agent-one', id: 'unsaved', text: 'must not execute' }), { code: 'storage_unavailable' });
  assert.equal((await service.execute('health', {})).ready, false); assert.equal(sent, false); await service.close();
});
