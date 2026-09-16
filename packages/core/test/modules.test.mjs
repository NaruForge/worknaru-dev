import assert from 'node:assert/strict';
import test from 'node:test';
import { createWorknaruCore } from '../dist/index.js';

test('Core exposes Module operations through the injected Runtime only', async () => {
  const missing = createWorknaruCore({ runtime: {} });
  await assert.rejects(missing.modules.list(), { code: 'feature_unavailable' });
  const calls = [];
  const core = createWorknaruCore({ runtime: { modules: Object.fromEntries(['list', 'execute', 'getRun', 'listRuns'].map(operation =>
    [operation, async input => { calls.push([operation, input]); return operation; }])) } });
  for (const operation of ['list', 'execute', 'getRun', 'listRuns']) assert.equal(await core.modules[operation]({ test: operation }), operation);
  assert.deepEqual(calls.map(call => call[0]), ['list', 'execute', 'getRun', 'listRuns']);
});
