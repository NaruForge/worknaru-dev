import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveDataPaths } from '@worknaru/dev-environment/paths';
import { writeMarker } from '@worknaru/dev-environment/storage';
import { initializeWorkspaceDomain } from '../server/workspace-domain.mjs';

async function fixture(t, { owned = true } = {}) {
  const parent = process.env.WORKNARU_TEST_ROOT || path.join(os.tmpdir(), 'worknaru-tests');
  mkdirSync(parent, { recursive: true });
  const root = mkdtempSync(path.join(parent, 'workspace-startup-'));
  const keys = ['WORKNARU_AGENT_DATA_ROOT', 'WORKNARU_REPOSITORY_ROOT'];
  const previous = keys.map(key => process.env[key]);
  const services = [];
  t.after(() => {
    try { for (const service of services.reverse()) service.close(); }
    finally {
      keys.forEach((key, i) => {
        if (previous[i] === undefined) delete process.env[key]; else process.env[key] = previous[i];
      });
      rmSync(root, { recursive: true, force: true });
    }
  });
  const repository = fileURLToPath(new URL('../../../', import.meta.url));
  process.env.WORKNARU_AGENT_DATA_ROOT = root;
  process.env.WORKNARU_REPOSITORY_ROOT = repository;
  const paths = resolveDataPaths({ WORKNARU_DATA_DIR: root }, repository);
  if (owned) await writeMarker(paths, 'ready');
  return {
    root, paths, database: path.join(root, 'worknaru-domain.sqlite'),
    async open() { const service = await initializeWorkspaceDomain(); services.push(service); return service; },
  };
}

test('owned product domain starts without server ID, Agent DB or Provider connection', async t => {
  const f = await fixture(t);
  const { api } = await f.open();
  const w = await api.createWorkspace({ name: 'Product workspace' });
  assert.equal((await api.getWorkspace({ id: w.id })).name, 'Product workspace');
  assert.ok(existsSync(f.database));
  assert.ok(!readdirSync(f.root).some(name => ['server-id', 'agents', 'agent-state.sqlite'].includes(name)));
});

test('composition root reopens the same domain after service shutdown', async t => {
  const f = await fixture(t);
  const first = await f.open();
  const w = await first.api.createWorkspace({ name: 'Workspace' });
  const p = await first.api.createProject({ workspaceId: w.id, name: 'Project' });
  first.close();
  const next = await f.open();
  assert.deepEqual(await next.api.getProject({ id: p.id }), p);
  assert.deepEqual(await next.api.getWorkspace({ id: w.id }), w);
});

test('missing launcher configuration does not choose a default data directory', async t => {
  const f = await fixture(t);
  delete process.env.WORKNARU_AGENT_DATA_ROOT;
  await assert.rejects(f.open(), /Missing owned launcher configuration/);
  assert.ok(!existsSync(f.database));
});

test('an empty but unowned directory is not silently claimed or populated', async t => {
  const f = await fixture(t, { owned: false });
  await assert.rejects(f.open(), /ready, owned data root/);
  assert.deepEqual(readdirSync(f.root), []);
});

test('a different checkout cannot open this product domain', async t => {
  const f = await fixture(t);
  const marker = JSON.parse(readFileSync(f.paths.marker, 'utf8'));
  marker.repository = path.join(f.root, 'another-checkout');
  writeFileSync(f.paths.marker, JSON.stringify(marker));
  await assert.rejects(f.open(), /another checkout/);
  assert.ok(!existsSync(f.database));
});

test('incomplete reset blocks domain initialization rather than recreating data', async t => {
  const f = await fixture(t);
  await writeMarker(f.paths, 'resetting');
  await assert.rejects(f.open(), /previous reset did not finish/i);
  assert.ok(!existsSync(f.database));
});
