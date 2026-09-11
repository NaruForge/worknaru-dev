import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { describeDataPaths, prepareDataDirectories, resolveDataPaths, root } from '../paths.mjs';
import { prepareWebFiles } from '../web-files.mjs';
import { childEnvironment } from '../daemon.mjs';

const testRoot = path.join(root, '.local', 'path-tests');

test('one absolute root owns all paths; unrelated environment cannot select it', () => {
  assert.equal(resolveDataPaths({ PASEO_HOME: 'elsewhere', TEAM_DATA_DIR: 'elsewhere' }).dataHome, path.join(root, '.local', 'paseo-dev'));
  const dataHome = path.join(testRoot, '우리 팀 데이터');
  const paths = resolveDataPaths({ WORKNARU_DATA_DIR: dataHome });
  assert.equal(paths.source, 'WORKNARU_DATA_DIR');
  for (const [key, value] of Object.entries(paths)) {
    if (!['dataHome', 'source'].includes(key)) assert.ok(value.startsWith(dataHome + path.sep));
  }
  for (const value of ['', ' ', '.', './relative', 'C:relative', '\n', dataHome + ' ']) {
    assert.throws(() => resolveDataPaths({ WORKNARU_DATA_DIR: value }), /WORKNARU_DATA_DIR/);
  }
  if (process.platform === 'win32') assert.throws(() => resolveDataPaths({ WORKNARU_DATA_DIR: '\\relative-to-drive' }));
  const inherited = { PASEO_HOME: 'personal', ELECTRON_RUN_AS_NODE: '1', USERPROFILE: 'user-home', PROVIDER_TEST_KEY: 'test-secret' };
  const child = childEnvironment(paths, inherited);
  assert.equal(child.PASEO_HOME, dataHome);
  assert.equal(child.TEMP, paths.temporary);
  assert.equal(child.ELECTRON_RUN_AS_NODE, undefined);
  assert.equal(child.USERPROFILE, 'user-home');
  assert.equal(child.PROVIDER_TEST_KEY, 'test-secret');
  assert.equal(inherited.PASEO_HOME, 'personal');
  assert.ok(!describeDataPaths(paths).includes('test-secret'));
  assert.ok(describeDataPaths(paths).includes('WORKNARU_DATA_DIR'));
});

test('invalid directory cannot fall back; preparation preserves identity and config', async () => {
  await mkdir(testRoot, { recursive: true });
  const directory = await mkdtemp(path.join(testRoot, '경로 검증-'));
  try {
    const paths = resolveDataPaths({ WORKNARU_DATA_DIR: path.join(directory, '자료') });
    await prepareDataDirectories(paths);
    await writeFile(paths.serverId, 'test-server-id');
    await writeFile(paths.config, 'test-config-with-secret');
    await prepareDataDirectories(paths);
    assert.equal(await readFile(paths.serverId, 'utf8'), 'test-server-id');
    assert.equal(await readFile(paths.config, 'utf8'), 'test-config-with-secret');
    assert.ok(!(await readdir(paths.dataHome)).some(name => name.startsWith('.worknaru-write-')));
    const file = path.join(directory, 'not-a-directory');
    await writeFile(file, 'sentinel');
    await assert.rejects(prepareDataDirectories(resolveDataPaths({ WORKNARU_DATA_DIR: file }, directory)), /not writable/);
    assert.equal(await readFile(file, 'utf8'), 'sentinel');
    assert.equal(existsSync(path.join(directory, '.local')), false);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('web staging excludes stale connection/config/log files and cleans only its own directory', async () => {
  await mkdir(testRoot, { recursive: true });
  const directory = await mkdtemp(path.join(testRoot, 'web-'));
  let web;
  try {
    const paths = resolveDataPaths({ WORKNARU_DATA_DIR: path.join(directory, 'data') });
    await prepareDataDirectories(paths);
    await writeFile(paths.serverId, 'server-sentinel');
    const build = path.join(directory, 'dist');
    await mkdir(build);
    for (const name of ['index.html', 'app.js', 'styles.css', 'brand-logo.png', 'connection.json', 'config.json', 'daemon.log']) {
      await writeFile(path.join(build, name), name);
    }
    web = await prepareWebFiles(build, paths);
    assert.deepEqual((await readdir(web.directory)).sort(), ['app.js', 'brand-logo.png', 'index.html', 'styles.css']);
    await writeFile(path.join(web.directory, 'connection.json'), '{"expectedServerId":"first"}');
    const second = await prepareWebFiles(build, paths);
    try {
      assert.notEqual(second.directory, web.directory);
      assert.equal(existsSync(path.join(second.directory, 'connection.json')), false);
      await web.cleanup();
      assert.equal(existsSync(second.directory), true);
      assert.equal(await readFile(paths.serverId, 'utf8'), 'server-sentinel');
    } finally { await second.cleanup(); }
    await rm(path.join(build, 'app.js'));
    await assert.rejects(prepareWebFiles(build, paths), /Missing web asset/);
  } finally { await web?.cleanup(); await rm(directory, { recursive: true, force: true }); }
});
