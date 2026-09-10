import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, open, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { createPaseoApi } from '@getpaseo/client';
import { createPaseoRuntime } from '@worknaru/paseo-adapter';
// The public facade does not expose server identity or daemon lifecycle in this version.
import { DaemonClient } from '@getpaseo/client/internal/daemon-client';

const root = fileURLToPath(new URL('../../', import.meta.url));
const dataHome = path.join(root, '.local', 'paseo-dev');
const listen = '127.0.0.1:6868';
const url = `ws://${listen}/ws`;
const version = '0.8.0-beta.1';
const logger = Object.fromEntries(['debug', 'info', 'warn', 'error'].map(key => [key, () => {}]));
const require = createRequire(import.meta.url);
const cliPackage = require.resolve('@getpaseo/cli/package.json');
const cliRequire = createRequire(cliPackage);

function packageRoot(entry, name) {
  let directory = path.dirname(entry);
  while (true) {
    const manifest = path.join(directory, 'package.json');
    if (existsSync(manifest) && JSON.parse(readFileSync(manifest, 'utf8')).name === name) {
      assert.equal(JSON.parse(readFileSync(manifest, 'utf8')).version, version);
      return directory;
    }
    const parent = path.dirname(directory);
    assert.notEqual(parent, directory, `Cannot locate ${name}`);
    directory = parent;
  }
}

const serverRoot = packageRoot(cliRequire.resolve('@getpaseo/server'), '@getpaseo/server');
packageRoot(require.resolve('@getpaseo/client'), '@getpaseo/client');
assert.equal(JSON.parse(readFileSync(cliPackage, 'utf8')).version, version);
const supervisorEntry = path.join(serverRoot, 'dist', 'scripts', 'supervisor-entrypoint.js');
assert.ok(existsSync(supervisorEntry), 'Pinned Paseo supervisor entry is missing');

async function timeout(promise, milliseconds, label) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out`)), milliseconds);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

function portOpen() {
  return new Promise(resolve => {
    const socket = net.connect({ host: '127.0.0.1', port: 6868 });
    const finish = value => { socket.destroy(); resolve(value); };
    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
    socket.setTimeout(500, () => finish(false));
  });
}

async function assertPortFree() {
  const server = net.createServer();
  server.listen({ host: '127.0.0.1', port: 6868, exclusive: true });
  await once(server, 'listening');
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}

async function prepare() {
  // Never launch into an existing live (or ambiguous stale) PID record.
  assert.ok(!existsSync(path.join(dataHome, 'paseo.pid')), 'Dedicated PID file already exists; inspect it before rerunning');
  await assertPortFree();
  await mkdir(path.join(dataHome, 'tmp'), { recursive: true });
  const config = {
    version: 1,
    daemon: {
      listen,
      relay: { enabled: false },
      mcp: { enabled: false, injectIntoAgents: false },
      browserTools: { enabled: false },
      serviceProxy: { enabled: false },
    },
    pluginsEnabled: false,
    worktrees: { root: path.join(dataHome, 'worktrees') },
    features: {
      dictation: { enabled: false },
      voiceMode: { enabled: false },
      webUi: { enabled: false },
    },
    log: { file: { path: path.join(dataHome, 'daemon.log') } },
  };
  const configPath = path.join(dataHome, 'config.json');
  if (existsSync(configPath)) {
    assert.deepEqual(JSON.parse(await readFile(configPath, 'utf8')), config,
      'Dedicated config was changed; inspect it instead of overwriting it');
  } else {
    await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, { flag: 'wx' });
  }
}

function childEnvironment() {
  const env = { ...process.env };
  // Preserve the Windows user home and provider credentials. Drop Paseo target,
  // parent-agent, desktop, plugin and path overrides inherited from the caller.
  for (const key of Object.keys(env)) {
    if (/^PASEO_/i.test(key) || /^ELECTRON_/i.test(key)) delete env[key];
  }
  return {
    ...env,
    PASEO_HOME: dataHome,
    PASEO_HOST: listen,
    PASEO_LISTEN: listen,
    TEMP: path.join(dataHome, 'tmp'),
    TMP: path.join(dataHome, 'tmp'),
  };
}

async function connectOwned(ownerPid) {
  const driver = new DaemonClient({
    url, clientId: 'worknaru-paseo-dev-verification', clientType: 'cli',
    appVersion: version, connectTimeoutMs: 5000, reconnect: { enabled: false }, logger,
  });
  try {
    await driver.connect();
    const info = driver.getLastServerInfoMessage();
    const expectedId = (await readFile(path.join(dataHome, 'server-id'), 'utf8')).trim();
    const pidInfo = JSON.parse(await readFile(path.join(dataHome, 'paseo.pid'), 'utf8'));
    assert.equal(pidInfo.pid, ownerPid, 'PID file is not owned by this verification');
    assert.equal(pidInfo.listen, listen, 'Dedicated daemon listener differs');
    assert.ok(info?.serverId, 'Server handshake has no identity');
    assert.equal(info.serverId, expectedId, 'Connected daemon identity differs from dedicated home');
    assert.equal(info.version, version, 'Daemon version differs from pinned SDK');
    return { driver, info };
  } catch (error) {
    await driver.close();
    throw error;
  }
}

async function main() {
  await prepare();
  const launchLog = await open(path.join(dataHome, 'launcher.log'), 'a');
  let child;
  let exited;
  let connection;
  let report;
  try {
    child = spawn(process.execPath, [supervisorEntry, '--no-relay', '--no-mcp', '--no-inject-mcp', '--no-web-ui'], {
      cwd: root, env: childEnvironment(), windowsHide: true, shell: false,
      stdio: ['ignore', launchLog.fd, launchLog.fd],
    });
    exited = once(child, 'exit');
    // Observe errors immediately, including a failed process launch.
    exited.catch(() => {});
    await once(child, 'spawn');
    console.error('Starting dedicated Paseo; logs: .local/paseo-dev/daemon.log');
    const deadline = Date.now() + 45000;
    while (true) {
      assert.equal(child.exitCode, null, 'Dedicated supervisor exited during startup');
      assert.equal(child.signalCode, null, 'Dedicated supervisor was terminated');
      try {
        connection = await connectOwned(child.pid);
        break;
      } catch (error) {
        if (Date.now() >= deadline) throw error;
        await delay(500);
      }
    }
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
    const detailAfterProbe = await connection.driver.getDaemonStatus({ timeout: 5000 });
    assert.equal(detailAfterProbe.pid, detail.pid, 'Adapter probe changed daemon process');
    assert.equal(detailAfterProbe.startedAt, detail.startedAt, 'Adapter probe restarted daemon');
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
    report = { ...report, shutdown: 'completed', listenerClosed: true, pidLockRemoved: true,
      adapterOfflineResult: offlineStatus.failure.code };
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await connection?.driver.close().catch(() => {});
    if (child?.pid && child.exitCode === null && child.signalCode === null) {
      // Only this invocation's child tree is eligible for emergency cleanup.
      console.error(`Verification failed; cleaning up owned supervisor PID ${child.pid}.`);
      if (process.platform === 'win32') {
        const cleanup = spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, shell: false, stdio: 'ignore' });
        await timeout(once(cleanup, 'exit'), 10000, 'Owned process cleanup');
      } else {
        child.kill('SIGTERM');
      }
      await timeout(exited, 10000, 'Owned supervisor exit');
    }
    await launchLog.close();
  }
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
