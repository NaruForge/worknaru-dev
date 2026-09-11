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
const { AgentManager } = await import(pathToFileURL(path.join(root, 'dist/server/server/agent/agent-manager.js')).href);
const serverRequire = createRequire(path.join(root, 'package.json'));
const { ActiveTurnBehaviorSchema } = await import(pathToFileURL(serverRequire.resolve('@getpaseo/protocol/messages')).href);
const logger = Object.fromEntries(['debug', 'info', 'warn', 'error', 'trace'].map(k => [k, () => {}]));

test('installed stock protocol supports native modes and rejects removed Worknaru extensions', () => {
  for (const value of ['interrupt', 'steer']) assert.equal(ActiveTurnBehaviorSchema.parse(value), value);
  for (const value of ['idle_only', 'steer_only']) assert.equal(ActiveTurnBehaviorSchema.safeParse(value).success, false);
});

function fixture({ running = true, accepted = true } = {}) {
  const calls = [];
  const agent = { provider: 'codex', activeForegroundTurnId: running ? 'turn-one' : null, activeTurnId: running ? 'turn-one' : null,
    session: { steerActiveTurn: async () => { calls.push('steer'); return { status: accepted ? 'accepted' : 'unavailable' }; } } };
  const manager = {
    getAgent: () => agent, requireSessionAgent: () => agent, hasInFlightRun: () => running,
    tryRunOutOfBand: () => false, streamAgent: async function* () { calls.push('start'); },
    runSteerAdmission: async (_agent, _turn, fn) => fn(), recordAcceptedSteer: async () => calls.push('accepted'),
    assertSteerAdmissionOwnsTurn: AgentManager.prototype.assertSteerAdmissionOwnsTurn,
    steerOrReplaceActiveTurn: AgentManager.prototype.steerOrReplaceActiveTurn,
    replaceAdmittedForegroundTurn: async () => { calls.push('replace'); return (async function* () {})(); },
  };
  return { calls, params: { agentId: crypto.randomUUID(), prompt: 'test', messageId: crypto.randomUUID(), agentManager: manager,
    agentStorage: { get: async () => ({ archivedAt: null }) }, logger } };
}

test('native steer keeps the turn when the Provider accepts the instruction', async () => {
  const f = fixture(); assert.equal((await sendPromptToAgent({ ...f.params, activeTurnBehavior: 'steer' })).disposition, 'steered');
  assert.deepEqual(f.calls, ['steer', 'accepted']);
});

test('native steer falls back to replacement when the Provider cannot steer', async () => {
  const f = fixture({ accepted: false }); assert.equal((await sendPromptToAgent({ ...f.params, activeTurnBehavior: 'steer' })).disposition, 'turn_started');
  assert.deepEqual(f.calls, ['steer', 'replace']);
});

test('queue dispatch starts an idle Agent with the ordinary native send mode', async () => {
  const f = fixture({ running: false }); await sendPromptToAgent({ ...f.params, activeTurnBehavior: 'interrupt' });
  assert.deepEqual(f.calls, ['start']);
});
