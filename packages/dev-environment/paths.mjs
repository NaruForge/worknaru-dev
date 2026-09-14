import { lstat, mkdir, open, realpath, unlink } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

// Paseo bundles server plugins as CommonJS, where import.meta.url is absent.
// Only that bundled context uses the owned launcher's explicit checkout.
const moduleUrl = import.meta.url;
function bundledRepository() {
  const repository = process.env.WORKNARU_REPOSITORY_ROOT;
  if (!repository || !path.isAbsolute(repository)) throw new Error('Missing owned launcher repository');
  return path.resolve(repository);
}
export const root = typeof moduleUrl === 'string'
  ? path.resolve(fileURLToPath(new URL('../../', moduleUrl))) : bundledRepository();
export class DataError extends Error {
  constructor(code, message, exitCode = 1) { super(message); this.code = code; this.exitCode = exitCode; }
}
export const samePath = (a, b) => {
  const normalize = value => process.platform === 'win32' ? path.resolve(value).toLowerCase() : path.resolve(value);
  return normalize(a) === normalize(b);
};
export function containsPath(parent, child) {
  const relative = path.relative(path.resolve(parent), path.resolve(child));
  return relative === '' || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative));
}

export function validateExecutionPath(value, role = 'Data root') {
  const windows = process.platform === 'win32';
  const fullyQualified = typeof value === 'string' && path.isAbsolute(value)
    && (!windows || /^(?:[a-z]:[\\/]|\\\\[^\\]+\\[^\\]+)/i.test(value));
  const folders = typeof value === 'string' ? (windows ? value.replace(/^[a-z]:/i, '') : value).split(/[\\/]/).filter(Boolean) : [];
  if (!fullyQualified || folders.some(part => !/^[A-Za-z0-9_.-]+$/.test(part)
    || (part !== '.' && part !== '..' && (part.endsWith('.') || (windows && /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part)))))) {
    const guidance = /data root|LOCALAPPDATA/i.test(role)
      ? ' Set WORKNARU_DATA_DIR to a supported external path, for example C:\\WorknaruData\\Dev.'
      : ' Choose a supported absolute directory.';
    throw new DataError('invalid_configuration', role + ' must be a fully qualified absolute directory with only ASCII letters, digits, -, _ and . in folder names (no spaces or reserved names).' + guidance, 2);
  }
}

// Resolve existing ancestors without creating directories. Real paths catch junction aliases.
export async function actualPath(value) {
  let current = path.resolve(value);
  const missing = [];
  while (true) {
    let info;
    try { info = await lstat(current); }
    catch (error) {
      if (error.code !== 'ENOENT') throw new DataError('path_unavailable', 'Cannot inspect directory (' + error.code + '): ' + current);
      const parent = path.dirname(current);
      if (parent === current) throw new DataError('path_unavailable', 'No accessible directory for ' + value + '. Check the drive and permissions.');
      missing.unshift(path.basename(current)); current = parent;
      continue;
    }
    if (!info.isDirectory() && !info.isSymbolicLink()) throw new DataError('path_unavailable', 'Not a directory: ' + current);
    // An existing but dangling link is an error, never a missing directory to create.
    const target = await realpath(current).catch(error => { throw new DataError('path_unavailable', 'Cannot resolve directory (' + error.code + '): ' + current); });
    if (!(await lstat(target)).isDirectory()) throw new DataError('path_unavailable', 'Not a directory: ' + current);
    return path.join(target, ...missing);
  }
}

export async function validateDirectory(directory, role = 'Agent working directory') {
  validateExecutionPath(directory, role);
  const actual = await realpath(directory).catch(() => { throw new DataError('invalid_directory', '존재하는 작업 폴더를 선택해 주세요: ' + directory); });
  validateExecutionPath(actual, role);
  if (!(await lstat(actual)).isDirectory()) throw new DataError('invalid_directory', '작업 대상은 디렉터리여야 합니다.');
  return actual;
}

// Suggestions start from the nearest existing parent of the explicit input.
export async function directoryQuery(query) {
  validateExecutionPath(query, 'Directory query');
  const resolved = path.resolve(query);
  let directory = /[\\\\/]$/.test(query) ? resolved : path.dirname(resolved);
  while (true) {
    try {
      await lstat(directory);
      await validateDirectory(directory);
      const relative = path.relative(directory, resolved);
      return { cwd: directory, query: relative.split(path.sep)[0] ?? '' };
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      const parent = path.dirname(directory);
      if (parent === directory) throw new DataError('invalid_directory', 'No existing parent for the directory query.');
      directory = parent;
    }
  }
}

