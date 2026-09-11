import { mkdir, open, unlink } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

export const root = fileURLToPath(new URL('../../', import.meta.url));

function validateDataPath(value, source) {
  const windows = process.platform === 'win32';
  const unsupported = windows ? /[^A-Za-z0-9_.\\/-]/ : /[^A-Za-z0-9_./-]/;
  if (typeof value !== 'string' || !path.isAbsolute(value)
    || unsupported.test(windows ? value.replace(/^[A-Za-z]:/, '') : value)
    || (windows && !/^(?:[a-z]:[\\/]|\\\\[^\\]+\\[^\\]+)/i.test(value))) {
    throw new Error(`Data root (${source}) must be a fully qualified absolute directory with only ASCII letters, digits, -, _ and . in folder names (no spaces). Set WORKNARU_DATA_DIR to a supported path, for example C:\\WorknaruData on Windows or /var/tmp/worknaru-data on Unix.`);
  }
}

export function resolveDataPaths(env = process.env, repositoryRoot = root) {
  const value = env.WORKNARU_DATA_DIR;
  const source = value === undefined ? 'default' : 'WORKNARU_DATA_DIR';
  // Check explicit input before normalization so unsupported components cannot disappear via '..'.
  if (value !== undefined) validateDataPath(value, source);
  const dataHome = value === undefined ? path.join(repositoryRoot, '.local', 'paseo-dev') : path.resolve(value);
  validateDataPath(dataHome, source);
  return Object.freeze({
    dataHome, source,
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
