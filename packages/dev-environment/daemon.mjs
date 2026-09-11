import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { existsSync, readFileSync } from 'node:fs';
import { open, readFile, unlink, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import net from 'node:net';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { DaemonClient } from '@getpaseo/client/internal/daemon-client';
import { describeDataPaths, prepareDataDirectories, resolveDataPaths, root } from './paths.mjs';
import { prepareWebFiles } from './web-files.mjs';

export { root } from './paths.mjs';
import { configState, expectedConfig, agentsEnabled, listen, endpoint, version } from './config.mjs';
export { listen, endpoint, version } from './config.mjs';
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

export async function timeout(promise, milliseconds, label) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out`)), milliseconds);
      }),
    ]);
  } finally { clearTimeout(timer); }
}

export function portOpen() {
  return new Promise(resolve => {
    const socket = net.connect({ host: '127.0.0.1', port: 6868 });
    const finish = value => { socket.destroy(); resolve(value); };
    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
    socket.setTimeout(500, () => finish(false));
  });
}

async function prepare(paths) {
  assert.ok(!existsSync(paths.pid), `Dedicated PID file already exists; inspect it before rerunning: ${paths.pid}`);
  const server = net.createServer();
  server.listen({ host: '127.0.0.1', port: 6868, exclusive: true });
  await once(server, 'listening');
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  const config = expectedConfig(paths);
  const configPath = paths.config;
  if (existsSync(configPath)) {
    // Do not print the diff: existing configuration may contain credentials.
    if (await configState(paths) !== 'valid') throw new Error(`Dedicated config differs or is unreadable; inspect it instead of overwriting it: ${configPath}`);
  }
  await prepareDataDirectories(paths);
  if (!existsSync(configPath)) {
    await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, { flag: 'wx' });
  }
}

export function childEnvironment(paths, inherited = process.env) {
  const env = { ...inherited };
  // Preserve the user home and provider credentials, but never inherit a Paseo target.
  for (const key of Object.keys(env)) {
    if (/^PASEO_/i.test(key) || /^ELECTRON_/i.test(key)) delete env[key];
  }
  return {
    ...env, PASEO_HOME: paths.dataHome, PASEO_HOST: listen, PASEO_LISTEN: listen,
    WORKNARU_AGENT_DATA_ROOT: paths.dataHome, WORKNARU_AGENT_DEFAULT_CWD: root,
    WORKNARU_AGENT_STATE_FILE: paths.agentState,
    TEMP: paths.temporary, TMP: paths.temporary,
  };
}

export async function connectOwned(ownerPid, paths) {
  const driver = new DaemonClient({
    url: endpoint, clientId: 'worknaru-paseo-dev-verification', clientType: 'cli',
    appVersion: version, connectTimeoutMs: 5000, reconnect: { enabled: false }, logger,
  });
  try {
    await driver.connect();
    const info = driver.getLastServerInfoMessage();
    const expectedId = (await readFile(paths.serverId, 'utf8')).trim();
    const pidInfo = JSON.parse(await readFile(paths.pid, 'utf8'));
    assert.equal(pidInfo.pid, ownerPid, 'PID file is not owned by this invocation');
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

export async function startDedicatedDaemon({ webDist, paths = resolveDataPaths(), signal } = {}) {
  console.error(describeDataPaths(paths));
  await prepare(paths);
  const launchLog = await open(paths.launcherLog, 'a');
  let webFiles;
  let child;
  let exited;
  let connection;
  const running = () => child?.pid && child.exitCode === null && child.signalCode === null;
  async function cleanup() {
    await connection?.driver.close().catch(() => {});
    try {
      if (running()) {
        let ownedPidRecord;
        try {
          const value = await readFile(paths.pid, 'utf8');
          const pid = JSON.parse(value);
          if (pid.pid === child.pid && pid.listen === listen) ownedPidRecord = value;
        } catch { /* An absent or foreign record must not be removed. */ }
        // Only the child created by this invocation is eligible for emergency cleanup.
        console.error(`Cleaning up owned supervisor PID ${child.pid}.`);
        if (process.platform === 'win32') {
          const cleanupChild = spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], {
            windowsHide: true, shell: false, stdio: 'ignore',
          });
          await timeout(once(cleanupChild, 'exit'), 10000, 'Owned process cleanup');
        } else { child.kill('SIGTERM'); }
        await timeout(exited, 10000, 'Owned supervisor exit');
        if (ownedPidRecord && !await portOpen()) {
          try {
            if (await readFile(paths.pid, 'utf8') === ownedPidRecord) await unlink(paths.pid);
          } catch (error) { if (error.code !== 'ENOENT') throw error; }
        }
      }
    } finally { await launchLog.close(); await webFiles?.cleanup(); }
  }
  try {
    signal?.throwIfAborted();
    if (webDist) webFiles = await prepareWebFiles(webDist, paths);
    child = spawn(process.execPath, [supervisorEntry, '--no-relay', '--no-mcp', '--no-inject-mcp',
      webDist ? '--web-ui' : '--no-web-ui'], {
      cwd: root,
      env: { ...childEnvironment(paths), ...(webFiles ? { PASEO_WEB_UI_DIST_DIR: webFiles.directory } : {}) },
      windowsHide: true, shell: false, stdio: ['ignore', launchLog.fd, launchLog.fd],
    });
    exited = once(child, 'exit');
    exited.catch(() => {});
    await once(child, 'spawn');
    console.error(`Starting dedicated Paseo; logs: ${paths.log}`);
    const deadline = Date.now() + 45000;
    while (true) {
      signal?.throwIfAborted();
      assert.ok(running(), 'Dedicated supervisor exited during startup');
      try { connection = await connectOwned(child.pid, paths); break; }
      catch (error) {
        if (Date.now() >= deadline) throw error;
        await delay(500);
      }
    }
    if (await agentsEnabled(paths)) {
      const deadline = Date.now() + 45000;
      while (true) {
        signal?.throwIfAborted();
        try {
          const response = await connection.driver.invokePluginRpc('worknaru-agent-service', 'agents.execute', { operation: 'health', input: {} });
          if (response?.ok && response.data?.ready) break;
        } catch { /* Plugin compiles and reconnects while daemon becomes ready. */ }
        if (Date.now() >= deadline) throw new Error('Agent service did not become ready. Inspect dedicated plugin logs.');
        await delay(500);
      }
    }
    return {
      child, exited, connection, cleanup, paths, webDirectory: webFiles?.directory,
      async stop() {
        if (!running()) return;
        const owned = await connectOwned(child.pid, paths);
        try { await owned.driver.shutdownServer({ timeout: 5000 }); }
        finally { await owned.driver.close(); }
        await timeout(exited, 20000, 'Dedicated daemon shutdown');
        assert.equal(child.exitCode, 0, 'Dedicated supervisor did not exit cleanly');
        assert.equal(await portOpen(), false, 'Dedicated listener remains open');
        assert.equal(existsSync(paths.pid), false, 'Dedicated PID lock remains');
      },
    };
  } catch (error) { await cleanup(); throw error; }
}
