import assert from 'node:assert/strict';
import test from 'node:test';
import { run } from '../entry.mjs';
import { parseModuleArgs } from '../module-arguments.mjs';
import { runModules } from '../module-cli.mjs';
import { ModuleError } from '@worknaru/core';

const id = crypto.randomUUID();
const env = { WORKNARU_ENDPOINT: 'ws://127.0.0.1/ws', WORKNARU_SERVER_ID: 'fixture' };
const command = ['module', 'run', 'text-stats', '--text', '', '--request-id', id, '--standalone', '--json'];
function output() { const value = { stdout: '', stderr: '' }; return { value, stdout: text => { value.stdout += text; }, stderr: text => { value.stderr += text; } }; }
test('Module CLI requires one explicit target and a stable request ID before connecting', async () => {
  assert.deepEqual(parseModuleArgs(command).input, { moduleId: 'text-stats', requestId: id, input: { text: '' }, target: { type: 'standalone' } });
  for (const args of [
    ['module', 'run', 'text-stats', '--text', 'hi', '--standalone'], ['run', 'list'], ['run', 'show', 'prefix'],
    [...command, '--project', id], ['module', 'list', '--standalone'], ['module', 'delete', 'text-stats'],
  ]) {
    const out = output();
    assert.equal(await run([...args.filter(value => value !== '--json'), '--json'], {}, out), 2);
    assert.equal(JSON.parse(out.value.stdout).error.code, 'invalid_arguments');
  }
  assert.throws(() => parseModuleArgs([...command, '--json']));
  const out = output();
  assert.equal(await run(['module', '--help'], { WORKNARU_ENDPOINT: '' }, out), 0);
  assert.match(out.value.stdout, /request-id/);
});
test('Module CLI calls Core and emits one JSON document with meaningful exit status', async () => {
  for (const status of ['succeeded', 'running', 'failed', 'uncertain']) {
    const out = output();
    assert.equal(await runModules(parseModuleArgs(command), env, out, () => ({ modules: { execute: async input => {
      assert.equal(input.requestId, id); return { id, status };
    } } })), ['failed', 'uncertain'].includes(status) ? 1 : 0);
    assert.deepEqual(JSON.parse(out.value.stdout), { id, status });
    assert.equal(out.value.stderr, '');
  }
  const out = output();
  assert.equal(await runModules(parseModuleArgs(command), env, out, () => ({ modules: { execute: async () => { throw new ModuleError('request_conflict', 'Different input'); } } })), 2);
  assert.equal(JSON.parse(out.value.stdout).error.code, 'request_conflict');
});
