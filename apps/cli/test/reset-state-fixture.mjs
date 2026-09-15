import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createAgentService } from '@worknaru/core/agent-service';
import { openStore } from '../../agent-service/server/store.mjs';

// Use the installed, pinned registry parser/writer without constructing a Provider
// client or AgentManager. This is a disk fixture, not a replacement runtime.
const require = createRequire(new URL('../../../packages/dev-environment/daemon.mjs', import.meta.url));
const cliRequire = createRequire(require.resolve('@getpaseo/cli/package.json'));
let serverRoot = path.dirname(cliRequire.resolve('@getpaseo/server'));
while (!existsSync(path.join(serverRoot, 'package.json')) || JSON.parse(readFileSync(path.join(serverRoot, 'package.json'), 'utf8')).name !== '@getpaseo/server') {
  const parent = path.dirname(serverRoot); assert.notEqual(parent, serverRoot); serverRoot = parent;
}
assert.equal(JSON.parse(readFileSync(path.join(serverRoot, 'package.json'), 'utf8')).version, '0.8.0');
const { AgentStorage, parseStoredAgentRecord } = await import(pathToFileURL(path.join(serverRoot, 'dist/server/server/agent/agent-storage.js')).href);
const logger = { child() { return this; }, debug() {}, info() {}, warn() {}, error(error) { throw Error('Invalid registry fixture', { cause: error }); } };

export async function registry(paths) {
  const storage = new AgentStorage(path.join(paths.dataHome, 'agents'), logger);
  await storage.initialize();
  return storage;
}

export async function seedRegistry(paths, cwd) {
  const storage = await registry(paths);
  for (const archived of [false, true]) {
    await storage.upsert(parseStoredAgentRecord({
      id: archived ? 'archived-agent' : 'active-agent', provider: 'codex', cwd,
      createdAt: '2026-09-15T00:00:00.000Z', updatedAt: '2026-09-15T00:00:00.000Z',
      title: archived ? 'Archived fixture' : 'Active fixture', lastStatus: 'idle',
      labels: { 'worknaru-source': 'agent-service' }, config: { model: 'fixture-model' },
      persistence: null, archivedAt: archived ? '2026-09-15T01:00:00.000Z' : null,
    }));
  }
  await storage.flush();
}

export function storedState(paths) {
  const store = openStore(paths.agentState);
  try { return store.load(); } finally { store.close(); }
}

export async function resetService(paths, providerCalls) {
  const storage = await registry(paths);
  const snapshot = record => record && ({
    id: record.id, name: record.title, cwd: record.cwd, model: record.config.model,
    status: record.lastStatus, turnId: null, archivedAt: record.archivedAt,
    managed: record.labels['worknaru-source'] === 'agent-service', parentId: null, permissions: [],
  });
  const forbidden = operation => async () => {
    providerCalls.push(operation);
    throw Error(`Reset fixture unexpectedly called ${operation}`);
  };
  const driver = {
    list: async () => (await storage.list()).map(snapshot),
    get: async id => snapshot(await storage.get(id)),
    options: forbidden('options'), create: forbidden('create'), send: forbidden('send'),
    watch: async () => {}, close: async () => storage.flush(),
  };
  const service = createAgentService({ driver, store: openStore(paths.agentState), validateDirectory: async () => {} });
  try { await service.initialize(); return service; }
  catch (error) { await service.close(); throw error; }
}
