import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { once } from 'node:events';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import test from 'node:test';
import { createWorknaruCore } from '@worknaru/core';
import { createCore } from '../dist/bootstrap.js';
import { runCli } from '../dist/cli.js';

const secret = 'test-only-private-password';
const endpoint = 'ws://127.0.0.1:12345/ws';
const flags = ['status', '--endpoint', endpoint, '--server-id', 'srv_test'];
const status = {
  outcome: 'available', target: { id: 'worknaru', endpoint, expectedServerId: 'srv_test' },
  checkedAt: '2026-09-10T00:00:00.000Z', connection: 'connected', localProcess: 'unknown',
  server: { id: 'srv_test', version: 'fixture-version' }, failure: null,
};
const unavailable = {
  ...status, outcome: 'unavailable', connection: 'disconnected', server: null,
  failure: { code: 'connection_failed', stage: 'connect', message: 'The connection failed; local process state is unknown.' },
};

async function invoke(args, env = {}, factory = () => createWorknaruCore({ runtime: { async getDaemonStatus() { return status; } } })) {
  let stdout = '';
  let stderr = '';
  const code = await runCli(args, env, {
    stdout: text => { stdout += text; }, stderr: text => { stderr += text; },
  }, factory);
  return { code, stdout, stderr };
}

test('JSON status crosses Core once, with flags overriding environment and no password output', async () => {
  let calls = 0;
  let configuration;
  const result = await invoke([...flags, '--target', 'chosen', '--timeout-ms', '250', '--json'], {
    WORKNARU_ENDPOINT: 'ws://other.invalid/ws', WORKNARU_SERVER_ID: 'other',
    WORKNARU_TARGET_ID: 'other', WORKNARU_TIMEOUT_MS: 'invalid-overridden', WORKNARU_PASSWORD: secret,
  }, config => {
    configuration = config;
    return createWorknaruCore({ runtime: { async getDaemonStatus() { calls++; return status; } } });
  });
  assert.equal(calls, 1);
  assert.deepEqual(configuration, { targetId: 'chosen', endpoint, expectedServerId: 'srv_test', timeoutMs: 250, password: secret });
  assert.equal(result.code, 0);
  assert.deepEqual(JSON.parse(result.stdout), status);
  assert.equal(result.stdout.trim().split('\n').length, 1);
  assert.equal(result.stderr, '');
  assert.ok(!result.stdout.includes(secret));
});

test('environment-only configuration and defaults reach Core', async () => {
  let configuration;
  const result = await invoke(['status', '--json'], {
    WORKNARU_ENDPOINT: ` ${endpoint} `, WORKNARU_SERVER_ID: ' srv_test ',
  }, config => {
    configuration = config;
    return createWorknaruCore({ runtime: { async getDaemonStatus() { return status; } } });
  });
  assert.equal(result.code, 0);
  assert.deepEqual(configuration, { targetId: 'worknaru', endpoint, expectedServerId: 'srv_test', timeoutMs: 5000 });
});

test('unavailable results retain Runtime failure and unknown process state with exit 1', async () => {
  const factory = () => createWorknaruCore({ runtime: { async getDaemonStatus() { return unavailable; } } });
  const json = await invoke([...flags, '--json'], {}, factory);
  assert.equal(json.code, 1);
  assert.equal(json.stderr, '');
  assert.deepEqual(JSON.parse(json.stdout), unavailable);
  const human = await invoke(flags, {}, factory);
  assert.equal(human.code, 1);
  assert.match(human.stdout, /Daemon: unavailable/);
  assert.match(human.stdout, /Local process: unknown/);
  assert.match(human.stdout, /Failure: connection_failed \(connect\)/);
  assert.equal(human.stderr, '');
});

test('human status includes the target, server and observation time', async () => {
  const result = await invoke(flags);
  assert.equal(result.code, 0);
  for (const text of ['Daemon: available', endpoint, 'srv_test', status.checkedAt, 'Connection at check: connected']) {
    assert.ok(result.stdout.includes(text));
  }
  assert.equal(result.stderr, '');
});

test('help needs no configuration and does not construct Core', async () => {
  for (const args of [[], ['--help'], ['-h'], ['status', '--help'], ['status', '-h', '--json']]) {
    const result = await invoke(args, {}, () => assert.fail('Help must not construct Core'));
    assert.equal(result.code, 0);
    assert.match(result.stdout, /worknaru status/);
    assert.equal(result.stderr, '');
  }
});

test('invalid arguments produce JSON input errors without echoing unknown values or constructing Core', async () => {
  for (const args of [
    [secret, '--json'], [...flags, secret, '--json'], [...flags, '--endpoint', endpoint, '--json'],
    [...flags, '--json', '--json'], ['status', '--endpoint', '--json'],
    ['status', '--endpoint', '', '--json'], [...flags, '--password', secret, '--json'],
  ]) {
    const result = await invoke(args, {}, () => assert.fail('Invalid command must not construct Core'));
    assert.equal(result.code, 2);
    assert.equal(JSON.parse(result.stdout).error.code, 'invalid_arguments');
    assert.equal(result.stderr, '');
    assert.ok(!result.stdout.includes(secret));
  }
});

