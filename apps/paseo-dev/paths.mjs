import { mkdir, open, unlink } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

export const root = fileURLToPath(new URL('../../', import.meta.url));

export function resolveDataPaths(env = process.env, repositoryRoot = root) {
  const value = env.WORKNARU_DATA_DIR;
  if (value !== undefined && (typeof value !== 'string' || !value.trim() || value !== value.trim()
    || !path.isAbsolute(value) || /[\x00-\x1f]/.test(value)
    || (process.platform === 'win32' && !/^(?:[a-z]:[\\/]|\\\\[^\\]+\\[^\\]+)/i.test(value)))) {
    throw new Error('WORKNARU_DATA_DIR must be a fully qualified absolute directory without surrounding whitespace.');
  }
  const dataHome = value === undefined ? path.join(repositoryRoot, '.local', 'paseo-dev') : path.resolve(value);
  return Object.freeze({
    dataHome, source: value === undefined ? 'default' : 'WORKNARU_DATA_DIR',
    config: path.join(dataHome, 'config.json'), serverId: path.join(dataHome, 'server-id'),
    pid: path.join(dataHome, 'paseo.pid'), log: path.join(dataHome, 'daemon.log'),
    launcherLog: path.join(dataHome, 'launcher.log'), worktrees: path.join(dataHome, 'worktrees'),
    temporary: path.join(dataHome, 'tmp'),
  });
}

export function describeDataPaths(paths) {
  return `Data root (${paths.source}): ${paths.dataHome}\nConfig: ${paths.config}\nServer ID: ${paths.serverId}\nPID: ${paths.pid}\nLogs: ${paths.log}; ${paths.launcherLog}\nWorktrees: ${paths.worktrees}\nTemporary/web files: ${paths.temporary}`;
}

export async function prepareDataDirectories(paths) {
  for (const directory of [paths.dataHome, paths.temporary, paths.worktrees]) {
    const probe = path.join(directory, `.worknaru-write-${randomUUID()}`);
    let handle;
    try {
      await mkdir(directory, { recursive: true });
      // Check actual writes (including Windows ACLs), not just permission bits.
      handle = await open(probe, 'wx');
    } catch (error) {
      throw new Error(`Data directory is not writable (${error.code ?? 'error'}): ${directory}`);
    } finally {
      if (handle) { await handle.close(); await unlink(probe); }
    }
  }
}
