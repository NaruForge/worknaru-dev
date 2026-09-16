// Real CLI -> Core -> Adapter -> Daemon RPC, without Agent/Provider execution.
import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, writeFile } from 'node:fs/promises';
import { testDirectory } from '../../../packages/dev-environment/testing.mjs';
import { resolveDataPaths } from '../../../packages/dev-environment/paths.mjs';
import { writeMarker } from '../../../packages/dev-environment/storage.mjs';
import { agentConfig } from '../../../packages/dev-environment/config.mjs';
import { portOpen, startDedicatedDaemon } from '../../../packages/dev-environment/daemon.mjs';
import { openModuleStore } from '../server/module-store.mjs';

const exec = promisify(execFile);
test('Module CLI persists context and deduplicates across actual Daemon restarts', { skip: process.platform !== 'win32', timeout: 240000 }, async t => {
  assert.equal(await portOpen(), false, 'Stop the owned development environment first.');
  const directory = await testDirectory('modules-rpc');
  const paths = resolveDataPaths({ WORKNARU_DATA_DIR: path.join(directory, 'data') });
  await mkdir(paths.dataHome);
  await writeMarker(paths, 'ready');
  await writeFile(paths.config, JSON.stringify(agentConfig(paths)), { flag: 'wx' });
  let instance;
  const start = async () => { instance = await startDedicatedDaemon({ paths }); };
  const stop = async () => { try { await instance.stop(); } finally { await instance.cleanup(); instance = undefined; } };
  t.after(async () => { if (instance) await stop(); t.diagnostic(`Module evidence: ${directory}`); });
  async function cli(args, exit = 0) {
    const env = { ...process.env };
    for (const key of Object.keys(env)) if (key.startsWith('WORKNARU_')) delete env[key];
    let result;
    try {
      result = await exec(process.execPath, ['apps/cli/bin/worknaru.mjs', ...args, '--json', '--endpoint', 'ws://127.0.0.1:6868/ws',
        '--server-id', instance.connection.info.serverId, '--timeout-ms', '10000'], { cwd: paths.repository, env, windowsHide: true, timeout: 20000 });
      assert.equal(exit, 0);
    } catch (error) { assert.equal(error.code, exit, error.stderr || error.message); result = error; }
    return JSON.parse(result.stdout);
  }
  await start();
  assert.equal((await cli(['module', 'list']))[0].id, 'text-stats');
  const w = await cli(['workspace', 'create', '--name', 'Module fixture']);
  const p = await cli(['project', 'create', '--workspace', w.id, '--name', 'One']);
  const other = await cli(['project', 'create', '--workspace', w.id, '--name', 'Two']);
  const requestId = crypto.randomUUID();
  const args = ['module', 'run', 'text-stats', '--text', '한글😀', '--request-id', requestId, '--project', p.id];
  const [a, b] = await Promise.all([cli(args), cli(args)]);
  assert.equal(a.id, b.id);
  const result = await cli(['run', 'show', a.id]);
  assert.equal(result.status, 'succeeded');
  assert.deepEqual(result.result, { characters: 3, lines: 1 });
  assert.deepEqual(result.context, { type: 'project', projectId: p.id, workspaceId: w.id });
  assert.deepEqual(await cli(['run', 'list', '--project', p.id]), [result]);
  assert.deepEqual(await cli(['run', 'list', '--project', other.id]), []);
  const changed = [...args]; changed[4] = 'changed';
  assert.equal((await cli(changed, 2)).error.code, 'request_conflict');
  for (const target of [['--standalone'], ['--workspace', w.id]]) {
    const run = await cli(['module', 'run', 'text-stats', '--text', 'a', '--request-id', crypto.randomUUID(), ...target]);
    assert.deepEqual(await cli(['run', 'list', ...target]), [run]);
  }
  const firstPid = instance.child.pid;
  await stop();
  // Seed a persisted in-flight state only in the stopped fixture; actual process death is tested separately.
  const store = openModuleStore(path.join(paths.dataHome, 'module-runs.sqlite'));
  const pending = { ...result, id: crypto.randomUUID(), requestId: crypto.randomUUID(), status: 'running', result: null, finishedAt: null };
  store.accept(pending); store.close();
  await start();
  assert.notEqual(instance.child.pid, firstPid);
  assert.deepEqual(await cli(['run', 'show', result.id]), result);
  assert.deepEqual(await cli(args), result);
  assert.equal((await cli(['run', 'show', pending.id])).status, 'uncertain');
  const retry = [...args]; retry[6] = pending.requestId;
  assert.equal((await cli(retry, 1)).status, 'uncertain');
  await stop();
  assert.equal(await portOpen(), false);
});
