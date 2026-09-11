import assert from 'node:assert/strict';
import test from 'node:test';
import { startAgents } from '../src/agents.ts';

// Exercise the real form handlers without a Provider, browser process or timers advancing.
async function screen(t, states) {
  const previous = Object.fromEntries(['document', 'window', 'location'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const elements = new Map(); const events = new Map(); const sent = [];
  const element = () => ({ value: '', textContent: '', disabled: false, checked: false, children: [],
    scrollHeight: 0, scrollTop: 0, clientHeight: 0,
    get childElementCount() { return this.children.length; },
    focus() {}, close() {}, setAttribute() {}, querySelectorAll() { return []; },
    append(...items) { this.children.push(...items); }, replaceChildren(...items) { this.children = items; } });
  const el = id => { if (!elements.has(id)) elements.set(id, element()); return elements.get(id); };
  globalThis.document = { hidden: true, getElementById: el, querySelectorAll: () => [], createElement: element };
  globalThis.window = { addEventListener: (name, callback) => events.set(name, callback) };
  globalThis.location = { hash: '' };
  t.after(() => {
    events.get('pagehide')?.();
    for (const [key, descriptor] of Object.entries(previous)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
    }
  });
  const agent = { id: 'agent-one', name: 'Test', archivedAt: null, status: 'idle', permissions: [] };
  let recorded = null;
  await startAgents({ agents: {
    create: async () => agent, list: async () => [agent], show: async () => agent,
    settings: async () => ({ sendMode: 'queue', revision: 0 }), history: async () => ({ epoch: 'a', cursor: null, entries: [] }),
    requests: async () => ({ requests: recorded ? [recorded] : [], paused: false }), resume: async () => ({ resumed: true }),
    send: async input => {
      sent.push({ ...input }); const state = states.shift();
      if (state instanceof Error) throw state;
      recorded = { ...input, state }; return recorded;
    },
  } });
  await el('create-form').onsubmit({ preventDefault() {} });
  el('message').value = 'Please continue'; el('send-mode').value = 'queue';
  return { el, sent, submit: () => el('send-form').onsubmit({ preventDefault() {} }),
    async refreshAs(state) { recorded.state = state; document.hidden = false; await el('resume-queue').onclick(); } };
}

test('failed sends retain the draft and an explicit retry gets a new request ID', async t => {
  const ui = await screen(t, ['failed', 'queued']); await ui.submit();
  assert.equal(ui.el('message').value, 'Please continue');
  await ui.submit(); assert.notEqual(ui.sent[0].id, ui.sent[1].id); assert.equal(ui.el('message').value, '');
});

test('a canceled uncertain request is never shown as accepted and can be sent anew', async t => {
  const ui = await screen(t, ['uncertain', 'canceled', 'queued']); await ui.submit(); await ui.submit();
  assert.equal(ui.sent[0].id, ui.sent[1].id); assert.equal(ui.el('message').value, 'Please continue');
  assert.match(ui.el('agent-notice').textContent, /취소/); assert.doesNotMatch(ui.el('agent-notice').textContent, /대기열에 추가/);
  await ui.submit(); assert.notEqual(ui.sent[1].id, ui.sent[2].id); assert.equal(ui.el('message').value, '');
});

test('refresh observes CLI discard before submitting the same draft as a new request', async t => {
  const ui = await screen(t, ['uncertain', 'queued']); await ui.submit(); await ui.refreshAs('canceled');
  await ui.submit(); assert.notEqual(ui.sent[0].id, ui.sent[1].id); assert.equal(ui.el('message').value, '');
});

test('lost acknowledgement and uncertain state reuse the ID until acceptance is known', async t => {
  const ui = await screen(t, [Error('transport lost'), 'uncertain', 'running']);
  await ui.submit(); await ui.submit(); assert.equal(ui.el('message').value, 'Please continue');
  await ui.submit(); assert.equal(new Set(ui.sent.map(s => s.id)).size, 1); assert.equal(ui.el('message').value, '');
});
