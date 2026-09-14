import { lstat, mkdir, open, readFile, readdir, rename, unlink } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { actualPath, DataError, legacyPaths, samePath, validateDataLocation, validateDirectory } from './paths.mjs';

export const storageVersion = 1;
export async function exists(file) {
  try { await lstat(file); return true; } catch (error) { if (error.code === 'ENOENT') return false; throw error; }
}
export async function regularJson(file) {
  const info = await lstat(file);
  if (!info.isFile() || info.size > 65536) throw new DataError('unowned_data_root', 'Expected a regular, bounded management file: ' + file);
  return JSON.parse(await readFile(file, 'utf8'));
}
export async function acquireLock(file) {
  const token = randomUUID();
  let handle;
  try { handle = await open(file, 'wx'); }
  catch (error) {
    if (error.code === 'EEXIST') throw new DataError('operation_busy', 'Another operation is running, or its lock remains. Verify the owner has exited before removing a stale lock: ' + file);
    throw new DataError('path_unwritable', 'Cannot create the operation lock: ' + file);
  }
  try { await handle.writeFile(JSON.stringify({ token, pid: process.pid, startedAt: new Date().toISOString() })); }
  catch {
    // A failed write must release only the file created by this invocation.
    const owned = await handle.stat();
    await handle.close(); handle = null;
    const current = await lstat(file).catch(() => null);
    if (current?.isFile() && current.dev === owned.dev && current.ino === owned.ino) await unlink(file);
    throw new DataError('path_unwritable', 'Cannot write the operation lock: ' + file);
  } finally { await handle?.close(); }
  return async () => {
    const value = await regularJson(file);
    if (value.token === token) await unlink(file);
  };
}

export async function acquireDataLock(paths) {
  await validateDataLocation(paths);
  await mkdir(paths.dataHome, { recursive: true });
  await validateDataLocation(paths);
  return acquireLock(paths.lock);
}

export async function inspectStorage(paths, { ignoreLock = false } = {}) {
  const actual = await validateDataLocation(paths);
  if (!await exists(paths.dataHome)) return { kind: 'empty', marker: null };
  if (await exists(paths.marker)) {
    let marker;
    try { marker = await regularJson(paths.marker); }
    catch { throw new DataError('unowned_data_root', 'The Worknaru data marker is unreadable. No data was changed.'); }
    if (marker.product !== 'worknaru-dev' || marker.markerVersion !== 1
      || typeof marker.repository !== 'string' || !path.isAbsolute(marker.repository)
      || typeof marker.dataRoot !== 'string' || !samePath(marker.dataRoot, actual)
      || !Number.isInteger(marker.storageVersion) || !['ready', 'empty', 'resetting'].includes(marker.state)) {
      throw new DataError('unowned_data_root', 'The directory does not have a valid Worknaru ownership marker.');
    }
    return { kind: 'owned', marker };
  }
  const names = (await readdir(paths.dataHome)).filter(name => !ignoreLock || name !== path.basename(paths.lock));
  if (!names.length) return { kind: 'empty', marker: null };
  // Recognize the old dedicated layout only for deletion, never for runtime loading.
  try {
    const config = await regularJson(paths.config);
    const idInfo = await lstat(paths.serverId);
    const serverId = idInfo.isFile() && idInfo.size < 512 ? (await readFile(paths.serverId, 'utf8')).trim() : '';
    if (config.version !== 1 || config.daemon?.listen !== '127.0.0.1:6868'
      || config.daemon?.relay?.enabled !== false || config.daemon?.mcp?.enabled !== false
      || !samePath(config.worktrees?.root ?? '', paths.worktrees)
      || !samePath(config.log?.file?.path ?? '', paths.log)
      || !/^[A-Za-z0-9_-]+$/.test(serverId)) throw Error();
    const plugin = config.plugins?.['worknaru-agent-service'];
    if (config.pluginsEnabled && (plugin?.source !== 'directory' || !path.isAbsolute(plugin.path)
      || !/[\\/]apps[\\/]agent-service[\\/]?$/.test(plugin.path))) throw Error();
    return { kind: 'legacy', marker: null, repository: plugin ? path.resolve(plugin.path, '../..') : paths.repository };
  } catch { return { kind: 'unknown', marker: null }; }
}

export async function writeMarker(paths, state) {
  const value = {
    product: 'worknaru-dev', markerVersion: 1, storageVersion,
    dataRoot: await actualPath(paths.dataHome), repository: await actualPath(paths.repository), state,
  };
  const temporary = paths.marker + '.' + randomUUID() + '.tmp';
  const handle = await open(temporary, 'wx');
  try { await handle.writeFile(JSON.stringify(value) + '\n'); await handle.sync(); }
  finally { await handle.close(); }
  try { await rename(temporary, paths.marker); }
  catch (error) { await unlink(temporary).catch(() => {}); throw error; }
  return value;
}

// Administrative entries are never redirected through links. Managed user files
// below worktrees remain free to contain links; reset removes those links only.
async function validateAdministrativeEntries(paths) {
  const names = ['config.json', 'server-id', 'daemon-keypair.json', 'paseo.pid',
    'dev-instance.json', 'agent-state.sqlite', 'agent-state.sqlite-wal', 'agent-state.sqlite-shm',
    'daemon.log', 'launcher.log', 'dev-runner.log', 'build.log', 'runtime', 'schedules', 'tmp', 'worktrees'];
  for (const name of names) {
    const file = path.join(paths.dataHome, name);
    if (await exists(file) && (await lstat(file)).isSymbolicLink()) {
      throw new DataError('unsafe_data_path', 'A managed data entry is a link. Reset the dedicated data before setup/start: ' + file);
    }
  }
}

export async function assertStorage(paths, { claim = false, ignoreLock = false } = {}) {
  if (!ignoreLock && await exists(paths.lock) && !await exists(paths.marker)) throw new DataError('operation_busy', 'Another operation is preparing this root. Wait or inspect its operation lock.');
  const state = await inspectStorage(paths, { ignoreLock });
  if (state.kind === 'unknown') throw new DataError('unowned_data_root', 'This nonempty directory is not a verified Worknaru data root. Choose a new empty directory.');
  if (state.kind === 'legacy' || (state.marker && state.marker.storageVersion !== storageVersion)) throw new DataError('reset_required', 'The stored data layout is not supported. Run pnpm exec worknaru dev reset --dry-run, then --yes. Data migration is not supported.');
  if (state.marker?.state === 'resetting') throw new DataError('reset_incomplete', 'A previous reset did not finish. Repeat pnpm exec worknaru dev reset --yes before setup/start.');
  if (state.marker && !samePath(state.marker.repository, await actualPath(paths.repository))) throw new DataError('ownership_conflict', 'This data root belongs to another checkout. After confirming it is stopped, explicitly reset it to start fresh.');
  if (claim) {
    await validateAdministrativeEntries(paths);
    await validateDirectory(paths.repository, 'Development checkout');
    if (!state.marker || state.marker.state === 'empty') await writeMarker(paths, 'ready');
  }
  return state;
}

export async function assertNoLegacy(paths) {
  if (await exists(legacyPaths(paths.repository).dataHome)) throw new DataError('legacy_data_present', 'Old repository data must be deleted before startup. Run pnpm exec worknaru dev reset --legacy --dry-run, then --legacy --yes.');
}
