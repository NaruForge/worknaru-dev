import path from 'node:path';
import { createModuleService } from '@worknaru/core';
import { resolveDataPaths } from '@worknaru/dev-environment/paths';
import { assertStorage } from '@worknaru/dev-environment/storage';
import { openModuleStore } from './module-store.mjs';
import { textStats } from './modules.mjs';

export async function initializeModules(workspace) {
  const root = process.env.WORKNARU_AGENT_DATA_ROOT;
  const repository = process.env.WORKNARU_REPOSITORY_ROOT;
  if (!root || !path.isAbsolute(root) || !repository) throw Error('Missing owned launcher configuration');
  const ownership = await assertStorage(resolveDataPaths({ WORKNARU_DATA_DIR: root }, repository));
  if (ownership.kind !== 'owned' || ownership.marker.state !== 'ready') throw Error('Module storage requires a ready owned root.');
  const store = openModuleStore(path.join(root, 'module-runs.sqlite'));
  try {
    const api = createModuleService({ store, workspace, implementations: [textStats] });
    return { api, async close() { await api.close(); store.close(); } };
  } catch (error) { store.close(); throw error; }
}
