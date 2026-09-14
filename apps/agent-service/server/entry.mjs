import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { createAgentService } from '@worknaru/core/agent-service';
import { connectAgentDriver } from '@worknaru/paseo-adapter/agent-driver';
import { AgentError } from '@worknaru/runtime';
import { openStore } from './store.mjs';
import { resolveDataPaths, directoryQuery, validateDirectory as validateWorkingDirectory } from '@worknaru/dev-environment/paths';
import { assertStorage } from '@worknaru/dev-environment/storage';

export async function initialize() {
  // The owned launcher supplies these only to its dedicated daemon subprocess.
  const root = process.env.WORKNARU_AGENT_DATA_ROOT;
  if (!root || !path.isAbsolute(root) || !process.env.WORKNARU_REPOSITORY_ROOT) throw new Error('Missing owned launcher configuration');
  await assertStorage(resolveDataPaths({ WORKNARU_DATA_DIR: root }, process.env.WORKNARU_REPOSITORY_ROOT));
  const stateFile = process.env.WORKNARU_AGENT_STATE_FILE;
  if (!stateFile || path.dirname(stateFile) !== path.normalize(root)) throw new Error('Missing owned state path');
  const serverId = (await readFile(path.join(root, 'server-id'), 'utf8')).trim();
  let driver;
  for (let attempt = 0; attempt < 30; attempt++) {
    try { driver = await connectAgentDriver({ endpoint: 'ws://127.0.0.1:6868/ws', serverId }); break; }
    catch { if (attempt === 29) throw new Error('Dedicated connection unavailable'); await delay(500); }
  }
  const directories = driver.directories;
  driver.directories = async query => {
    try { return await directories(await directoryQuery(query)); }
    catch (error) { throw new AgentError('invalid_directory', error.message); }
  };
  const store = openStore(stateFile);
  const service = createAgentService({ driver, store,
    async validateDirectory(directory) {
      try { await validateWorkingDirectory(directory); }
      catch (error) { throw new AgentError('invalid_directory', error.message); }
    } });
  try { await service.initialize(); } catch (error) { await service.close().catch(() => {}); throw error; }
  return service;
}
