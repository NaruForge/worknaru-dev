import assert from 'node:assert/strict';
import { mkdir, readFile, rename, rm, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { createDataManagement } from '../data-management.mjs';
import { pathsFor } from '../local-support.mjs';
import { dataPaths } from '../../../packages/dev-environment/paths.mjs';
import { acquireDataLock, assertStorage } from '../../../packages/dev-environment/storage.mjs';
import { testDirectory } from '../../../packages/dev-environment/testing.mjs';

async function fixture(t) {
  const directory = await testDirectory('data-management');
  const repository = path.join(directory, 'source'); await mkdir(repository);
  const paths = pathsFor(dataPaths(path.join(directory, 'data'), 'default', repository));
  const release = await acquireDataLock(paths);
  await assertStorage(paths, { claim: true, ignoreLock: true }); await release();
  const working = path.join(directory, 'work'); await mkdir(working);
  await writeFile(paths.config, 'DO-NOT-EXPOSE-SECRET');
  let identity = 'server-one'; let owned = true;
  const opened = []; const resets = [];
  const service = createDataManagement({ paths, serverId: () => identity,
    async verifyOwner() { if (!owned) throw Error('Owner changed'); },
    listAgents: async () => [{ cwd: working, name: '외부 작업' }],
    open: async directory => opened.push(directory), restart: async id => resets.push(id), env: {},
  });
  t.after(async () => {
    assert.ok(path.basename(directory).startsWith('data-management-'));
    await rm(directory, { recursive: true, force: true });
  });
  return { directory, paths, working, service, opened, resets, changeIdentity: () => { identity = 'server-two'; }, unown: () => { owned = false; } };
}
test('snapshot reports actual locations, presence and ownership without file contents', async t => {
  const f = await fixture(t);
  const value = await f.service.snapshot();
  assert.equal(value.source, 'default'); assert.equal(value.dataRoot, f.paths.dataHome);
  assert.equal(value.items.find(x => x.id === 'config').state, 'present');
  assert.equal(value.items.find(x => x.id === 'queue').state, 'missing');
  assert.equal(value.items.find(x => x.id === 'systemAgent').reset, true);
  assert.equal(value.items.find(x => x.id === 'systemAgent').path, path.join(f.paths.dataHome, 'system-agent'));
  assert.equal(value.items.find(x => x.path === f.working).reset, false);
  assert.ok(!JSON.stringify(value).includes('DO-NOT-EXPOSE-SECRET'));
  await f.service.open({ id: 'config' }); assert.deepEqual(f.opened, [f.paths.dataHome]);
  await assert.rejects(f.service.open({ id: f.working }), { code: 'unknown_path' });
  await rm(f.paths.config);
  await assert.rejects(f.service.open({ id: 'config' }), { code: 'path_changed' });
});
test('opening a changed junction or path is refused and never follows external data', async t => {
  const f = await fixture(t); const snapshot = await f.service.snapshot();
  await rename(f.working, `${f.working}-old`);
  await symlink(`${f.working}-old`, f.working, process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(f.service.open({ id: snapshot.items.find(item => item.path === f.working).id }), { code: 'path_changed' });
  assert.equal(f.opened.length, 0);
});
test('reset needs a fresh preview for the same owner, is single-use and accepts duplicate request once', async t => {
  const f = await fixture(t);
  await assert.rejects(f.service.reset({ token: 'unknown', id: 'first' }), { code: 'preview_expired' });
  let preview = await f.service.preview(); assert.ok(preview.token);
  assert.equal(await readFile(f.paths.config, 'utf8'), 'DO-NOT-EXPOSE-SECRET');
  f.changeIdentity();
  await assert.rejects(f.service.reset({ token: preview.token, id: 'first' }), { code: 'preview_expired' });
  preview = await f.service.preview();
  await f.service.reset({ token: preview.token, id: 'first' });
  await f.service.reset({ token: preview.token, id: 'first' });
  await assert.rejects(f.service.reset({ token: preview.token, id: 'second' }), { code: 'operation_busy' });
  assert.deepEqual(f.resets, ['first']);
  f.service.complete();
  await assert.rejects(f.service.reset({ token: preview.token, id: 'second' }), { code: 'preview_expired' });
  f.unown(); await assert.rejects(f.service.preview(), /Owner changed/);
});
test('reset preview exposes operation locks as blockers', async t => {
  const f = await fixture(t); const release = await acquireDataLock(f.paths);
  try { const value = await f.service.preview(); assert.equal(value.token, null); assert.equal(value.blockers[0].code, 'operation_busy'); }
  finally { await release(); }
});
