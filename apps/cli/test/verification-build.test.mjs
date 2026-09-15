import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { testDirectory } from '../../../packages/dev-environment/testing.mjs';
import { verificationBuild } from './verification-environment.mjs';

const parent = await testDirectory('verification-build');
async function fixture(callback) {
  const repository = await mkdtemp(path.join(parent, 'checkout-'));
  const write = async (file, text = 'fixture') => {
    await mkdir(path.dirname(path.join(repository, file)), { recursive: true });
    await writeFile(path.join(repository, file), text);
  };
  const compile = async () => {
    for (const file of [
      'apps/cli/dist/main.js', 'apps/cli/dist/bootstrap.js',
      'apps/web/dist/index.html', 'apps/web/dist/app.js', 'apps/web/dist/styles.css',
      'packages/branding/dist/index.js', 'packages/runtime/dist/index.js',
      'packages/core/dist/index.js', 'packages/paseo-adapter/dist/index.js',
    ]) await write(file, 'built');
  };
  try {
    await write('package.json', '{"packageManager":"pnpm@10.34.1"}');
    await write('pnpm-lock.yaml', 'locked dependencies');
    await write('apps/web/src/main.ts', 'initial source');
    await callback({ repository, paths: { repository }, write, compile });
  } finally {
    assert.ok(path.resolve(repository).startsWith(path.resolve(parent) + path.sep));
    await rm(repository, { recursive: true, force: true });
  }
}

test('one fresh build serves setup and multiple restarts in the same verification run', () => fixture(async ({ repository, paths, write, compile }) => {
  await compile(); // Existing files alone never prove that a build is current.
  let calls = 0;
  const proof = verificationBuild({ repository, runBuild: async () => { calls++; await compile(); } });
  await proof.build(paths);
  await proof.build(paths);
  await write('test-results/result.json', 'new evidence');
  await proof.build(paths);
  assert.equal(calls, 1);
  assert.equal(proof.builds, 1);
  const anotherRun = verificationBuild({ repository, runBuild: async () => { calls++; await compile(); } });
  await anotherRun.build(paths);
  assert.equal(calls, 2, 'Reuse must not persist into another run.');
}));

test('source, configuration, dependencies and build output changes invalidate reuse', async t => {
  for (const file of [
    'apps/web/src/main.ts', 'apps/web/src/new.ts', 'apps/web/package.json',
    'tsconfig.base.json', 'packages/branding/brand.json', 'pnpm-lock.yaml',
    'pnpm-workspace.yaml', 'node_modules/.modules.yaml', 'node_modules/.pnpm/lock.yaml',
    'apps/web/dist/app.js',
  ]) await t.test(file, () => fixture(async ({ repository, paths, write, compile }) => {
    const proof = verificationBuild({ repository, runBuild: compile });
    await proof.build(paths);
    await write(file, 'changed');
    await assert.rejects(proof.build(paths), { code: 'verification_build_changed' });
    assert.equal(proof.builds, 1, 'Do not silently replace the build under a running verification.');
  }));
});

test('missing output, changed environment and another checkout cannot reuse the build', () => fixture(async ({ repository, paths, compile }) => {
  const environment = { NODE_ENV: 'test' };
  const proof = verificationBuild({ repository, runBuild: compile, environment: () => environment });
  await proof.build(paths);
  environment.NODE_ENV = 'production';
  await assert.rejects(proof.build(paths), { code: 'verification_build_changed' });
  environment.NODE_ENV = 'test';
  await assert.rejects(proof.build({ repository: path.dirname(repository) }), { code: 'verification_build_changed' });
  const file = path.resolve(repository, 'apps/web/dist/styles.css');
  assert.ok(file.startsWith(path.resolve(repository) + path.sep));
  await rm(file);
  await assert.rejects(proof.build(paths), { code: 'verification_build_changed' });
}));

test('a failed build preserves cleanup errors and creates no reusable proof', () => fixture(async ({ repository, paths, compile }) => {
  const failure = Object.assign(new Error('Build tree cleanup could not be confirmed'), { retainLocks: true });
  let fail = true;
  const proof = verificationBuild({ repository, runBuild: async () => {
    await compile();
    if (fail) throw failure;
  } });
  await assert.rejects(proof.build(paths), error => error === failure && error.retainLocks === true);
  assert.equal(proof.builds, 0);
  fail = false;
  await proof.build(paths);
  assert.equal(proof.builds, 1);
}));

test('input changes during a build and incomplete build results never establish a proof', () => fixture(async ({ repository, paths, write, compile }) => {
  const incomplete = verificationBuild({ repository, runBuild: async () => {} });
  await assert.rejects(incomplete.build(paths), { code: 'verification_build_changed' });
  assert.equal(incomplete.builds, 0);
  const changed = verificationBuild({ repository, runBuild: async () => {
    await compile();
    await write('apps/web/src/main.ts', 'changed while compiling');
  } });
  await assert.rejects(changed.build(paths), { code: 'verification_build_changed' });
  assert.equal(changed.builds, 0);
  assert.equal(await readFile(path.join(repository, 'apps/web/src/main.ts'), 'utf8'), 'changed while compiling');
}));
