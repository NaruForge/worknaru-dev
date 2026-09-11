// Bootstrap helpers intentionally use only Node built-ins and source modules.
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { open, readFile, unlink } from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { root } from '../../packages/dev-environment/paths.mjs';

export class LocalError extends Error {
  constructor(code, message, exitCode = 1) { super(message); this.code = code; this.exitCode = exitCode; }
}
export const pathsFor = paths => ({
  ...paths, record: path.join(paths.dataHome, 'dev-instance.json'),
  lock: path.join(paths.dataHome, 'dev-operation.lock'),
  runnerLog: path.join(paths.dataHome, 'dev-runner.log'), buildLog: path.join(paths.dataHome, 'build.log'),
});
export const pipeFor = token => `\\\\.\\pipe\\worknaru-dev-${token}`;
export const newOwner = paths => ({ schema: 1, token: randomUUID(), repository: root, dataRoot: paths.dataHome });
export async function readOwner(paths) {
  try {
    const text = await readFile(paths.record, 'utf8');
    if (text.length > 4096) throw new Error();
    const value = JSON.parse(text);
    if (value.schema !== 1 || !/^[a-f0-9-]{36}$/.test(value.token)
      || value.repository !== root || value.dataRoot !== paths.dataHome) throw new Error();
    return value;
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw new LocalError('ownership_conflict', 'The development record is unreadable or belongs to another checkout. Run pnpm exec worknaru doctor and inspect dev-instance.json.');
  }
}
export async function removeOwner(paths, owner) {
  const current = await readOwner(paths);
  if (current?.token === owner.token) await unlink(paths.record);
}
export async function acquireLock(file) {
  const token = randomUUID();
  let handle;
  try { handle = await open(file, 'wx'); }
  catch (error) {
    if (error.code === 'EEXIST') throw new LocalError('operation_busy', 'Another operation is running, or its lock remains. Retry after it finishes; run pnpm exec worknaru doctor if it persists.');
    throw new LocalError('path_unwritable', 'Cannot create the operation lock. Check the data directory permissions.');
  }
  try { await handle.writeFile(JSON.stringify({ token, pid: process.pid, startedAt: new Date().toISOString() })); }
  finally { await handle.close(); }
  return async () => {
    const value = JSON.parse(await readFile(file, 'utf8'));
    if (value.token === token) await unlink(file);
  };
}
export function request(owner, command, milliseconds = 2000) {
  return new Promise((resolve, reject) => {
    const socket = net.connect(pipeFor(owner.token));
    let buffer = '';
    const timer = setTimeout(() => finish(new LocalError('controller_unavailable', 'The development controller did not respond. Run pnpm exec worknaru doctor; do not kill a process using the saved PID alone.')), milliseconds);
    function finish(error, result) {
      clearTimeout(timer); socket.destroy(); error ? reject(error) : resolve(result);
    }
    socket.on('error', () => finish(new LocalError('controller_unavailable', 'The saved development controller is unreachable. Run pnpm exec worknaru doctor and inspect the record and logs.')));
    socket.on('connect', () => socket.write(`${JSON.stringify({ token: owner.token, command })}\n`));
    socket.on('data', data => {
      buffer += data;
      if (buffer.length > 16384) return finish(new LocalError('ownership_conflict', 'Invalid controller response.'));
      if (!buffer.includes('\n')) return;
      try {
        const result = JSON.parse(buffer.split('\n')[0]);
        if (result.token !== owner.token || result.repository !== owner.repository || result.dataRoot !== owner.dataRoot) throw new Error();
        finish(null, result);
      } catch { finish(new LocalError('ownership_conflict', 'Development controller identity does not match.')); }
    });
    socket.on('end', () => finish(new LocalError('controller_unavailable', 'Development controller closed before replying.')));
  });
}
export function portOpen() {
  return new Promise(resolve => {
    const socket = net.connect({ host: '127.0.0.1', port: 6868 });
    const finish = value => { socket.destroy(); resolve(value); };
    socket.once('connect', () => finish(true)); socket.once('error', () => finish(false));
    socket.setTimeout(500, () => finish(false));
  });
}

// Command text is fixed; no user paths/arguments are interpolated into a shell.
// cmd is needed for standard Windows pnpm.cmd shims. cwd is passed separately.
export function pnpmCommand(command, { log, timeoutMs = 10000 } = {}) {
  if (!['--version', 'build'].includes(command)) throw new Error('Unsupported pnpm invocation');
  return new Promise((resolve, reject) => {
    const env = {
      ...process.env, COREPACK_ENABLE_NETWORK: '0', COREPACK_ENABLE_AUTO_PIN: '0',
      npm_config_manage_package_manager_versions: 'false', pnpm_config_manage_package_manager_versions: 'false',
      pnpm_config_pm_on_fail: 'error',
    };
    const child = process.platform === 'win32'
      ? spawn(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', `pnpm ${command}`], { cwd: root, env, windowsHide: true, stdio: ['ignore', log ?? 'pipe', log ?? 'pipe'] })
      : spawn('pnpm', [command], { cwd: root, env, stdio: ['ignore', log ?? 'pipe', log ?? 'pipe'] });
    let output = ''; let expired = false; let cleanupTimer; let cleanupDone;
    child.stdout?.on('data', data => { if (output.length < 4096) output += data; });
    child.stderr?.resume();
    const timer = setTimeout(() => {
      expired = true;
      cleanupTimer = setTimeout(() => {
        const error = new LocalError('operation_cleanup_failed', 'The timed-out command did not exit. Locks are retained. Inspect build.log and running build processes before manually clearing locks.');
        error.retainLocks = true;
        child.unref(); child.stdout?.destroy(); child.stderr?.destroy();
        reject(error);
      }, 10000);
      if (process.platform === 'win32' && child.pid) {
        cleanupDone = new Promise(resolve => {
          const killer = spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
          killer.once('exit', code => resolve(code === 0)); killer.once('error', () => resolve(false)); killer.unref();
        });
      } else child.kill('SIGTERM');
    }, timeoutMs);
    child.once('error', () => { clearTimeout(timer); clearTimeout(cleanupTimer); reject(new LocalError('pnpm_missing', 'Install the packageManager version of pnpm, then run pnpm install --frozen-lockfile.')); });
    child.once('exit', async code => {
      if (cleanupDone && !await cleanupDone) {
        clearTimeout(cleanupTimer);
        const error = new LocalError('operation_cleanup_failed', 'Cannot confirm cleanup of the build process tree. Locks are retained; inspect the running processes before retrying.');
        error.retainLocks = true;
        reject(error); return;
      }
      clearTimeout(timer); clearTimeout(cleanupTimer);
      if (expired || code !== 0) reject(new LocalError(command === 'build' ? 'build_failed' : 'pnpm_missing', command === 'build'
        ? 'Build failed or timed out. Inspect build.log in the data root, fix the build, then run pnpm exec worknaru dev start.'
        : 'Cannot run pnpm. Install the packageManager version, then run pnpm install --frozen-lockfile.'));
      else resolve(output.trim());
    });
  });
}
export const buildsPresent = () => [
  'apps/cli/dist/main.js', 'apps/web/dist/index.html', 'apps/web/dist/app.js', 'apps/web/dist/styles.css',
  'packages/branding/dist/index.js', 'packages/core/dist/index.js', 'packages/paseo-adapter/dist/index.js',
].every(file => existsSync(path.join(root, file)));
