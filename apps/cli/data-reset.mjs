import { execFile } from 'node:child_process';
import { lstat, readFile, readdir, realpath, rmdir, unlink } from 'node:fs/promises';
import path from 'node:path';
import net from 'node:net';
import { promisify } from 'node:util';
import { actualPath, containsPath, DataError, samePath, validateDataLocation } from '../../packages/dev-environment/paths.mjs';
import { acquireLock, exists, inspectStorage, regularJson, storageVersion, writeMarker } from '../../packages/dev-environment/storage.mjs';
import { portOpen, pipeFor } from './local-support.mjs';

const exec = promisify(execFile);
const next = 'pnpm exec worknaru doctor -> pnpm exec worknaru agent setup -> pnpm exec worknaru dev start -> pnpm exec worknaru status';
const excluded = ['Product source, .git, dependencies and build output', 'External Agent working folders and their files', 'Personal Paseo / Provider homes and credentials', 'Other data roots'];

async function processes() {
  const { stdout } = await exec('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
    'Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId | ConvertTo-Json -Compress'],
  { windowsHide: true, timeout: 15000, maxBuffer: 4 * 1024 * 1024 });
  return JSON.parse(stdout || '[]');
}
async function controllerOpen(token) {
  return new Promise((resolve, reject) => {
    const socket = net.connect(pipeFor(token));
    const finish = (error, value) => { socket.destroy(); error ? reject(error) : resolve(value); };
    socket.once('connect', () => finish(null, true));
    socket.once('error', error => ['ENOENT', 'ECONNREFUSED'].includes(error.code)
      ? finish(null, false) : finish(new DataError('reset_unconfirmed', 'Cannot verify the recorded control channel.')));
    socket.setTimeout(1000, () => finish(new DataError('reset_unconfirmed', 'The recorded control channel timed out.')));
  });
}
export async function verifyStopped(paths, { isPortOpen = portOpen, listProcesses = processes } = {}) {
  if (await isPortOpen()) throw new DataError('reset_running', 'Port 6868 is in use. Stop its original development launcher before reset.');
  const recordFile = path.join(paths.dataHome, 'dev-instance.json');
  let record; let pid;
  try {
    if (await exists(recordFile)) record = await regularJson(recordFile);
    if (await exists(paths.pid)) pid = await regularJson(paths.pid);
  } catch { throw new DataError('reset_unconfirmed', 'Execution records are unreadable. Verify the original processes have exited; no data was deleted.'); }
  if (!record && !pid) return;
  if (record && (record.schema !== 1 || !/^[a-f0-9-]{36}$/.test(record.token)
    || typeof record.repository !== 'string' || !path.isAbsolute(record.repository)
    || !Number.isInteger(record.controllerPid) || record.controllerPid <= 0
    || !samePath(record.dataRoot ?? '', paths.dataHome))) throw new DataError('reset_unconfirmed', 'Cannot prove that the recorded controller is stopped. Stop it from its original checkout.');
  if (pid && (!Number.isInteger(pid.pid) || pid.pid <= 0 || pid.listen !== '127.0.0.1:6868')) throw new DataError('reset_unconfirmed', 'Invalid Daemon PID record; reset is blocked.');
  if (record && await controllerOpen(record.token)) throw new DataError('reset_running', 'The recorded development controller is reachable. Use dev stop before reset.');
  let rows;
  try { rows = await listProcesses(); } catch { throw new DataError('reset_unconfirmed', 'Cannot inspect the Windows process tree. Reset is blocked.'); }
  rows = Array.isArray(rows) ? rows : [rows];
  if (rows.some(row => !Number.isInteger(row.ProcessId) || !Number.isInteger(row.ParentProcessId))) throw new DataError('reset_unconfirmed', 'The process snapshot is incomplete.');
  const ids = new Set([record?.controllerPid, pid?.pid].filter(Boolean));
  let changed;
  do {
    changed = false;
    for (const row of rows) if (ids.has(row.ParentProcessId) && !ids.has(row.ProcessId)) { ids.add(row.ProcessId); changed = true; }
  } while (changed);
  if (rows.some(row => ids.has(row.ProcessId))) throw new DataError('reset_running', 'A recorded process or descendant is still running. Use dev stop; reset never kills a saved PID.');
}

async function git(args, cwd) {
  const { stdout } = await exec('git', args, { cwd, windowsHide: true, timeout: 30000, maxBuffer: 1024 * 1024 });
  return stdout.trim();
}
async function worktreesUnder(directory) {
  const found = [];
  async function visit(folder) {
    for (const entry of await readdir(folder, { withFileTypes: true })) {
      const file = path.join(folder, entry.name);
      const info = await lstat(file);
      if (info.isSymbolicLink()) continue;
      if (entry.name === '.git' && info.isFile()) {
        try {
          const value = (await readFile(file, 'utf8')).trim();
          if (!value.startsWith('gitdir: ')) throw Error();
          const admin = await realpath(path.resolve(folder, value.slice(8)));
          const common = await realpath(path.resolve(admin, (await readFile(path.join(admin, 'commondir'), 'utf8')).trim()));
          if (!containsPath(path.join(common, 'worktrees'), admin)
            || !samePath(path.resolve(admin, (await readFile(path.join(admin, 'gitdir'), 'utf8')).trim()), file)
            || await exists(path.join(admin, 'locked'))) throw Error();
          const list = await git(['--git-dir', common, 'worktree', 'list', '--porcelain', '-z'], folder);
          if (!list.split('\0').some(line => line.startsWith('worktree ') && samePath(line.slice(9), folder))) throw Error();
          found.push({ directory: folder, common });
        } catch { throw new DataError('reset_worktree_unconfirmed', 'Cannot verify managed Git worktree registration: ' + folder); }
      } else if (info.isDirectory() && entry.name !== '.git') await visit(file);
    }
  }
  await visit(directory);
  return found;
}

