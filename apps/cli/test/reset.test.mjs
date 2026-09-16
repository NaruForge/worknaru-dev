import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { lstat, mkdir, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';
import { dataPaths, legacyPaths, resolveDataPaths, root, validateDataLocation, validateExecutionPath, validateDirectory, prepareDataDirectories, directoryQuery } from '../../../packages/dev-environment/paths.mjs';
import { acquireDataLock, assertStorage, inspectStorage, writeMarker } from '../../../packages/dev-environment/storage.mjs';
import { expectedConfig } from '../../../packages/dev-environment/config.mjs';
import { testDirectory } from '../../../packages/dev-environment/testing.mjs';
import { resetData, resetPlan, verifyStopped } from '../data-reset.mjs';
import { initialAgentState } from '@worknaru/core/agent-service';
import { openStore } from '../../agent-service/server/store.mjs';
import { registry, seedRegistry, storedState, resetService } from './reset-state-fixture.mjs';

const exec = promisify(execFile);
const stopped = async () => {};
async function fixture(t) {
  const directory = await testDirectory('reset');
  const repository = path.join(directory, 'source'); await mkdir(repository);
  const paths = resolveDataPaths({ WORKNARU_DATA_DIR: path.join(directory, 'data') }, repository);
  t.after(async () => { assert.ok(path.basename(directory).startsWith('reset-')); await rm(directory, { recursive: true, force: true }); });
  return { directory, repository, paths };
}
async function claim(paths) {
  const release = await acquireDataLock(paths);
  try { await assertStorage(paths, { claim: true, ignoreLock: true }); } finally { await release(); }
}

test('external defaults and overrides retain conservative path rules', { skip: process.platform !== 'win32' }, async t => {
  const f = await fixture(t);
  assert.equal(resolveDataPaths({ LOCALAPPDATA: f.directory }, f.repository).dataHome, path.join(f.directory, 'Worknaru-Dev'));
  assert.equal(resolveDataPaths({ LOCALAPPDATA: 'C:\\사용자 이름', WORKNARU_DATA_DIR: f.paths.dataHome }, f.repository).dataHome, f.paths.dataHome);
  for (const value of ['', 'C:relative', 'C:\\space name', 'C:\\한글', 'C:\\CON', 'C:\\end.', 'C:\\bad name\\..\\okay', 'C:\\SHORT~1']) {
    assert.throws(() => validateExecutionPath(value));
  }
  assert.throws(() => resolveDataPaths({ WORKNARU_DATA_DIR: f.repository }, f.repository), /outside/);
  assert.throws(() => resolveDataPaths({ WORKNARU_DATA_DIR: f.directory }, f.repository), /outside/);
});

test('preview of an absent root is read-only; unknown directories cannot be claimed or reset', async t => {
  const f = await fixture(t);
  assert.equal((await resetPlan(f.paths, { stopped })).state, 'empty');
  await assert.rejects(lstat(f.paths.dataHome), { code: 'ENOENT' });
  await mkdir(f.paths.dataHome);
  await writeFile(path.join(f.paths.dataHome, 'keep.txt'), 'unrelated');
  assert.equal((await resetPlan(f.paths, { stopped })).blockers[0].code, 'unowned_data_root');
  await assert.rejects(assertStorage(f.paths, { claim: true }), { code: 'unowned_data_root' });
  assert.equal(await readFile(path.join(f.paths.dataHome, 'keep.txt'), 'utf8'), 'unrelated');
});

test('reset discards incompatible data, retains a management marker and is repeatable', async t => {
  const f = await fixture(t); await claim(f.paths);
  const marker = JSON.parse(await readFile(f.paths.marker, 'utf8')); marker.storageVersion = 999;
  await writeFile(f.paths.marker, JSON.stringify(marker));
  for (const name of ['agent-state.sqlite', 'agent-state.sqlite-wal', 'agent-state.sqlite-shm', 'module-runs.sqlite', 'module-runs.sqlite-wal', 'module-runs.sqlite-shm', 'server-id', 'config.before-agents-1.json']) await writeFile(path.join(f.paths.dataHome, name), 'old');
  await assert.rejects(assertStorage(f.paths), { code: 'reset_required' });
  const before = await readFile(f.paths.marker, 'utf8');
  assert.equal((await resetPlan(f.paths, { stopped })).state, 'planned');
  assert.equal(await readFile(f.paths.marker, 'utf8'), before);
  assert.equal((await resetData(f.paths, { stopped })).state, 'reset');
  assert.deepEqual(await readdir(f.paths.dataHome), ['worknaru-data.json']);
  assert.equal((await inspectStorage(f.paths)).marker.state, 'empty');
  assert.equal((await resetData(f.paths, { stopped })).state, 'reset');
  await claim(f.paths); await writeFile(path.join(f.paths.dataHome, 'new-data'), 'new');
  await resetData(f.paths, { stopped }); assert.deepEqual(await readdir(f.paths.dataHome), ['worknaru-data.json']);
});

test('old storage versions require explicit reset without modifying existing data', async t => {
  for (const version of [1, 2]) {
    const f = await fixture(t); await claim(f.paths);
    const marker = JSON.parse(await readFile(f.paths.marker, 'utf8')); marker.storageVersion = version;
    await writeFile(f.paths.marker, JSON.stringify(marker));
    const file = path.join(f.paths.dataHome, 'worknaru-domain.sqlite');
    await writeFile(file, 'existing user data');
    const before = await readFile(f.paths.marker, 'utf8');
    await assert.rejects(assertStorage(f.paths, { claim: true }), { code: 'reset_required' });
    assert.equal(await readFile(f.paths.marker, 'utf8'), before);
    assert.equal(await readFile(file, 'utf8'), 'existing user data');
  }
});

test('reset clears readable Agent registrations and durable request state without a Provider', async t => {
  const f = await fixture(t); await claim(f.paths);
  const project = path.join(f.directory, 'project'); await mkdir(project);
  const files = { 'keep.txt': 'External project survives.', 'result.txt': '검증완료' };
  for (const [name, content] of Object.entries(files)) await writeFile(path.join(project, name), content);
  await seedRegistry(f.paths, project);
  const seed = initialAgentState();
  seed.settings = { sendMode: 'steer', revision: 3 };
  seed.requests = ['completed', 'uncertain', 'queued'].map((state, index) => ({
    id: `request-${index}`, agentId: 'active-agent', text: `Durable ${state}`, mode: 'queue', state,
    context: { type: 'standalone', workspaceId: null, projectId: null },
    turnId: state === 'queued' ? null : `turn-${index}`, createdAt: '2026-09-15T00:00:00.000Z', error: null,
  }));
  seed.paused['active-agent'] = true;
  seed.creations['creation-one'] = { signature: JSON.stringify(['Active fixture', project, 'fixture-model']), agentId: 'active-agent' };
  const writer = openStore(f.paths.agentState);
  try { writer.save(seed); } finally { writer.close(); }
  const providerCalls = [];
  // A fresh reader must prove these are valid records, not just nonempty files.
  const before = await resetService(f.paths, providerCalls);
  try {
    assert.deepEqual((await before.list()).map(a => a.id), ['active-agent']);
    assert.deepEqual((await before.list({ archived: true })).map(a => a.id), ['archived-agent']);
    assert.deepEqual(await before.settings(), seed.settings);
    assert.deepEqual(await before.requests({ agent: 'active-agent' }), { requests: seed.requests, paused: true });
    assert.deepEqual(storedState(f.paths), seed);
  } finally { await before.close(); }
  assert.deepEqual(providerCalls, [], 'Paused queued requests must never dispatch during fixture recovery');
  assert.equal((await resetData(f.paths, { stopped })).state, 'reset');
  assert.deepEqual(await readdir(f.paths.dataHome), ['worknaru-data.json']);
  for (const [name, content] of Object.entries(files)) assert.equal(await readFile(path.join(project, name), 'utf8'), content);
  assert.deepEqual(await (await registry(f.paths)).list(), []);
  await claim(f.paths);
  assert.equal(storedState(f.paths), null);
  const after = await resetService(f.paths, providerCalls);
  try {
    assert.deepEqual(await after.list(), []);
    assert.deepEqual(await after.list({ archived: true }), []);
    assert.deepEqual(await after.settings(), initialAgentState().settings);
    assert.deepEqual(storedState(f.paths), initialAgentState());
  } finally { await after.close(); }
  assert.deepEqual(providerCalls, []);
});

test('interrupted deletion blocks runtime reuse and retries without restoring data', async t => {
  const f = await fixture(t); await claim(f.paths);
  await writeFile(path.join(f.paths.dataHome, 'blocked'), 'old');
  await assert.rejects(resetData(f.paths, { stopped, remove: async () => { throw Error('file locked'); } }), { code: 'reset_incomplete' });
  await assert.rejects(assertStorage(f.paths), { code: 'reset_incomplete' });
  assert.equal((await inspectStorage(f.paths)).marker.state, 'resetting');
  await resetData(f.paths, { stopped });
  assert.equal((await inspectStorage(f.paths)).marker.state, 'empty');
});

test('a concurrent operation cannot prepare or reset the deleting root', async t => {
  const f = await fixture(t); await claim(f.paths);
  await writeFile(path.join(f.paths.dataHome, 'data'), 'old');
  await assert.rejects(resetData(f.paths, { stopped, remove: async () => {
    assert.equal((await resetPlan(f.paths, { stopped })).blockers[0].code, 'operation_busy');
    await assert.rejects(acquireDataLock(f.paths), { code: 'operation_busy' });
    await assert.rejects(assertStorage(f.paths), { code: 'reset_incomplete' });
    throw Error('interrupt');
  } }), { code: 'reset_incomplete' });
});

test('controller-held reset keeps its lock across deletion and rejects a foreign holder', async t => {
  const f = await fixture(t); await claim(f.paths);
  await writeFile(path.join(f.paths.dataHome, 'old'), 'old');
  const release = await acquireDataLock(f.paths);
  try {
    const before = await readFile(f.paths.lock, 'utf8');
    await resetData(f.paths, { stopped, lockHeld: true });
    assert.equal(await readFile(f.paths.lock, 'utf8'), before);
    await assert.rejects(acquireDataLock(f.paths), { code: 'operation_busy' });
    await writeFile(f.paths.lock, JSON.stringify({ ...JSON.parse(before), pid: process.pid + 1 }));
    await assert.rejects(resetData(f.paths, { stopped, lockHeld: true }), { code: 'operation_busy' });
    await writeFile(f.paths.lock, before);
  } finally { await release(); }
});

test('reset unlinks external junctions and rejects a data root alias into the checkout', async t => {
  const f = await fixture(t); await claim(f.paths);
  const external = path.join(f.directory, 'project'); await mkdir(external);
  await writeFile(path.join(external, 'keep.txt'), 'keep');
  await symlink(external, path.join(f.paths.dataHome, 'external'), process.platform === 'win32' ? 'junction' : 'dir');
  await resetData(f.paths, { stopped });
  assert.equal(await readFile(path.join(external, 'keep.txt'), 'utf8'), 'keep');
  const alias = path.join(f.directory, 'alias');
  await symlink(f.repository, alias, process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(validateDataLocation(dataPaths(alias, 'WORKNARU_DATA_DIR', f.repository)), /overlaps/);
});

test('legacy reset removes only the verified old home and refuses an unverified one', async t => {
  const f = await fixture(t); const paths = legacyPaths(f.repository);
  await mkdir(paths.dataHome, { recursive: true });
  await writeFile(paths.config, JSON.stringify(expectedConfig(paths)));
  await writeFile(paths.serverId, 'old-server');
  await writeFile(path.join(f.repository, '.local/keep.txt'), 'keep');
  assert.equal((await inspectStorage(paths)).kind, 'legacy');
  await resetData(paths, { stopped });
  await assert.rejects(lstat(paths.dataHome), { code: 'ENOENT' });
  assert.equal(await readFile(path.join(f.repository, '.local/keep.txt'), 'utf8'), 'keep');
  await mkdir(paths.dataHome);
  await writeFile(path.join(paths.dataHome, 'unknown.txt'), 'keep');
  await assert.rejects(resetData(paths, { stopped }), { code: 'unowned_data_root' });
});

test('process and child checks refuse running or unknown instances without killing them', async t => {
  const f = await fixture(t); await claim(f.paths);
  await assert.rejects(verifyStopped(f.paths, { isPortOpen: async () => true }), { code: 'reset_running' });
  await writeFile(f.paths.pid, JSON.stringify({ pid: 41001, listen: '127.0.0.1:6868' }));
  await assert.rejects(verifyStopped(f.paths, { isPortOpen: async () => false, listProcesses: async () => [{ ProcessId: 41002, ParentProcessId: 41001 }] }), { code: 'reset_running' });
  await verifyStopped(f.paths, { isPortOpen: async () => false, listProcesses: async () => [] });
  assert.equal(JSON.parse(await readFile(f.paths.pid, 'utf8')).pid, 41001);
});

test('reset removes a verified managed worktree and its registration, preserving the external repository', async t => {
  const f = await fixture(t); await claim(f.paths);
  const project = path.join(f.directory, 'project'); await mkdir(project);
  const git = (...args) => exec('git', args, { cwd: project, windowsHide: true });
  await git('init');
  await git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '--allow-empty', '-m', 'fixture');
  const working = path.join(f.paths.dataHome, 'worktrees', 'one');
  await git('worktree', 'add', '--detach', working, 'HEAD');
  await writeFile(path.join(working, 'discard.txt'), 'managed');
  await writeFile(path.join(project, 'keep.txt'), 'external');
  await resetData(f.paths, { stopped });
  assert.equal(await readFile(path.join(project, 'keep.txt'), 'utf8'), 'external');
  assert.equal((await git('worktree', 'list', '--porcelain')).stdout.includes(working.replaceAll('\\', '/')), false);
});

test('Agent paths reject unsupported real parents and missing folders', async t => {
  const f = await fixture(t);
  const unsupported = path.join(f.directory, '한글 폴더');
  await mkdir(unsupported);
  const alias = path.join(f.directory, 'ascii-alias');
  await symlink(unsupported, alias, process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(validateDirectory(alias), { code: 'invalid_configuration' });
  await assert.rejects(validateDirectory(path.join(f.directory, 'missing')), { code: 'invalid_directory' });
  await rm(unsupported, { recursive: true });
  await assert.rejects(validateDataLocation(dataPaths(alias, 'WORKNARU_DATA_DIR', f.repository)));
});

test('setup refuses administrative links and write permission failures without writing outside its root', { skip: process.platform !== 'win32' }, async t => {
  const f = await fixture(t); await claim(f.paths);
  const outside = path.join(f.directory, 'outside'); await mkdir(outside);
  await symlink(outside, f.paths.temporary, 'junction');
  await assert.rejects(assertStorage(f.paths, { claim: true }), { code: 'unsafe_data_path' });
  await assert.rejects(prepareDataDirectories(f.paths), { code: 'unsafe_data_path' });
  assert.deepEqual(await readdir(outside), []);
  await (await import('node:fs/promises')).unlink(f.paths.temporary);
  const { stdout } = await exec('whoami', ['/user', '/fo', 'csv', '/nh'], { windowsHide: true });
  const sid = stdout.match(/S-1-[0-9-]+/)[0];
  await exec('icacls', [f.paths.dataHome, '/deny', '*' + sid + ':(WD,AD)'], { windowsHide: true });
  try { await assert.rejects(prepareDataDirectories(f.paths), { code: 'path_unwritable' }); }
  finally { await exec('icacls', [f.paths.dataHome, '/remove:d', '*' + sid], { windowsHide: true }); }
});

test('stopped data from another checkout must be discarded before this checkout can claim it', async t => {
  const f = await fixture(t); await claim(f.paths);
  const other = path.join(f.directory, 'other-checkout'); await mkdir(other);
  const selected = resolveDataPaths({ WORKNARU_DATA_DIR: f.paths.dataHome }, other);
  await assert.rejects(assertStorage(selected), { code: 'ownership_conflict' });
  await resetData(selected, { stopped });
  await claim(selected);
  assert.equal((await inspectStorage(selected)).marker.repository, other);
});

test('directory suggestions use an existing parent of an explicit path', async t => {
  const f = await fixture(t);
  const result = await directoryQuery(path.join(f.directory, 'missing', 'nested') + path.sep);
  assert.equal(result.cwd, f.directory);
  assert.equal(result.query, 'missing');
  await assert.rejects(directoryQuery('relative'), { code: 'invalid_configuration' });
});

test('a root junction is never followed even when it points to another verified data root', async t => {
  const f = await fixture(t); await claim(f.paths);
  await writeFile(path.join(f.paths.dataHome, 'keep'), 'keep');
  const alias = path.join(f.directory, 'data-alias');
  await symlink(f.paths.dataHome, alias, process.platform === 'win32' ? 'junction' : 'dir');
  const selected = resolveDataPaths({ WORKNARU_DATA_DIR: alias }, f.repository);
  const plan = await resetPlan(selected, { stopped });
  assert.equal(plan.blockers[0].code, 'unsafe_reset_target');
  assert.equal(await readFile(path.join(f.paths.dataHome, 'keep'), 'utf8'), 'keep');
});