export function dataPaths(dataHome, source, repository = root, legacy = false) {
  return Object.freeze({
    dataHome: path.resolve(dataHome), source, repository: path.resolve(repository), legacy,
    marker: path.join(dataHome, 'worknaru-data.json'), lock: path.join(dataHome, 'dev-operation.lock'),
    config: path.join(dataHome, 'config.json'), serverId: path.join(dataHome, 'server-id'),
    pid: path.join(dataHome, 'paseo.pid'), log: path.join(dataHome, 'daemon.log'),
    agentState: path.join(dataHome, 'agent-state.sqlite'),
    launcherLog: path.join(dataHome, 'launcher.log'), worktrees: path.join(dataHome, 'worktrees'),
    temporary: path.join(dataHome, 'tmp'),
  });
}
export const legacyPaths = (repository = root) => dataPaths(path.join(repository, '.local/paseo-dev'), 'legacy', repository, true);

export function resolveDataPaths(env = process.env, repositoryRoot = root) {
  const explicit = env.WORKNARU_DATA_DIR !== undefined;
  const source = explicit ? 'WORKNARU_DATA_DIR' : 'default';
  let value = env.WORKNARU_DATA_DIR;
  if (!explicit) {
    if (process.platform !== 'win32' || !env.LOCALAPPDATA) throw new DataError('invalid_configuration', 'Cannot determine the Windows LOCALAPPDATA directory. Set WORKNARU_DATA_DIR to a supported external absolute directory.', 2);
    validateExecutionPath(env.LOCALAPPDATA, 'LOCALAPPDATA');
    value = path.join(env.LOCALAPPDATA, 'Worknaru-Dev');
  }
  validateExecutionPath(value, 'Data root (' + source + ')');
  const resolved = path.resolve(value);
  if (containsPath(repositoryRoot, resolved) || containsPath(resolved, repositoryRoot)) throw new DataError('invalid_configuration', 'Data root must be outside the product checkout and must not contain it. Use WORKNARU_DATA_DIR.', 2);
  return dataPaths(resolved, source, repositoryRoot);
}

export async function validateDataLocation(paths) {
  const actual = await actualPath(paths.dataHome);
  if (paths.legacy) {
    const expected = path.join(await actualPath(paths.repository), '.local/paseo-dev');
    if (!samePath(actual, expected) || !samePath(paths.dataHome, legacyPaths(paths.repository).dataHome)) throw new DataError('unsafe_reset_target', 'Legacy data must be the actual .local/paseo-dev directory, not a link to another location.');
  } else {
    validateExecutionPath(paths.dataHome, 'Data root'); validateExecutionPath(actual, 'Actual data root');
    const repository = await actualPath(paths.repository);
    if (containsPath(repository, actual) || containsPath(actual, repository)) throw new DataError('invalid_configuration', 'Actual data root overlaps the product checkout.', 2);
    const rootInfo = await lstat(paths.dataHome).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
    if (rootInfo?.isSymbolicLink()) throw new DataError('unsafe_reset_target', 'The data root itself cannot be a link. Select its verified physical path.');
    if (containsPath(actual, await actualPath(os.homedir()))) throw new DataError('unsafe_reset_target', 'A data root cannot contain the user home.');
    for (const home of [process.env.WORKNARU_PERSONAL_PASEO_HOME ?? process.env.PASEO_HOME, process.env.CODEX_HOME, path.join(os.homedir(), '.paseo'), path.join(os.homedir(), '.codex')].filter(Boolean)) {
      const personal = await actualPath(home);
      if (containsPath(actual, personal) || containsPath(personal, actual)) throw new DataError('unsafe_reset_target', 'A user or personal Provider home cannot be a Worknaru data root.');
    }
    if (samePath(actual, path.parse(actual).root)) throw new DataError('unsafe_reset_target', 'A drive or share root cannot be a Worknaru data root.');
  }
  return actual;
}

export function describeDataPaths(paths) {
  return 'Data root (' + paths.source + '): ' + paths.dataHome + '\nConfig: ' + paths.config + '\nServer ID: ' + paths.serverId
    + '\nPID: ' + paths.pid + '\nLogs: ' + paths.log + '; ' + paths.launcherLog + '\nWorktrees: ' + paths.worktrees + '\nTemporary/web files: ' + paths.temporary;
}

// Caller holds the operation lock and has validated/claimed the storage marker.
export async function prepareDataDirectories(paths) {
  await validateDataLocation(paths);
  for (const directory of [paths.dataHome, paths.temporary, paths.worktrees]) {
    const destination = await actualPath(directory);
    validateExecutionPath(destination, 'Execution directory');
    if (!containsPath(await actualPath(paths.dataHome), destination)) throw new DataError('unsafe_data_path', 'A managed directory points outside the data root: ' + directory);
    const probe = path.join(directory, '.worknaru-write-' + randomUUID());
    let handle;
    try {
      await mkdir(directory, { recursive: true });
      const actual = await actualPath(directory);
      if (!containsPath(await actualPath(paths.dataHome), actual)) throw new Error('Derived directory escapes data root');
      handle = await open(probe, 'wx');
    } catch (error) {
      throw new DataError('path_unwritable', 'Data directory is not writable (' + (error.code ?? 'error') + '): ' + directory);
    } finally {
      if (handle) { await handle.close(); await unlink(probe); }
    }
  }
}
