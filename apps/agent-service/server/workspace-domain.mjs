import path from 'node:path';
import { createWorkspaceDomain } from '@worknaru/core';
import { resolveDataPaths } from '@worknaru/dev-environment/paths';
import { assertStorage } from '@worknaru/dev-environment/storage';
import { openWorkspaceStore } from './workspace-store.mjs';

/** Independent of Agent driver initialization and Provider availability. */
export async function initializeWorkspaceDomain() {
  const root = process.env.WORKNARU_AGENT_DATA_ROOT;
  const repositoryRoot = process.env.WORKNARU_REPOSITORY_ROOT;
  if (!root || !path.isAbsolute(root) || !repositoryRoot) {
    throw new Error('Missing owned launcher configuration');
  }
  const ownership = await assertStorage(resolveDataPaths({ WORKNARU_DATA_DIR: root }, repositoryRoot));
  if (ownership.kind !== 'owned' || ownership.marker.state !== 'ready') {
    throw new Error('Workspace storage requires a ready, owned data root.');
  }
  const store = openWorkspaceStore(path.join(root, 'worknaru-domain.sqlite'));
  try {
    return { api: createWorkspaceDomain({ store }), close: () => store.close() };
  } catch (error) { store.close(); throw error; }
}
