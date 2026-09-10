import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { promisify } from 'node:util';
import { createPaseoApi } from '@getpaseo/client';
import { createPaseoRuntime } from '@worknaru/paseo-adapter';
import {
  childEnvironment, connectOwned, dataHome, endpoint as url, portOpen, root,
  startDedicatedDaemon, timeout, version,
} from './daemon.mjs';

const require = createRequire(import.meta.url);
const worknaruEntry = path.join(path.dirname(require.resolve('@worknaru/cli/package.json')), 'bin', 'worknaru.mjs');
const exec = promisify(execFile);

async function worknaruStatus(serverId, expectedExitCode) {
  const env = childEnvironment();
  for (const key of Object.keys(env)) if (/^WORKNARU_/i.test(key)) delete env[key];
  let result;
  try {
    result = { ...await exec(process.execPath, [worknaruEntry, 'status', '--json',
      '--target', 'worknaru-dev', '--endpoint', url, '--server-id', serverId],
    { cwd: root, env, windowsHide: true, timeout: 10000 }), code: 0 };
  } catch (error) {
    if (typeof error.code !== 'number' || error.killed) throw error;
    result = { stdout: error.stdout, stderr: error.stderr, code: error.code };
  }
  assert.equal(result.code, expectedExitCode, 'Worknaru CLI exit code differs');
  assert.equal(result.stderr, '', 'Worknaru CLI JSON mode wrote to stderr');
  const status = JSON.parse(result.stdout);
  assert.equal(status.target.endpoint, url);
  assert.equal(status.target.expectedServerId, serverId);
  assert.equal(status.localProcess, 'unknown');
  return status;
}

async function main() {
  const daemon = await startDedicatedDaemon();
  const { child, exited } = daemon;
  let connection = daemon.connection;
  let report;
  try {
    const api = createPaseoApi(connection.driver);
    const detail = await connection.driver.getDaemonStatus({ timeout: 5000 });
    const agents = await timeout(api.agents.list(), 5000, 'Agent list');
    assert.equal(agents.entries.length, 0, 'Verification home contains agent sessions');
    assert.equal(detail.version, version);
    assert.equal(detail.relay?.enabled, false, 'Relay should be disabled');
    const serverId = connection.info.serverId;
    const runtime = createPaseoRuntime({ targetId: 'worknaru-dev', endpoint: url, expectedServerId: serverId });
    const adapterStatus = await runtime.getDaemonStatus();
    assert.equal(adapterStatus.outcome, 'available');
    assert.deepEqual(adapterStatus.server, { id: serverId, version });
    assert.equal(adapterStatus.localProcess, 'unknown');
    const mismatchStatus = await createPaseoRuntime({
      targetId: 'worknaru-dev-mismatch-check', endpoint: url, expectedServerId: 'srv_not_the_expected_daemon',
    }).getDaemonStatus();
    assert.equal(mismatchStatus.failure.code, 'target_mismatch');
    const cliStatus = await worknaruStatus(serverId, 0);
    assert.equal(cliStatus.outcome, 'available');
    assert.deepEqual(cliStatus.server, { id: serverId, version });
    const cliMismatch = await worknaruStatus('srv_not_the_expected_daemon', 1);
    assert.equal(cliMismatch.failure.code, 'target_mismatch');
    const detailAfterProbe = await connection.driver.getDaemonStatus({ timeout: 5000 });
    assert.equal(detailAfterProbe.pid, detail.pid, 'Status probes changed daemon process');
    assert.equal(detailAfterProbe.startedAt, detail.startedAt, 'Status probes restarted daemon');
    assert.equal((await timeout(api.agents.list(), 5000, 'Agent list after probe')).entries.length, 0);
    await connection.driver.close();
    connection = null;
    connection = await connectOwned(child.pid);
    assert.equal(connection.info.serverId, serverId, 'Identity changed on client reconnect');
    report = {
      version, dataHome, endpoint: url, serverId, supervisorPid: child.pid,
      sdkConnection: connection.driver.getConnectionState(),
      agentCount: agents.entries.length, relayEnabled: detail.relay.enabled,
      reconnectPreservedDaemon: true,
      adapterStatus: adapterStatus.outcome, adapterIdentityGuard: true, adapterLeftDaemonRunning: true,
      cliStatus: cliStatus.outcome, cliIdentityGuard: true, cliLeftDaemonRunning: true,
    };
    console.error('SDK identity, status, empty agent list and reconnect verified; stopping dedicated Paseo.');
    await connection.driver.shutdownServer({ timeout: 5000 });
    await connection.driver.close();
    connection = null;
    await timeout(exited, 20000, 'Dedicated daemon shutdown');
    assert.equal(child.exitCode, 0, 'Dedicated supervisor did not exit cleanly');
    assert.equal(await portOpen(), false, 'Dedicated listener remains open');
    assert.equal(existsSync(path.join(dataHome, 'paseo.pid')), false, 'Dedicated PID lock remains');
    const offlineStatus = await runtime.getDaemonStatus();
    assert.equal(offlineStatus.failure.code, 'connection_failed');
    assert.equal(offlineStatus.localProcess, 'unknown');
    const cliOfflineStatus = await worknaruStatus(serverId, 1);
    assert.equal(cliOfflineStatus.failure.code, 'connection_failed');
    report = { ...report, shutdown: 'completed', listenerClosed: true, pidLockRemoved: true,
      adapterOfflineResult: offlineStatus.failure.code, cliOfflineResult: cliOfflineStatus.failure.code };
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await connection?.driver.close().catch(() => {});
    await daemon.cleanup();
  }
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
