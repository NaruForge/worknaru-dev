import assert from 'node:assert/strict';
import test from 'node:test';
import { WorkspaceDomainError } from '@worknaru/core';
import { run } from '../entry.mjs';
import { runWorkspace } from '../workspace-cli.mjs';
import { productConfiguration } from '../product-connection.mjs';
import { parseWorkspaceArgs } from '../workspace-arguments.mjs';

const id = '11111111-1111-4111-8111-111111111111';
const env = { WORKNARU_ENDPOINT: 'ws://127.0.0.1/ws', WORKNARU_SERVER_ID: 'fixture' };
const output = () => {
  const result = { stdout: '', stderr: '' };
  return { result, stream: { stdout: text => { result.stdout += text; }, stderr: text => { result.stderr += text; } } };
};
test('Workspace grammar accepts six explicit commands and rejects unsupported or incomplete input before configuration', async () => {
  for (const [args, operation] of [
    [['workspace', 'create', '--name', '업무'], 'createWorkspace'], [['workspace', 'list'], 'listWorkspaces'],
    [['workspace', 'show', id], 'getWorkspace'], [['project', 'create', '--workspace', id, '--name', '업무'], 'createProject'],
    [['project', 'list', '--workspace', id], 'listProjects'], [['project', 'show', id], 'getProject'],
  ]) assert.equal(parseWorkspaceArgs(args).operation, operation);
  for (const args of [
    ['workspace', 'show', 'prefix'], ['project', 'create', '--name', '업무'],
    ['workspace', 'list', '--name', '업무'], ['project', 'show', id, '--workspace', id],
    ['workspace', 'create'], ['workspace', 'list', '--json', '--json'], ['workspace', 'delete', id],
  ]) {
    const out = output();
    assert.equal(await run([...args, '--json'], { WORKNARU_ENDPOINT: '' }, out.stream), 2);
    assert.equal(JSON.parse(out.result.stdout).error.code, 'invalid_arguments');
    assert.equal(out.result.stderr, '');
  }
  const out = output();
  assert.equal(await run(['project', '--help'], { WORKNARU_ENDPOINT: '' }, out.stream), 0);
  assert.match(out.result.stdout, /project create/);
});

test('product connection flags override env; partial explicit settings never use local defaults', async () => {
  const neverLocal = () => assert.fail('Explicit settings must not discover local configuration');
  const configuration = await productConfiguration({ '--server-id': 'override', '--timeout-ms': '99' }, env, neverLocal);
  assert.equal(configuration.expectedServerId, 'override');
  assert.equal(configuration.timeoutMs, 99);
  await assert.rejects(productConfiguration({}, { WORKNARU_ENDPOINT: env.WORKNARU_ENDPOINT }, neverLocal), { code: 'invalid_configuration' });
  const local = await productConfiguration({}, {}, async () => ({ state: 'running', serverId: 'owned' }));
  assert.equal(local.expectedServerId, 'owned');
  await assert.rejects(productConfiguration({}, {}, async () => ({ state: 'stopped' })), { code: 'not_running' });
});

test('CLI uses Core results for JSON and domain failures with documented exit codes', async () => {
  const data = { id, name: '업무', createdAt: '2026-09-15T01:00:00.000Z' };
  let execute = async input => { assert.deepEqual(input, { name: '업무' }); return data; };
  const core = configuration => {
    assert.equal(configuration.expectedServerId, 'fixture');
    return { workspace: { createWorkspace: input => execute(input), getWorkspace: input => execute(input) } };
  };
  let out = output();
  assert.equal(await runWorkspace(parseWorkspaceArgs(['workspace', 'create', '--name', '업무', '--json']), env, out.stream, core), 0);
  assert.deepEqual(JSON.parse(out.result.stdout), data);
  assert.equal(out.result.stderr, '');
  for (const [code, exit] of [['workspace_not_found', 1], ['invalid_input', 2]]) {
    execute = async () => { throw new WorkspaceDomainError(code, '입력을 확인하세요.'); };
    out = output();
    assert.equal(await runWorkspace(parseWorkspaceArgs(['workspace', 'show', id, '--json']), env, out.stream, core), exit);
    assert.equal(JSON.parse(out.result.stdout).error.code, code);
  }
  out = output();
  assert.equal(await run(['workspace', 'list', '--json'], { WORKNARU_ENDPOINT: '' }, out.stream), 2);
  assert.equal(JSON.parse(out.result.stdout).error.code, 'invalid_configuration');
});