export async function resetPlan(paths, { ignoreLock = false, stopped = verifyStopped } = {}) {
  const result = { kind: 'reset', state: 'planned', scope: paths.legacy ? 'legacy' : 'current', dataRoot: paths.dataHome,
    source: paths.source, ownerRepository: null, storageState: null, storageVersion: null, stopped: null,
    items: [], exclusions: excluded, blockers: [], confirmationRequired: true, next };
  try {
    if (!ignoreLock && await exists(paths.lock)) throw new DataError('operation_busy', 'An operation lock remains. Verify its owner before retrying reset.');
    const storage = await inspectStorage(paths, { ignoreLock });
    if (storage.kind === 'unknown') throw new DataError('unowned_data_root', 'This is not a verified Worknaru data root. An environment variable alone does not authorize deleting this directory.');
    result.ownerRepository = storage.marker?.repository ?? storage.repository ?? null;
    result.storageState = storage.marker?.state ?? storage.kind;
    result.storageVersion = storage.marker?.storageVersion ?? null;
    if (await exists(paths.dataHome)) {
      result.items = (await readdir(paths.dataHome)).filter(name => ![path.basename(paths.marker), path.basename(paths.lock)].includes(name)).map(name => path.join(paths.dataHome, name));
      if (paths.legacy) result.items.push(paths.dataHome);
    }
    await stopped(paths);
    result.stopped = true;
    if (await exists(paths.dataHome)) await worktreesUnder(paths.dataHome);
    const markerNeedsReset = storage.marker && (storage.marker.state === 'resetting' || storage.marker.storageVersion !== storageVersion
      || !samePath(storage.marker.repository, await actualPath(paths.repository)));
    if (!result.items.length && !markerNeedsReset) {
      result.state = 'empty'; result.confirmationRequired = false;
    }
  } catch (error) {
    result.state = 'blocked';
    if (error.code === 'reset_running') { result.stopped = false; result.next = 'pnpm exec worknaru dev stop' + (paths.legacy ? ' --legacy' : '') + ' (or stop the original launcher)'; }
    else result.next = 'Resolve the reported blocker, then repeat dev reset ' + (paths.legacy ? '--legacy ' : '') + '--dry-run';
    result.blockers.push({ code: error instanceof DataError ? error.code : 'reset_unconfirmed',
      message: error instanceof DataError ? error.message : 'Cannot verify the reset target. Check permissions and management records.' });
  }
  return result;
}

// No recursive shell commands and no traversal through reparse-point links.
async function removeEntry(file, boundary) {
  const info = await lstat(file);
  if (info.isSymbolicLink()) { await unlink(file); return; }
  if (info.isDirectory()) {
    if (!containsPath(boundary, await realpath(file))) throw new DataError('unsafe_reset_target', 'Directory changed outside the reset boundary.');
    for (const name of await readdir(file)) await removeEntry(path.join(file, name), boundary);
    await rmdir(file);
  } else { await unlink(file); }
}

export async function resetData(paths, { stopped = verifyStopped, remove = removeEntry } = {}) {
  const plan = await resetPlan(paths, { stopped });
  if (plan.blockers.length) throw new DataError(plan.blockers[0].code, plan.blockers[0].message);
  if (!await exists(paths.dataHome)) return { ...plan, confirmationRequired: false };
  let releaseBuild; let release;
  try {
    if (paths.legacy) releaseBuild = await acquireLock(path.join(paths.repository, '.local/dev-build.lock'));
    release = await acquireLock(paths.lock);
    const current = await resetPlan(paths, { ignoreLock: true, stopped });
    if (current.blockers.length) throw new DataError(current.blockers[0].code, current.blockers[0].message);
    const boundary = await validateDataLocation(paths);
    const worktrees = await worktreesUnder(paths.dataHome);
    await writeMarker(paths, 'resetting');
    try {
      for (const worktree of worktrees.sort((a, b) => b.directory.length - a.directory.length)) {
        await git(['--git-dir', worktree.common, 'worktree', 'remove', '--force', '--', worktree.directory], paths.dataHome);
      }
      for (const name of await readdir(paths.dataHome)) {
        if ([path.basename(paths.marker), path.basename(paths.lock)].includes(name)) continue;
        if (!samePath(boundary, await actualPath(paths.dataHome))) throw Error('Reset root changed');
        await remove(path.join(paths.dataHome, name), boundary);
      }
      if (!paths.legacy) await writeMarker(paths, 'empty');
    } catch { throw new DataError('reset_incomplete', 'Some data could not be deleted. Setup/start remain blocked. Resolve file locks or permissions and repeat dev reset --yes.'); }
    await release(); release = null;
    if (paths.legacy) {
      try {
        await unlink(paths.marker);
        await rmdir(paths.dataHome);
      } catch {
        if (await exists(paths.dataHome)) await writeMarker(paths, 'resetting');
        throw new DataError('reset_incomplete', 'Legacy removal did not finish. Repeat dev reset --legacy --yes.');
      }
    }
    return { ...current, state: 'reset', storageState: paths.legacy ? 'absent' : 'empty',
      storageVersion: paths.legacy ? null : storageVersion, previousOwnerRepository: current.ownerRepository,
      ownerRepository: paths.legacy ? null : await actualPath(paths.repository), confirmationRequired: false, blockers: [] };
  } finally {
    try { await release?.(); } finally { await releaseBuild?.(); }
  }
}
