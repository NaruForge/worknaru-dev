import { randomUUID } from 'node:crypto';
import { link, lstat, mkdir, open, readFile, realpath, unlink } from 'node:fs/promises';
import path from 'node:path';
import { DataError, samePath, validateDataLocation } from './paths.mjs';

const invalid = message => { throw new DataError('system_agent_directory', message); };

// Read-only check used at every open/send. Never follow a linked instruction file.
export async function validateSystemAgentDirectory(paths) {
  const root = await validateDataLocation(paths);
  const directory = path.join(paths.dataHome, 'system-agent');
  try {
    const info = await lstat(directory);
    if (!info.isDirectory() || info.isSymbolicLink()
      || !samePath(await realpath(directory), path.join(root, 'system-agent'))) invalid('System Agent 작업 폴더가 올바르지 않습니다. 링크나 경로 충돌을 확인해 주세요.');
    const filename = path.join(directory, 'AGENTS.md');
    const file = await lstat(filename);
    if (!file.isFile() || file.isSymbolicLink() || file.nlink !== 1) invalid('System Agent AGENTS.md는 링크가 아닌 일반 파일이어야 합니다.');
    if (!(await readFile(filename, 'utf8')).trim()) invalid('System Agent AGENTS.md가 비어 있습니다. 내용을 확인해 주세요. 기존 파일은 덮어쓰지 않습니다.');
    // Codex selects AGENTS.override.md ahead of AGENTS.md; do not silently use it.
    const override = await lstat(path.join(directory, 'AGENTS.override.md')).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
    if (override) invalid('System Agent의 AGENTS.override.md가 기본 지침을 가립니다. 파일을 확인해 주세요.');
    return directory;
  } catch (error) {
    if (error instanceof DataError) throw error;
    throw new DataError('system_agent_directory', 'System Agent 지침을 읽을 수 없습니다 (' + error.code + '). 폴더·파일과 권한을 확인한 뒤 agent setup을 실행해 주세요.');
  }
}

// Called only during setup/start, with the owned data operation lock held.
export async function prepareSystemAgent(paths, { openFile = open } = {}) {
  await validateDataLocation(paths);
  const directory = path.join(paths.dataHome, 'system-agent');
  try {
    const existing = await lstat(directory).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
    if (existing && (!existing.isDirectory() || existing.isSymbolicLink())) invalid('System Agent 작업 폴더에 링크 또는 파일 충돌이 있습니다.');
    await mkdir(directory, { recursive: true });
    const root = await realpath(paths.dataHome);
    if (!samePath(await realpath(directory), path.join(root, 'system-agent'))) invalid('System Agent 작업 폴더가 전용 위치와 다릅니다.');
    const filename = path.join(directory, 'AGENTS.md');
    const file = await lstat(filename).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
    if (!file) {
      const template = await readFile(new URL('./assets/system-agent/AGENTS.md', import.meta.url), 'utf8');
      const temporary = path.join(directory, '.AGENTS-' + randomUUID() + '.tmp');
      const handle = await openFile(temporary, 'wx');
      try {
        try { await handle.writeFile(template); await handle.sync(); } finally { await handle.close(); }
        // Publish only complete bytes; link fails if another file appeared meanwhile.
        // Unlike rename, this never replaces an existing instruction file.
        await link(temporary, filename);
      } finally { await unlink(temporary); }
    }
    return await validateSystemAgentDirectory(paths);
  } catch (error) {
    if (error instanceof DataError) throw error;
    throw new DataError('system_agent_directory', 'System Agent 초기 지침을 준비하지 못했습니다 (' + error.code + '). 저장 위치와 쓰기 권한을 확인해 주세요.');
  }
}
