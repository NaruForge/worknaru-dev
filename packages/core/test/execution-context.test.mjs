import assert from 'node:assert/strict';
import test from 'node:test';
import { createContextResolver, WorkspaceDomainError, parseExecutionTarget, parseExecutionContext } from '../dist/index.js';
const W = '11111111-1111-4111-8111-111111111111', P = '22222222-2222-4222-8222-222222222222';
test('resolver validates existence and derives only the Project parent into an immutable snapshot', async () => {
  const calls = [];
  const resolve = createContextResolver({
    getWorkspace: async ({ id }) => { calls.push(['workspace', id]); return { id }; },
    getProject: async ({ id }) => { calls.push(['project', id]); return { id, workspaceId: W, secret: 'never copied' }; },
  });
  assert.deepEqual(await resolve({ type: 'standalone' }), { type: 'standalone', workspaceId: null, projectId: null });
  assert.deepEqual(calls, []);
  assert.deepEqual(await resolve({ type: 'workspace', workspaceId: W }), { type: 'workspace', workspaceId: W, projectId: null });
  const context = await resolve({ type: 'project', projectId: P });
  assert.deepEqual(context, { type: 'project', projectId: P, workspaceId: W });
  assert.deepEqual(calls, [['workspace', W], ['project', P], ['workspace', W]]);
  assert.throws(() => { context.workspaceId = P; }, TypeError);
});
test('invalid, contradictory and ambient inputs fail before any lookup', async () => {
  const resolve = createContextResolver({ getWorkspace: () => assert.fail(), getProject: () => assert.fail() });
  for (const input of [null, undefined, {}, [], { type: 'project', projectId: P, workspaceId: W }, { type: 'workspace', workspaceId: W, projectId: null }, { type: 'standalone', cwd: 'C:/Projects/x' }, { type: 'workspace', workspaceId: 'prefix' }, { type: 'project', projectId: P, prompt: 'text' }]) await assert.rejects(resolve(input), { code: 'invalid_input' });
  assert.throws(() => parseExecutionContext({ type: 'standalone', workspaceId: W, projectId: null }));
  assert.throws(() => parseExecutionTarget({ type: 'standalone', [Symbol('extra')]: 1 }));
});
test('missing entities, mismatched lookups and lookup failures cannot produce a snapshot', async () => {
  for (const code of ['workspace_not_found', 'project_not_found']) {
    const missing = async () => { throw new WorkspaceDomainError(code, 'Missing entity'); };
    await assert.rejects(createContextResolver({ getWorkspace: missing, getProject: missing })({ type: code === 'workspace_not_found' ? 'workspace' : 'project', ...(code === 'workspace_not_found' ? { workspaceId: W } : { projectId: P }) }), { code });
  }
  await assert.rejects(createContextResolver({ getProject: async () => ({ id: P, workspaceId: W }), getWorkspace: async () => ({ id: P }) })({ type: 'project', projectId: P }), { code: 'invalid_response' });
  await assert.rejects(createContextResolver({ getWorkspace: async () => { throw Error('private SQL/path'); } })({ type: 'workspace', workspaceId: W }), error => error.code === 'service_error' && !error.message.includes('private'));
  await assert.rejects(createContextResolver()({ type: 'project', projectId: P }), { code: 'feature_unavailable' });
});
