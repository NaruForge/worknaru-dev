import { mkdir, open, readFile, rename, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { agentConfig, agentsEnabled, configState } from '../../packages/dev-environment/config.mjs';
import { prepareDataDirectories, root } from '../../packages/dev-environment/paths.mjs';
import { inspect, prerequisites } from './local.mjs';
import { acquireLock, LocalError, pnpmCommand } from './local-support.mjs';

export async function setupAgents(paths) {
  if ((await inspect(paths)).state !== 'stopped') throw new LocalError('operation_busy', '먼저 pnpm exec worknaru dev stop으로 개발 환경을 종료해 주세요.');
  if (await agentsEnabled(paths)) return { ready: true, reused: true, next: 'pnpm exec worknaru dev start' };
  const checks = await prerequisites();
  if (checks.some(c => !c.ok)) throw new LocalError('prerequisite_failed', 'doctor로 의존성과 Node·pnpm을 확인해 주세요.');
  if (await configState(paths) === 'conflict') throw new LocalError('configuration_conflict', '기존 설정이 기본 개발 설정과 다릅니다. 설정을 덮어쓰지 않았습니다.');
  await prepareDataDirectories(paths);
  const release = await acquireLock(paths.lock);
  let retainLocks = false;
  try {
    if ((await inspect({ ...paths, lock: `${paths.lock}.ignored` })).state !== 'stopped') throw new LocalError('operation_busy', '개발 환경 상태가 변경됐습니다.');
    const before = existsSync(paths.config) ? await readFile(paths.config, 'utf8') : null;
    await mkdir(path.join(root, '.local'), { recursive: true });
    const releaseBuild = await acquireLock(path.join(root, '.local/dev-build.lock'));
    let log;
    try { log = await open(paths.buildLog, 'w'); await pnpmCommand('build', { log: log.fd, timeoutMs: 180000 }); }
    catch (error) { retainLocks = error.retainLocks === true; throw error; }
    finally { await log?.close(); if (!retainLocks) await releaseBuild(); }
    const latest = existsSync(paths.config) ? await readFile(paths.config, 'utf8') : null;
    if (latest !== before) throw new LocalError('configuration_conflict', '준비 중 설정이 변경되어 적용하지 않았습니다.');
    if (before !== null) await writeFile(path.join(paths.dataHome, `config.before-agents-${Date.now()}.json`), before, { flag: 'wx' });
    const temporary = `${paths.config}.agent-setup-${crypto.randomUUID()}`;
    await writeFile(temporary, `${JSON.stringify(agentConfig(paths), null, 2)}\n`, { flag: 'wx' });
    await rename(temporary, paths.config);
    return { ready: true, reused: false, next: 'pnpm exec worknaru dev start' };
  } finally { if (!retainLocks) await release(); }
}
