import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const require = createRequire(new URL('../../../packages/dev-environment/daemon.mjs', import.meta.url));
const cliRequire = createRequire(require.resolve('@getpaseo/cli/package.json'));
let root = path.dirname(cliRequire.resolve('@getpaseo/server'));
while (!existsSync(path.join(root, 'package.json')) || JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')).name !== '@getpaseo/server') {
  const parent = path.dirname(root); assert.notEqual(root, parent); root = parent;
}
const { sendPromptToAgent } = await import(pathToFileURL(path.join(root, 'dist/server/server/agent/agent-prompt.js')).href);
const serverRequire = createRequire(path.join(root, 'package.json'));
const { ActiveTurnBehaviorSchema } = await import(pathToFileURL(serverRequire.resolve('@getpaseo/protocol/messages')).href);
const logger = Object.fromEntries(['debug', 'info', 'warn', 'error', 'trace'].map(k => [k, () => {}]));

function fixture({ running = true, permissions = [], archivedAt = null, accepted = true } = {}) {
  const calls = [];
  const manager = { getAgent: () => ({ provider: 'codex', pendingPermissions: permissions }), hasInFlightRun: () => running,
    steerAgentRun: async () => { calls.push('steer'); return { status: accepted ? 'accepted' : 'unavailable' }; },
    tryRunOutOfBand: () => false, streamAgent: async function* () { calls.push('start'); },
    replaceAgentRun: async () => { calls.push('replace'); throw Error('Must not interrupt'); },
    unarchiveSnapshot: async () => { calls.push('unarchive'); throw Error('Must not unarchive'); } };
  return { calls, params: { agentId: crypto.randomUUID(), prompt: 'test', messageId: crypto.randomUUID(), agentManager: manager, agentStorage: { get: async () => ({ archivedAt }) }, logger, clearPendingPermissions: true } };
}
test('installed protocol accepts safe admission modes', () => {
  assert.equal(ActiveTurnBehaviorSchema.parse('idle_only'), 'idle_only'); assert.equal(ActiveTurnBehaviorSchema.parse('steer_only'), 'steer_only');
});
test('installed server never replaces a busy run or silently falls back from unsupported steer', async () => {
  const busy = fixture(); await assert.rejects(sendPromptToAgent({ ...busy.params, activeTurnBehavior: 'idle_only' }), /WORKNARU_AGENT_BUSY/); assert.deepEqual(busy.calls, []);
  const unavailable = fixture({ accepted: false }); await assert.rejects(sendPromptToAgent({ ...unavailable.params, activeTurnBehavior: 'steer_only' }), /WORKNARU_STEER_UNAVAILABLE/); assert.deepEqual(unavailable.calls, ['steer']);
  const accepted = fixture(); assert.equal((await sendPromptToAgent({ ...accepted.params, activeTurnBehavior: 'steer_only' })).disposition, 'steered'); assert.deepEqual(accepted.calls, ['steer']);
});
test('installed server refuses archived, permission-pending, and changed-turn sends', async () => {
  const archived = fixture({ archivedAt: '2026-09-11' }); await assert.rejects(sendPromptToAgent({ ...archived.params, activeTurnBehavior: 'idle_only' }), /WORKNARU_AGENT_ARCHIVED/); assert.deepEqual(archived.calls, []);
  const pending = fixture({ permissions: [{}] }); await assert.rejects(sendPromptToAgent({ ...pending.params, activeTurnBehavior: 'steer_only' }), /WORKNARU_PERMISSION_PENDING/); assert.deepEqual(pending.calls, []);
  const idle = fixture({ running: false }); await assert.rejects(sendPromptToAgent({ ...idle.params, activeTurnBehavior: 'steer_only' }), /WORKNARU_TURN_CHANGED/); assert.deepEqual(idle.calls, []);
});
test('installed server starts an idle queue message once', async () => {
  const idle = fixture({ running: false }); await sendPromptToAgent({ ...idle.params, activeTurnBehavior: 'idle_only' }); assert.deepEqual(idle.calls, ['start']);
});

test('simultaneous guarded sends admit one run without replacing it', async () => {
  const f = fixture({ running: false }); let running = false;
  f.params.agentManager.hasInFlightRun = () => running;
  f.params.agentManager.streamAgent = async function* () { running = true; f.calls.push('start'); };
  const results = await Promise.allSettled([
    sendPromptToAgent({ ...f.params, activeTurnBehavior: 'idle_only' }),
    sendPromptToAgent({ ...f.params, messageId: crypto.randomUUID(), activeTurnBehavior: 'idle_only' }),
  ]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.match(results.find(r => r.status === 'rejected').reason.message, /WORKNARU_AGENT_BUSY/);
  assert.deepEqual(f.calls, ['start']);
});

test('a turn changing during strict steer never falls back to replacement', async () => {
  const f = fixture();
  f.params.agentManager.steerAgentRun = async () => { f.calls.push('steer'); throw Error('Active turn changed before steering could be delivered'); };
  await assert.rejects(sendPromptToAgent({ ...f.params, activeTurnBehavior: 'steer_only' }), /Active turn changed/);
  assert.deepEqual(f.calls, ['steer']);
});
