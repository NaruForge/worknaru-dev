import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { createAgentService } from '@worknaru/core/agent-service';
import { connectAgentDriver } from '@worknaru/paseo-adapter/agent-driver';
import { AgentError } from '@worknaru/runtime';
import { openStore } from './store.mjs';

export async function initialize() {
  // The owned launcher supplies these only to its dedicated daemon subprocess.
  const root = process.env.WORKNARU_AGENT_DATA_ROOT;
  const cwd = process.env.WORKNARU_AGENT_DEFAULT_CWD;
  if (!root || !cwd || !path.isAbsolute(root) || !path.isAbsolute(cwd)) throw new Error('Missing owned launcher configuration');
  const stateFile = process.env.WORKNARU_AGENT_STATE_FILE;
  if (!stateFile || path.dirname(stateFile) !== path.normalize(root)) throw new Error('Missing owned state path');
  const serverId = (await readFile(path.join(root, 'server-id'), 'utf8')).trim();
  let driver;
  for (let attempt = 0; attempt < 30; attempt++) {
    try { driver = await connectAgentDriver({ endpoint: 'ws://127.0.0.1:6868/ws', serverId, defaultCwd: cwd }); break; }
    catch { if (attempt === 29) throw new Error('Dedicated connection unavailable'); await delay(500); }
  }
  const store = openStore(stateFile);
  const service = createAgentService({ driver, store,
    async validateDirectory(directory) {
      if (!path.isAbsolute(directory)) throw new AgentError('invalid_directory', '작업 폴더는 절대경로여야 합니다.');
      try { if (!(await stat(directory)).isDirectory()) throw Error(); }
      catch { throw new AgentError('invalid_directory', '존재하는 작업 폴더를 선택해 주세요.'); }
    } });
  try { await service.initialize(); } catch (error) { await service.close().catch(() => {}); throw error; }
  return service;
}
