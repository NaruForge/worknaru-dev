import assert from 'node:assert/strict';
import test from 'node:test';
import { parseAgentArgs, format, requestReply } from '../agent-cli.mjs';

test('Agent flags reject ambiguous send modes, duplicate options and missing values', () => {
  for (const args of [['--queue', '--steer'], ['--id', 'a', '--id', 'b'], ['--allow', '--deny'], ['--cwd'], ['--wait-timeout', '0']]) assert.throws(() => parseAgentArgs(['agent', 'send', ...args]));
  assert.deepEqual(parseAgentArgs(['agent', 'send', 'a', '한글 메시지', '--queue', '--no-wait']).positional, ['agent', 'send', 'a', '한글 메시지']);
});
test('CLI prints readable whole replies', () => {
  assert.equal(format({ entries: [{ text: '안녕', type: 'assistant_message', messageId: '1', turnId: '1' }, { text: '하세요', type: 'assistant_message', messageId: '1', turnId: '1' }] }), '[Agent] 안녕하세요\n');
});

test('permission output includes the IDs and input needed to choose a response', () => {
  const output = format([{ id: 'permission-17', kind: 'tool', title: 'Approval needed', description: 'Run command', input: { command: 'Write-Output hello' },
    actions: [{ id: 'once', label: '이번 승인', behavior: 'allow' }, { id: 'reject', label: '거부', behavior: 'deny' }] }]);
  for (const text of ['permission-17', 'Write-Output hello', '--allow --action once', '--deny --action reject']) assert.ok(output.includes(text), output);
});

test('wait reads older pages to recover a whole reply beyond the latest history window', async () => {
  const request = { id: 'wanted', turnId: 'turn-1', state: 'completed' };
  const entries = [{ type: 'user_message', messageId: 'wanted', turnId: 'turn-1' }, ...Array.from({ length: 250 }, (_, i) => ({ type: 'assistant_message', messageId: 'reply', turnId: 'turn-1', text: `${i},` }))];
  const calls = [];
  const call = async (operation, input) => {
    assert.equal(operation, 'history'); calls.push(input.cursor);
    return input.cursor ? { epoch: 'a', cursor: null, entries: entries.slice(0, 51) } : { epoch: 'a', cursor: { epoch: 'a', seq: 51 }, entries: entries.slice(51) };
  };
  const reply = await requestReply({ history: input => call('history', input) }, 'agent-1', request);
  assert.deepEqual(calls, [undefined, { epoch: 'a', seq: 51 }]); assert.deepEqual(reply.entries, entries.slice(1));
  assert.ok(format(reply).includes('0,1,2,')); assert.ok(format(reply).includes('249,'));
});

test('wait explains an unavailable response range and never joins different history epochs', async () => {
  const request = { id: 'wanted', turnId: 'turn-1', state: 'failed', error: 'Provider failed.' };
  const call = async (_, input) => input.cursor ? { epoch: 'new', cursor: null, entries: [{ type: 'user_message', messageId: 'wanted' }, { type: 'assistant_message', turnId: 'turn-1', text: 'wrong history' }] }
    : { epoch: 'old', cursor: { epoch: 'old', seq: 51 }, entries: [] };
  const reply = await requestReply({ history: input => call('history', input) }, 'agent-1', request);
  assert.deepEqual(reply.entries, []); assert.match(format(reply), /agent history.*--all/); assert.match(format(reply), /Provider failed/);
});

test('wait stops if the server repeats a cursor value in a fresh object', async () => {
  let calls = 0;
  const reply = await requestReply({ history: async () => {
    assert.ok(++calls <= 2, 'Repeated cursor must not loop forever');
    return { epoch: 'a', cursor: { epoch: 'a', seq: 51 }, entries: [] };
  } }, 'agent-1', { id: 'missing', turnId: 'turn-1', state: 'completed' });
  assert.equal(calls, 2); assert.match(format(reply), /agent history.*--all/);
});
