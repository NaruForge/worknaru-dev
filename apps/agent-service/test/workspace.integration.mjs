// Opt-in real Windows Daemon test. No Agent creation, Provider login or messages.
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { testDirectory } from '../../../packages/dev-environment/testing.mjs';
import { resolveDataPaths } from '../../../packages/dev-environment/paths.mjs';
import { writeMarker } from '../../../packages/dev-environment/storage.mjs';
import { agentConfig } from '../../../packages/dev-environment/config.mjs';
import { portOpen, startDedicatedDaemon, timeout } from '../../../packages/dev-environment/daemon.mjs';

test('workspace RPC uses the real Daemon and preserves data across process restarts', {
  skip: process.platform !== 'win32', timeout: 240000,
}, async t => {
  assert.equal(await portOpen(), false, 'Stop the dedicated development environment before this verification.');
  const directory = await testDirectory('workspace-rpc');
  const paths = resolveDataPaths({ WORKNARU_DATA_DIR: path.join(directory, 'data') });
  await mkdir(paths.dataHome);
  // The fixture owns this fresh root. Use the same marker/config as normal setup.
  await writeMarker(paths, 'ready');
  await writeFile(paths.config, JSON.stringify(agentConfig(paths)) + '\n', { flag: 'wx' });
  let instance;
  const start = async () => { instance = await startDedicatedDaemon({ paths }); };
  const stop = async () => {
    await instance.stop();
    await instance.cleanup();
    instance = undefined;
    assert.equal(existsSync(paths.pid), false);
    assert.equal(await portOpen(), false);
  };
  t.after(async () => {
    if (instance) {
      try { await instance.stop(); } finally { await instance.cleanup(); }
    }
    // Retain isolated evidence, never upload daemon identity/authentication files.
    t.diagnostic(`Isolated workspace RPC evidence: ${directory}`);
  });
  const call = (operation, input = {}) => timeout(instance.connection.driver.invokePluginRpc(
    'worknaru-agent-service', 'workspace.execute', { operation, input },
  ), 10000, `workspace.execute/${operation}`);
  const success = async (operation, input = {}) => {
    const response = await call(operation, input);
    assert.equal(response?.ok, true, JSON.stringify(response));
    return response.data;
  };

  await start();
  const firstPid = instance.child.pid;
  const serverId = await readFile(paths.serverId, 'utf8');
  assert.deepEqual(await success('listWorkspaces'), []);
  const workspace = await success('createWorkspace', { name: ' RPC Workspace ' });
  const other = await success('createWorkspace', { name: 'Other Workspace' });
  assert.equal(workspace.name, 'RPC Workspace');
  const project = await success('createProject', { workspaceId: workspace.id, name: 'RPC Project' });
  assert.equal(project.workspaceId, workspace.id);
  assert.deepEqual(await success('getWorkspace', { id: workspace.id }), workspace);
  assert.deepEqual(await success('getProject', { id: project.id }), project);
  assert.deepEqual(await success('listProjects', { workspaceId: workspace.id }), [project]);
  assert.deepEqual(await success('listProjects', { workspaceId: other.id }), []);
  const expected = await success('listWorkspaces');
  assert.equal(expected.length, 2);
  for (const [operation, input, code] of [
    ['createWorkspace', { name: '' }, 'invalid_input'],
    ['getWorkspace', { id: crypto.randomUUID() }, 'workspace_not_found'],
    ['createProject', { workspaceId: crypto.randomUUID(), name: 'Must not persist' }, 'workspace_not_found'],
    ['getProject', { id: crypto.randomUUID() }, 'project_not_found'],
  ]) {
    const response = await call(operation, input);
    assert.equal(response.ok, false);
    assert.equal(response.error.code, code);
  }
  assert.deepEqual(await success('listWorkspaces'), expected);
  assert.deepEqual(await success('listProjects', { workspaceId: workspace.id }), [project]);

  await stop();
  await start();
  assert.notEqual(instance.child.pid, firstPid, 'Restart must create a new Daemon process');
  assert.equal(await readFile(paths.serverId, 'utf8'), serverId);
  assert.deepEqual(await success('listWorkspaces'), expected);
  assert.deepEqual(await success('getWorkspace', { id: workspace.id }), workspace);
  assert.deepEqual(await success('getProject', { id: project.id }), project);
  assert.deepEqual(await success('listProjects', { workspaceId: workspace.id }), [project]);
  assert.deepEqual(await success('listProjects', { workspaceId: other.id }), []);
  await stop();

  // Wrong v1 schema fails through RPC without breaking the Agent health endpoint
  // or silently repairing domain data. The mutation is only in this stopped fixture.
  const filename = path.join(paths.dataHome, 'worknaru-domain.sqlite');
  const db = new DatabaseSync(filename);
  try { db.exec('DROP INDEX projects_by_workspace;'); } finally { db.close(); }
  const before = await readFile(filename);
  await start();
  const rejected = await call('listWorkspaces');
  assert.equal(rejected.ok, false);
  assert.equal(rejected.error.code, 'service_error');
  assert.ok(!rejected.error.message.includes(paths.dataHome));
  await stop();
  assert.deepEqual(await readFile(filename), before, 'Rejected DB must not be repaired by Daemon startup');
});
