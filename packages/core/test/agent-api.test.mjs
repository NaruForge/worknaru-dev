import assert from 'node:assert/strict';
import test from 'node:test';
import { createWorknaruCore } from '../dist/index.js';

test('named capabilities report missing features while status-only runtimes stay usable', async () => {
  const core = createWorknaruCore({ runtime: { getDaemonStatus: async () => ({ outcome: 'available' }) } });
  assert.equal((await core.getDaemonStatus()).outcome, 'available');
  assert.equal(typeof core.agents, 'object'); assert.equal(core.agents.execute, undefined);
  assert.throws(() => core.agents.list(), { code: 'feature_unavailable' });
  await assert.rejects(core.workspace.listWorkspaces(), { code: 'feature_unavailable' });
});
