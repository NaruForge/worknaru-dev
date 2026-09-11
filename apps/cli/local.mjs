import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, open, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveDataPaths, prepareDataDirectories, root } from '../../packages/dev-environment/paths.mjs';
import { configState, agentsEnabled, endpoint, listen } from '../../packages/dev-environment/config.mjs';
import { acquireLock, buildsPresent, LocalError, newOwner, pathsFor, pnpmCommand, portOpen, readOwner, request } from './local-support.mjs';

export function localPaths(env = process.env) {
  try { return pathsFor(resolveDataPaths(env)); }
  catch (error) { throw new LocalError('invalid_configuration', error.message, 2); }
}
export async function inspect(paths) {
  const owner = await readOwner(paths);
  if (owner) {
    if (process.platform !== 'win32') throw new LocalError('unsupported_platform', 'Managed development commands currently support Windows only.');
    const result = await request(owner, 'status');
    if (result.state !== 'running') return { state: result.state, owner };
    let id; let pid;
    try { [id, pid] = await Promise.all([readFile(paths.serverId, 'utf8'), readFile(paths.pid, 'utf8')]); }
    catch { throw new LocalError('ownership_conflict', 'Daemon identity files are missing or unreadable. Inspect the data root; no process was changed.'); }
    if (id.trim() !== result.serverId || pid !== result.pidRecord) throw new LocalError('ownership_conflict', 'Daemon identity files changed. Inspect the data root; no process was changed.');
    return { state: 'running', owner, serverId: result.serverId };
  }
  if (existsSync(paths.lock)) return { state: 'busy' };
  if (existsSync(paths.pid) || await portOpen()) throw new LocalError('ownership_conflict', 'Port 6868 or the Paseo PID file is occupied without a managed controller. Inspect it with pnpm exec worknaru doctor; stop its original launcher before retrying.');
  return { state: 'stopped' };
}
export async function localStatus(paths) {
  const current = await inspect(paths);
  const result = { kind: 'development', state: current.state, dataRoot: paths.dataHome, webUrl: `http://${listen}/`, daemon: null };
  if (current.state === 'running') {
    if (!buildsPresent()) throw new LocalError('build_required', 'Built files are missing. Stop the environment with pnpm exec worknaru dev stop, then start it again.');
    const { createCore } = await import('./dist/bootstrap.js');
    result.daemon = await createCore({ targetId: 'worknaru-dev', endpoint, expectedServerId: current.serverId, timeoutMs: 5000 }).getDaemonStatus();
    if (result.daemon.outcome !== 'available') result.state = 'unavailable';
  }
  result.next = result.state === 'stopped' ? 'pnpm exec worknaru dev start' : result.state === 'running' ? 'pnpm exec worknaru dev stop' : 'pnpm exec worknaru doctor';
  return result;
}
export async function prerequisites() {
  const manifest = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  const pinned = manifest.packageManager.replace('pnpm@', '');
  const checks = [{ name: 'Node', ok: Number(process.versions.node.split('.')[0]) === 24, detail: process.versions.node, next: 'Install Node.js 24 LTS.' }];
  try { const actual = await pnpmCommand('--version'); checks.push({ name: 'pnpm', ok: actual === pinned, detail: actual, next: `Install pnpm ${pinned}.` }); }
  catch { checks.push({ name: 'pnpm', ok: false, detail: 'unavailable', next: `Install pnpm ${pinned}.` }); }
  try {
    await import('../../packages/dev-environment/daemon.mjs');
    const { createRequire } = await import('node:module');
    const require = createRequire(import.meta.url);
    require.resolve('typescript', { paths: [root] });
    require.resolve('esbuild', { paths: [path.join(root, 'apps/web')] });
    checks.push({ name: 'Dependencies', ok: true, detail: 'installed; pinned Paseo verified' });
  } catch { checks.push({ name: 'Dependencies', ok: false, detail: 'missing or incompatible', next: 'pnpm install --frozen-lockfile' }); }
  return checks;
}
export async function doctor(paths) {
  const checks = await prerequisites();
  const connectionConfigured = ['ENDPOINT', 'SERVER_ID', 'TARGET_ID', 'TIMEOUT_MS', 'PASSWORD'].some(key => process.env[`WORKNARU_${key}`] !== undefined);
  checks.push({ name: 'Local command settings', ok: !connectionConfigured, detail: connectionConfigured ? 'explicit connection settings are present' : 'local defaults', next: 'Unset WORKNARU connection variables before dev start/stop. Doctor inspects the local data root.' });
  checks.push({ name: 'Platform', ok: process.platform === 'win32', detail: process.platform, next: 'Use Windows for the managed development environment.' });
  checks.push({ name: 'Build', ok: buildsPresent(), detail: buildsPresent() ? 'present (freshness is checked by building on start)' : 'missing', next: 'pnpm exec worknaru dev start' });
  let directory = paths.dataHome;
  try {
    while (!existsSync(directory)) {
      const parent = path.dirname(directory);
      if (parent === directory) throw new Error('No accessible ancestor');
      directory = parent;
    }
    const valid = (await stat(directory)).isDirectory();
    checks.push({ name: 'Data root', ok: valid, detail: `${paths.dataHome} (${paths.source}; no write probe)`, next: 'Choose a supported directory in WORKNARU_DATA_DIR.' });
  } catch { checks.push({ name: 'Data root', ok: false, detail: 'unreadable', next: 'Check WORKNARU_DATA_DIR and directory permissions.' }); }
  const config = await configState(paths);
  checks.push({ name: 'Agent setup', ok: true, detail: await agentsEnabled(paths) ? 'enabled; runtime checked at dev start' : 'optional; run pnpm exec worknaru agent setup while stopped' });
  checks.push({ name: 'Configuration', ok: config !== 'conflict', detail: config, next: `Inspect ${paths.config}; existing settings are never overwritten.` });
  for (const [name, file] of [['Operation lock', paths.lock], ['Build lock', path.join(root, '.local/dev-build.lock')]]) {
    checks.push({ name, ok: !existsSync(file), detail: existsSync(file) ? file : 'absent', next: 'Wait for the operation. If interrupted, verify that it and its children have exited before manually removing its lock.' });
  }
  try {
    const status = await localStatus(paths);
    checks.push({ name: 'Development environment', ok: ['running', 'stopped'].includes(status.state), detail: status.state, next: status.next });
    if (status.state === 'running' && await agentsEnabled(paths)) {
      try {
        const { createCore } = await import('./dist/bootstrap.js');
        const health = await createCore({ targetId: 'worknaru-dev', endpoint, expectedServerId: status.daemon.server.id, timeoutMs: 5000 }).agents('health', {});
        checks.push({ name: 'Agent service', ok: health.ready, detail: health.ready ? 'ready' : 'not ready', next: 'Inspect daemon.log and agent-state.sqlite availability, then dev stop/start.' });
      } catch { checks.push({ name: 'Agent service', ok: false, detail: 'unavailable', next: 'Inspect daemon.log, then dev stop/start.' }); }
    }
  } catch (error) { checks.push({ name: 'Development environment', ok: false, detail: error instanceof LocalError ? error.message : 'Unable to verify identity files.', next: 'Inspect dev-instance.json, paseo.pid, dev-runner.log and daemon.log in the data root; do not remove files while their owner is running.' }); }
  return { kind: 'doctor', ok: checks.every(check => check.ok), dataRoot: paths.dataHome, checks };
}
export async function start(paths) {
  if (process.platform !== 'win32') throw new LocalError('unsupported_platform', 'Managed development commands currently support Windows only.');
  const previous = await localStatus(paths);
  if (previous.state === 'running') return { ...previous, reused: true };
  if (previous.state !== 'stopped') throw new LocalError('operation_busy', 'Development is busy or unhealthy. Run pnpm exec worknaru doctor.');
  const checks = await prerequisites();
  const failed = checks.find(check => !check.ok);
  if (failed) throw new LocalError('prerequisite_failed', `${failed.name}: ${failed.detail}. ${failed.next}`);
  if (await configState(paths) === 'conflict') throw new LocalError('configuration_conflict', 'Existing configuration differs or is unreadable. Inspect config.json in the data root; it will not be overwritten.');
  try { await prepareDataDirectories(paths); }
  catch { throw new LocalError('path_unwritable', `Cannot prepare the data root: ${paths.dataHome}. Check directory permissions or WORKNARU_DATA_DIR.`); }
  const release = await acquireLock(paths.lock);
  let retainLocks = false;
  try {
    // Check again under the operation lock. Never rebuild a running instance.
    if (await readOwner(paths) || existsSync(paths.pid) || await portOpen()) throw new LocalError('ownership_conflict', 'The development environment changed during startup. Run pnpm exec worknaru doctor.');
    await mkdir(path.join(root, '.local'), { recursive: true });
    const releaseBuild = await acquireLock(path.join(root, '.local/dev-build.lock'));
    try {
      const log = await open(paths.buildLog, 'w');
      try { await pnpmCommand('build', { log: log.fd, timeoutMs: 180000 }); }
      catch (error) { retainLocks = error.retainLocks === true; throw error; }
      finally { await log.close(); }
    } finally { if (!retainLocks) await releaseBuild(); }
    const owner = newOwner(paths);
    const log = await open(paths.runnerLog, 'a');
    let child;
    try {
      child = spawn(process.execPath, [fileURLToPath(new URL('./dev-runner.mjs', import.meta.url))], {
        cwd: root, env: { ...process.env, WORKNARU_DATA_DIR: paths.dataHome },
        detached: true, windowsHide: true, shell: false, stdio: ['ignore', log.fd, log.fd, 'ipc'],
      });
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          if (child.connected) child.send({ command: 'cancel' });
          reject(new LocalError('startup_timeout', 'Startup timed out; cancellation requested. Run pnpm exec worknaru doctor and inspect dev-runner.log before retrying.'));
        }, 90000);
        const finish = error => { clearTimeout(timer); error ? reject(error) : resolve(); };
        child.once('error', () => finish(new LocalError('startup_failed', 'Cannot launch the development controller. Inspect dev-runner.log.')));
        child.once('exit', () => finish(new LocalError('startup_failed', 'Development controller exited during startup. Inspect dev-runner.log.')));
        child.once('message', result => finish(result?.ready === true && result.token === owner.token ? null : new LocalError('startup_failed', 'Development startup failed. Inspect dev-runner.log and daemon.log; run pnpm exec worknaru doctor.')));
        child.send({ command: 'start', owner });
      });
    } finally {
      if (child?.connected) child.disconnect();
      child?.unref();
      await log.close();
    }
    return await localStatus(paths);
  } finally { if (!retainLocks) await release(); }
}
export async function stop(paths) {
  const current = await inspect(paths);
  if (current.state === 'stopped') return { kind: 'development', state: 'stopped', dataRoot: paths.dataHome, next: 'pnpm exec worknaru dev start' };
  if (current.state !== 'running') throw new LocalError('operation_busy', 'Development is starting or stopping. Retry after it finishes; run pnpm exec worknaru doctor if it persists.');
  const release = await acquireLock(paths.lock);
  try {
    const response = await request(current.owner, 'stop', 40000);
    if (response.state !== 'stopped') throw new LocalError('shutdown_failed', 'Shutdown could not be verified. Inspect dev-runner.log and run pnpm exec worknaru doctor.');
    if (await readOwner(paths) || existsSync(paths.pid) || await portOpen()) throw new LocalError('shutdown_failed', 'A listener or ownership record remains after shutdown. Run pnpm exec worknaru doctor.');
    return { kind: 'development', state: 'stopped', dataRoot: paths.dataHome, next: 'pnpm exec worknaru dev start' };
  } finally { await release(); }
}
