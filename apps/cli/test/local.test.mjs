import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';
import { explicitTarget } from '../entry.mjs';
import { acquireLock, newOwner, pathsFor, readOwner, request } from '../local-support.mjs';
import { resolveDataPaths, root } from '../../../packages/dev-environment/paths.mjs';

const exec = promisify(execFile);
const testRoot = path.join(root, '.local/cli-tests');
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^WORKNARU_/i.test(key)));
async function fixture(callback) {
  await mkdir(testRoot, { recursive: true });
  const directory = await mkdtemp(path.join(testRoot, 'case-'));
  try { await callback(directory); } finally { await rm(directory, { recursive: true, force: true }); }
}
async function invoke(args, dataHome, entry = path.join(root, 'apps/cli/bin/worknaru.mjs'), extra = {}) {
  try { return { code: 0, ...await exec(process.execPath, [entry, ...args], { env: { ...env, WORKNARU_DATA_DIR: dataHome, ...extra }, timeout: 15000, windowsHide: true }) }; }
  catch (error) { if (typeof error.code !== 'number') throw error; return { code: error.code, stdout: error.stdout, stderr: error.stderr }; }
}
test('any explicit connection setting selects the complete explicit contract, including empty values', () => {
  for (const key of ['ENDPOINT', 'SERVER_ID', 'TARGET_ID', 'TIMEOUT_MS', 'PASSWORD']) assert.equal(explicitTarget([], { [`WORKNARU_${key}`]: '' }), true);
  assert.equal(explicitTarget(['--timeout-ms', '300'], {}), true);
  assert.equal(explicitTarget([], { WORKNARU_DATA_DIR: 'data', PASEO_HOST: 'personal' }), false);
});
test('bootstrap help and doctor run without dist or installed dependencies and do not create data', () => fixture(async directory => {
  await cp(path.join(root, 'apps/cli'), path.join(directory, 'apps/cli'), { recursive: true, filter: file => !['node_modules', 'dist', 'test'].includes(path.basename(file)) });
  await cp(path.join(root, 'packages/dev-environment'), path.join(directory, 'packages/dev-environment'), { recursive: true, filter: file => path.basename(file) !== 'node_modules' });
  await cp(path.join(root, 'package.json'), path.join(directory, 'package.json'));
  const entry = path.join(directory, 'apps/cli/bin/worknaru.mjs');
  const data = path.join(directory, 'data');
  for (const args of [['--help'], ['doctor', '--help'], ['dev', 'start', '--help'], ['dev', 'stop', '--help'], ['status', '--help']]) {
    const result = await invoke(args, data, entry);
    assert.equal(result.code, 0, result.stderr); assert.match(result.stdout, /doctor/);
  }
  const result = await invoke(['doctor', '--json'], data, entry);
  assert.equal(result.code, 1); assert.equal(result.stderr, '');
  const checks = JSON.parse(result.stdout).checks;
  assert.equal(checks.find(check => check.name === 'Build').ok, false);
  assert.equal(checks.find(check => check.name === 'Dependencies').ok, false);
  assert.equal(existsSync(data), false);
}));
test('missing local environment and repeated stop do not create a data root', () => fixture(async directory => {
  const data = path.join(directory, 'absent');
  const status = await invoke(['status', '--json'], data);
  // A developer may already be using the fixed port: that is a conflict, never a fallback.
  assert.equal(status.code, 1); assert.equal(status.stderr, '');
  const value = JSON.parse(status.stdout);
  assert.ok(value.state === 'stopped' || value.error?.code === 'ownership_conflict');
  const stop = await invoke(['dev', 'stop', '--json'], data);
  assert.equal(stop.code, value.state === 'stopped' ? 0 : 1);
  assert.equal(existsSync(data), false);
}));
test('incomplete explicit settings and invalid local arguments never fall back or echo secrets', () => fixture(async directory => {
  for (const [args, extra] of [
    [['status', '--json'], { WORKNARU_ENDPOINT: 'ws://127.0.0.1:6868/ws' }],
    [['status', '--json'], { WORKNARU_SERVER_ID: 'test-secret' }],
    [['status', '--json'], { WORKNARU_PASSWORD: 'test-secret' }],
    [['dev', 'start', '--json'], { WORKNARU_ENDPOINT: 'test-secret' }],
    [['doctor', '--password', 'test-secret', '--json'], {}],
    [['dev', 'stop', '--json', '--json'], {}],
  ]) {
    const result = await invoke(args, path.join(directory, 'absent'), undefined, extra);
    assert.equal(result.code, 2, result.stdout); assert.equal(result.stderr, '');
    assert.ok(!result.stdout.includes('test-secret')); assert.ok(JSON.parse(result.stdout).error);
  }
  assert.equal(existsSync(path.join(directory, 'absent')), false);
}));
test('exclusive locks reject concurrent and stale holders; release only removes its token', () => fixture(async directory => {
  const file = path.join(directory, 'operation.lock');
  const release = await acquireLock(file);
  await assert.rejects(acquireLock(file), error => error.code === 'operation_busy');
  await writeFile(file, JSON.stringify({ token: 'another-holder' }));
  await release(); assert.equal(existsSync(file), true);
  await assert.rejects(acquireLock(file), error => error.code === 'operation_busy');
}));
test('corrupt and cross-checkout records are preserved; stale controllers cannot trigger shutdown', () => fixture(async directory => {
  const paths = pathsFor(resolveDataPaths({ WORKNARU_DATA_DIR: directory }));
  for (const value of ['not-json test-secret', JSON.stringify({ ...newOwner(paths), repository: 'another-checkout' })]) {
    await writeFile(paths.record, value);
    await assert.rejects(readOwner(paths), error => error.code === 'ownership_conflict' && !error.message.includes('test-secret'));
    for (const args of [['status', '--json'], ['dev', 'stop', '--json'], ['dev', 'start', '--json']]) {
      const result = await invoke(args, directory); assert.equal(result.code, 1); assert.ok(!result.stdout.includes('test-secret'));
    }
    assert.equal(await readFile(paths.record, 'utf8'), value);
  }
  if (process.platform === 'win32') await assert.rejects(request({ ...newOwner(paths), token: randomUUID() }, 'stop', 100), error => error.code === 'controller_unavailable');
}));
test('doctor redacts conflicting configuration and preserves every input file', () => fixture(async directory => {
  await writeFile(path.join(directory, 'config.json'), '{"password":"test-secret"}');
  await writeFile(path.join(directory, 'dev-operation.lock'), 'interrupted-operation');
  const names = await readdir(directory);
  const result = await invoke(['doctor', '--json'], directory);
  assert.equal(result.code, 1); assert.equal(result.stderr, ''); assert.ok(!result.stdout.includes('test-secret'));
  assert.deepEqual(await readdir(directory), names);
  assert.equal(await readFile(path.join(directory, 'config.json'), 'utf8'), '{"password":"test-secret"}');
}));

test('doctor finishes when the selected Windows drive does not exist', { skip: process.platform !== 'win32' }, async () => {
  const drive = ['Z', 'Y', 'X', 'W'].find(letter => !existsSync(`${letter}:\\`));
  if (!drive) return;
  const result = await invoke(['doctor', '--json'], `${drive}:\\worknaru-data`);
  assert.equal(result.code, 1);
  assert.equal(JSON.parse(result.stdout).checks.find(check => check.name === 'Data root').ok, false);
});
