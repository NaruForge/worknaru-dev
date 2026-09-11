// Opt-in: creates real Codex sessions and incurs Provider usage. Own data only.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';
import { root } from '../../../packages/dev-environment/paths.mjs';
import { portOpen } from '../local-support.mjs';

const exec = promisify(execFile);
test('real Codex lifecycle, FIFO, permission acknowledgement, restart and archive', { skip: process.platform !== 'win32', timeout: 300000 }, async t => {
  assert.equal(await portOpen(), false, 'Stop the development environment before pnpm agent:verify.');
  const parent = path.join(root, '.local/agent-integration'); await mkdir(parent, { recursive: true });
  const folder = await mkdtemp(path.join(parent, 'run-')); const data = path.join(folder, 'data'); const project = path.join(folder, 'project'); await mkdir(project);
  await writeFile(path.join(project, 'keep.txt'), 'Archive must preserve this file.');
  const env = { ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^WORKNARU_/i.test(key))), WORKNARU_DATA_DIR: data };
  const cli = async (...args) => {
    let result;
    try { result = { code: 0, ...await exec(process.execPath, [path.join(root, 'apps/cli/bin/worknaru.mjs'), ...args, '--json'], { cwd: root, env, windowsHide: true, timeout: 120000, maxBuffer: 4 * 1024 * 1024 }) }; }
    catch (error) { if (typeof error.code !== 'number') throw error; result = error; }
    assert.equal(result.stderr, ''); return { code: result.code, data: JSON.parse(result.stdout) };
  };
  const success = async (...args) => { const r = await cli(...args); assert.equal(r.code, 0, JSON.stringify(r.data)); return r.data; };
  let started = false;
  t.after(async () => { if (started) await success('dev', 'stop'); });
  await success('agent', 'setup'); await success('dev', 'start'); started = true;
  const id = (await readFile(path.join(data, 'server-id'), 'utf8')).trim();
  const create = ['agent', 'create', '--name', 'Integration Agent', '--cwd', project, '--id', 'integration-create'];
  const agent = await success(...create); assert.equal((await success(...create)).id, agent.id);
  await success('agent', 'send', agent.id, 'Remember ORCHID as our test word. Reply only ORCHID. Do not use tools.', '--id', 'integration-first', '--queue', '--no-wait');
  const second = await success('agent', 'send', agent.id, 'What test word did I tell you? Reply only that word followed by FOLLOWUP. Do not use tools.', '--id', 'integration-second', '--queue', '--no-wait');
  assert.equal(second.state, 'queued');
  const done = await success('agent', 'wait', agent.id, '--request', 'integration-second', '--wait-timeout', '90');
  assert.equal(done.request.state, 'completed'); assert.match(done.entries.map(e => e.text).join(''), /ORCHID.*FOLLOWUP/s);
  const queue = await success('agent', 'queue', 'list', agent.id); assert.ok(queue.requests.every(r => r.state === 'completed'));
  assert.notEqual(queue.requests[0].turnId, queue.requests[1].turnId);
  await success('settings', 'set', 'send-mode', 'steer');
  await success('dev', 'stop'); started = false; await success('dev', 'start'); started = true;
  assert.equal((await readFile(path.join(data, 'server-id'), 'utf8')).trim(), id);
  assert.equal((await success('settings', 'get', 'send-mode')).sendMode, 'steer');
  assert.equal((await success('agent', 'queue', 'list', agent.id)).requests.length, 2);
  const prompt = 'Permission test: use your shell tool with sandbox_permissions=require_escalated and justification "Allow printing PERMISSION-17 for the test?" to run only Write-Output PERMISSION-17. Do not run other commands. Wait for approval, then reply PERMISSION-17.';
  const waiting = await cli('agent', 'send', agent.id, prompt, '--id', 'integration-permission', '--queue', '--wait-timeout', '90');
  assert.equal(waiting.code, 1); assert.equal(waiting.data.outcome, 'permission_pending');
  const permission = waiting.data.permissions[0]; assert.equal(permission.kind, 'tool');
  await success('agent', 'permission', 'respond', agent.id, permission.id, '--allow');
  assert.equal((await success('agent', 'wait', agent.id, '--request', 'integration-permission', '--wait-timeout', '60')).request.state, 'completed');
  const preview = await cli('agent', 'archive', agent.id); assert.equal(preview.code, 1); assert.equal(preview.data.confirmationRequired, true);
  assert.deepEqual((await success('agent', 'archive', agent.id, '--yes')).failed, []);
  assert.equal((await success('agent', 'list')).length, 0); assert.equal((await success('agent', 'list', '--archived'))[0].id, agent.id);
  assert.ok((await success('agent', 'history', agent.id, '--all')).entries.length);
  assert.equal((await cli('agent', 'send', agent.id, 'must not run', '--no-wait')).data.error.code, 'archived');
  assert.equal(await readFile(path.join(project, 'keep.txt'), 'utf8'), 'Archive must preserve this file.');
  t.diagnostic(`Evidence retained under ${path.relative(root, folder)}; Provider data is local only.`);
});
