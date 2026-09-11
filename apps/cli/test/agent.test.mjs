import assert from 'node:assert/strict';
import test from 'node:test';
import { parseAgentArgs, format } from '../agent-cli.mjs';

test('Agent flags reject ambiguous send modes, duplicate options and missing values', () => {
  for (const args of [['--queue', '--steer'], ['--id', 'a', '--id', 'b'], ['--allow', '--deny'], ['--cwd'], ['--wait-timeout', '0']]) assert.throws(() => parseAgentArgs(['agent', 'send', ...args]));
  assert.deepEqual(parseAgentArgs(['agent', 'send', 'a', '한글 메시지', '--queue', '--no-wait']).positional, ['agent', 'send', 'a', '한글 메시지']);
});
test('CLI prints readable whole replies', () => {
  assert.equal(format({ entries: [{ text: '안녕', type: 'assistant_message', messageId: '1', turnId: '1' }, { text: '하세요', type: 'assistant_message', messageId: '1', turnId: '1' }] }), '[Agent] 안녕하세요\n');
});
