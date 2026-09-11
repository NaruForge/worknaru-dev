// Explicit opt-in: real Windows daemon, isolated source checkout and data roots.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { once } from 'node:events';
import { existsSync } from 'node:fs';
import { cp, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { promisify } from 'node:util';
import test from 'node:test';
import { root } from '../../../packages/dev-environment/paths.mjs';
import { portOpen } from '../local-support.mjs';

const exec = promisify(execFile);
const cleanEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^WORKNARU_/i.test(key)));
test('Windows cold bootstrap, terminal exit, lifecycle failures and identity preservation', { skip: process.platform !== 'win32', timeout: 300000 }, async t => {
  assert.equal(await portOpen(), false, 'Stop the current development environment before pnpm dev:verify.');
  const parent = path.join(root, '.local/dev-integration');
  await mkdir(parent, { recursive: true });
  const fixture = await mkdtemp(path.join(parent, 'checkout-'));
  const defaultData = path.join(fixture, '.local/paseo-dev');
  const customData = path.join(fixture, '.local/team-data_2.0');
  let data = defaultData;
  const environment = () => ({ ...cleanEnv, CI: 'true', ...(data === defaultData ? {} : { WORKNARU_DATA_DIR: data }) });
  async function execute(executable, args, timeout = 60000) {
    try { return { code: 0, ...await exec(executable, args, { cwd: fixture, env: environment(), windowsHide: true, timeout, maxBuffer: 4 * 1024 * 1024 }) }; }
    catch (error) { if (typeof error.code !== 'number' || error.killed) throw error; return { code: error.code, stdout: error.stdout, stderr: error.stderr }; }
  }
  const cli = (...args) => execute(process.execPath, [path.join(fixture, 'apps/cli/bin/worknaru.mjs'), ...args, '--json']);
  const shell = command => execute(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', command]);
  const decoded = result => { assert.equal(result.stderr, '', result.stderr); return JSON.parse(result.stdout); };
  const stopped = async () => {
    for (let count = 0; count < 100; count++) {
      if (!existsSync(path.join(data, 'dev-instance.json')) && !existsSync(path.join(data, 'paseo.pid')) && !await portOpen()) return;
      await delay(200);
    }
    assert.fail('Owned resources were not cleaned after failure');
  };
  const snapshot = async () => Object.fromEntries(await Promise.all(['config.json', 'server-id', 'daemon-keypair.json'].map(async name => [name, await readFile(path.join(data, name), 'utf8')])));
  try {
    for (const name of ['apps', 'packages']) await cp(path.join(root, name), path.join(fixture, name), { recursive: true, filter: file => !['node_modules', 'dist'].includes(path.basename(file)) });
    for (const name of ['package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', 'tsconfig.base.json']) await cp(path.join(root, name), path.join(fixture, name));
    const installed = await shell('pnpm install --offline --frozen-lockfile');
    assert.equal(installed.code, 0, installed.stdout + installed.stderr);
    const diagnosis = decoded(await cli('doctor'));
    assert.equal(diagnosis.checks.find(check => check.name === 'Build').ok, false);
    assert.equal(existsSync(data), false);
    assert.equal(decoded(await cli('status')).state, 'stopped');

    await t.test('no-dist start succeeds and survives the pnpm and terminal shell exiting', async () => {
      const result = await shell('pnpm exec worknaru dev start --json');
      assert.equal(result.code, 0, result.stdout + result.stderr);
      assert.equal(decoded(result).state, 'running');
      assert.equal(decoded(await cli('status')).daemon.outcome, 'available');
      assert.equal((await fetch('http://127.0.0.1:6868/connection.json')).status, 200);
    });
    const identity = await snapshot();
    await t.test('healthy starts reuse without rebuilding; diagnostics preserve saved data and records', async () => {
      const buildBefore = (await stat(path.join(data, 'build.log'))).mtimeMs;
      const recordBefore = await readFile(path.join(data, 'dev-instance.json'), 'utf8');
      for (const result of await Promise.all([cli('dev', 'start'), cli('dev', 'start')])) {
        assert.equal(result.code, 0); assert.equal(decoded(result).reused, true);
      }
      assert.equal(decoded(await cli('doctor')).ok, true);
      assert.equal((await stat(path.join(data, 'build.log'))).mtimeMs, buildBefore);
      assert.equal(await readFile(path.join(data, 'dev-instance.json'), 'utf8'), recordBefore);
      assert.deepEqual(await snapshot(), identity);
    });
    await t.test('changed PID identity blocks stop without terminating the owned daemon', async () => {
      const file = path.join(data, 'paseo.pid');
      const original = await readFile(file, 'utf8');
      try {
        await writeFile(file, JSON.stringify({ ...JSON.parse(original), startedAt: 'changed' }));
        const result = await cli('dev', 'stop');
        assert.equal(result.code, 1); assert.equal(decoded(result).error.code, 'ownership_conflict');
        assert.equal(await portOpen(), true);
      } finally { await writeFile(file, original); }
    });
    await t.test('stop and restart preserve config, server ID and authentication material', async () => {
      assert.equal((await cli('dev', 'stop')).code, 0);
      assert.equal((await cli('dev', 'stop')).code, 0);
      await stopped(); assert.deepEqual(await snapshot(), identity);
      const results = await Promise.all([cli('dev', 'start'), cli('dev', 'start')]);
      assert.ok(results.some(result => result.code === 0));
      for (const result of results) assert.ok([0, 1].includes(result.code), result.stdout);
      assert.deepEqual(await snapshot(), identity);
      for (const result of await Promise.all([cli('dev', 'stop'), cli('dev', 'stop')])) assert.ok([0, 1].includes(result.code), result.stdout);
      assert.equal((await cli('dev', 'stop')).code, 0); await stopped();
    });
    await t.test('failed build creates no controller and preserves existing identity', async () => {
      const file = path.join(fixture, 'packages/branding/brand.json');
      const original = await readFile(file, 'utf8');
      try {
        await writeFile(file, '{invalid');
        const result = await cli('dev', 'start');
        assert.equal(result.code, 1); assert.equal(decoded(result).error.code, 'build_failed');
        await stopped(); assert.deepEqual(await snapshot(), identity);
        assert.equal(existsSync(path.join(data, 'dev-operation.lock')), false);
      } finally { await writeFile(file, original); }
    });
    await t.test('startup deadline cancels and cleans only the controller child', async () => {
      const localFile = path.join(fixture, 'apps/cli/local.mjs');
      const daemonFile = path.join(fixture, 'packages/dev-environment/daemon.mjs');
      const local = await readFile(localFile, 'utf8');
      const daemon = await readFile(daemonFile, 'utf8');
      try {
        // Exercise the real timeout/cancellation path quickly, only in this fixture.
        await writeFile(localFile, local.replace('}, 90000)', '}, 1500)'));
        await writeFile(daemonFile, daemon.replace('connection = await connectOwned(child.pid, paths);', 'await delay(3000); connection = await connectOwned(child.pid, paths);'));
        const result = await cli('dev', 'start');
        assert.equal(result.code, 1); assert.equal(decoded(result).error.code, 'startup_timeout');
        assert.equal(existsSync(path.join(data, 'paseo.pid')), true, 'Timeout must exercise cancellation after the owned child started');
        await stopped(); assert.deepEqual(await snapshot(), identity);
      } finally { await writeFile(localFile, local); await writeFile(daemonFile, daemon); }
    });
    await t.test('readiness failure after the daemon starts cleans the owned controller and listener', async () => {
      const file = path.join(fixture, 'apps/cli/dev-runner.mjs');
      const original = await readFile(file, 'utf8');
      try {
        await writeFile(file, original.replace("assert.equal(status.outcome, 'available', 'Core readiness failed');", "throw new Error('Fixture readiness failure');"));
        const result = await cli('dev', 'start');
        assert.equal(result.code, 1); assert.equal(decoded(result).error.code, 'startup_failed');
        await stopped(); assert.deepEqual(await snapshot(), identity);
      } finally { await writeFile(file, original); }
    });
    await t.test('foreign listener remains untouched and does not create a new data root', async () => {
      data = path.join(fixture, '.local/foreign-port');
      const server = net.createServer(socket => socket.end());
      server.listen(6868, '127.0.0.1'); await once(server, 'listening');
      try {
        for (const args of [['dev', 'start'], ['dev', 'stop'], ['status']]) {
          const result = await cli(...args); assert.equal(result.code, 1); assert.equal(decoded(result).error.code, 'ownership_conflict');
        }
        assert.equal(server.listening, true); assert.equal(existsSync(data), false);
      } finally { await new Promise(resolve => server.close(resolve)); }
    });
    await t.test('custom ASCII root supports the same full lifecycle', async () => {
      data = customData;
      const started = await cli('dev', 'start'); assert.equal(started.code, 0, started.stdout);
      assert.equal(decoded(started).dataRoot, customData);
      assert.equal(decoded(await cli('status')).daemon.outcome, 'available');
      assert.equal((await cli('dev', 'stop')).code, 0); await stopped();
    });
    await t.test('build timeout confirms cleanup or preserves locks for manual inspection', async () => {
      const file = path.join(fixture, 'apps/cli/local.mjs');
      const original = await readFile(file, 'utf8');
      const before = await snapshot();
      try {
        await writeFile(file, original.replace('timeoutMs: 180000', 'timeoutMs: 1000'));
        const result = await cli('dev', 'start');
        assert.equal(result.code, 1);
        const error = decoded(result).error.code;
        assert.ok(['build_failed', 'operation_cleanup_failed'].includes(error), result.stdout);
        // Windows taskkill can return nonzero when a descendant exits during
        // traversal. Without proof of tree cleanup, retaining locks is required.
        const retained = error === 'operation_cleanup_failed';
        assert.equal(existsSync(path.join(data, 'dev-operation.lock')), retained);
        assert.equal(existsSync(path.join(fixture, '.local/dev-build.lock')), retained);
        await stopped(); assert.deepEqual(await snapshot(), before);
      } finally { await writeFile(file, original); }
    });
  } finally {
    for (const candidate of [defaultData, customData]) {
      data = candidate;
      if (existsSync(path.join(data, 'dev-instance.json'))) await cli('dev', 'stop');
    }
    // Preserve a failed fixture if ownership is ambiguous; never delete a live home.
    if (!existsSync(path.join(fixture, '.local/dev-build.lock')) && !await portOpen() && ![defaultData, customData].some(directory => existsSync(path.join(directory, 'dev-instance.json')) || existsSync(path.join(directory, 'paseo.pid')))) {
      assert.ok(path.resolve(fixture).startsWith(path.resolve(parent) + path.sep));
      await rm(fixture, { recursive: true, force: true });
    }
  }
});