test('missing settings never fall back to Paseo environment', async () => {
  const result = await invoke(['status', '--json'], {
    PASEO_HOST: '127.0.0.1:6767', PASEO_HOME: '/private/home',
  }, () => assert.fail('Missing configuration must not construct Core'));
  assert.equal(result.code, 2);
  assert.equal(JSON.parse(result.stdout).error.code, 'invalid_configuration');
  assert.equal(result.stderr, '');
});

test('invalid timeouts and empty environment values fail before Core is constructed', async () => {
  const cases = ['0', '-1', '300001', '1.5', '1e3', 'NaN', 'Infinity', ''].map(value => ({ WORKNARU_TIMEOUT_MS: value }));
  cases.push({ WORKNARU_TARGET_ID: '' }, { WORKNARU_PASSWORD: '' });
  for (const env of cases) {
    const result = await invoke([...flags, '--json'], env, () => assert.fail('Invalid configuration must not construct Core'));
    assert.equal(result.code, 2);
    assert.equal(JSON.parse(result.stdout).error.code, 'invalid_configuration');
  }
});

test('bootstrap rejects credential-bearing or invalid endpoints with a safe configuration error', async () => {
  for (const value of ['invalid', 'https://example.com', `ws://user:${secret}@localhost/ws`, `ws://localhost/ws?token=${secret}`, `ws://localhost/ws#${secret}`]) {
    const result = await invoke(['status', '--endpoint', value, '--server-id', 'srv_test', '--json'], {}, createCore);
    assert.equal(result.code, 2);
    assert.equal(JSON.parse(result.stdout).error.code, 'invalid_configuration');
    assert.equal(result.stderr, '');
    assert.ok(!result.stdout.includes(secret));
  }
});

test('human input errors use stderr only', async () => {
  const result = await invoke(['status']);
  assert.equal(result.code, 2);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /^invalid_configuration:/);
});

test('unexpected Core errors are redacted in JSON and human output with exit 3', async () => {
  const factory = () => createWorknaruCore({ runtime: { async getDaemonStatus() { throw new Error(secret); } } });
  for (const args of [flags, [...flags, '--json']]) {
    const result = await invoke(args, {}, factory);
    assert.equal(result.code, 3);
    assert.ok(!(result.stdout + result.stderr).includes(secret));
    if (args.includes('--json')) {
      assert.equal(JSON.parse(result.stdout).error.code, 'internal_error');
      assert.equal(result.stderr, '');
    } else {
      assert.equal(result.stdout, '');
      assert.match(result.stderr, /^internal_error:/);
    }
  }
});

const exec = promisify(execFile);
const entry = fileURLToPath(new URL('../bin/worknaru.mjs', import.meta.url));
async function runProcess(args, extraEnv = {}) {
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (/^WORKNARU_/i.test(key)) delete env[key];
  try {
    const result = await exec(process.execPath, [entry, ...args], { env: { ...env, ...extraEnv }, windowsHide: true, timeout: 10000 });
    return { ...result, code: 0 };
  } catch (error) {
    if (typeof error.code !== 'number' || error.killed) throw error;
    return { stdout: error.stdout, stderr: error.stderr, code: error.code };
  }
}

test('real executable provides help and JSON input failures', async () => {
  const help = await runProcess(['--help']);
  assert.equal(help.code, 0);
  assert.match(help.stdout, /Worknaru CLI/);
  assert.equal(help.stderr, '');
  const invalid = await runProcess(['status', '--json']);
  assert.equal(invalid.code, 2);
  assert.equal(JSON.parse(invalid.stdout).error.code, 'invalid_configuration');
  assert.equal(invalid.stderr, '');
});

test('real executable uses environment configuration and reports a closed endpoint without stopping a process', async () => {
  const listener = net.createServer();
  listener.listen({ host: '127.0.0.1', port: 0 });
  await once(listener, 'listening');
  const port = listener.address().port;
  await new Promise(resolve => listener.close(resolve));
  const result = await runProcess(['status', '--json'], {
    WORKNARU_ENDPOINT: `ws://127.0.0.1:${port}/ws`, WORKNARU_SERVER_ID: 'srv_test', WORKNARU_TIMEOUT_MS: '500',
    WORKNARU_PASSWORD: secret, PASEO_HOST: 'unrelated.invalid:6767',
  });
  assert.equal(result.code, 1);
  assert.equal(result.stderr, '');
  const body = JSON.parse(result.stdout);
  assert.equal(body.outcome, 'unavailable');
  assert.equal(body.failure.code, 'connection_failed');
  assert.equal(body.localProcess, 'unknown');
  assert.equal(body.target.endpoint, `ws://127.0.0.1:${port}/ws`);
  assert.ok(!result.stdout.includes(secret));
});
