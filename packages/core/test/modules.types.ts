import { type WorknaruCore, type ModuleRun, type ModuleTarget } from '../src/index.js';
declare const core: WorknaruCore;
const standalone: ModuleTarget = { type: 'standalone' };
async function contract() {
  const run: ModuleRun = await core.modules.execute({ requestId: 'id', moduleId: 'text-stats', target: standalone, input: { text: '' } });
  await core.modules.getRun({ id: run.id });
  await core.modules.listRuns({ target: { type: 'project', projectId: 'id' } });
  // @ts-expect-error Project determines Workspace, not an independent selection.
  const invalid: ModuleTarget = { type: 'project', projectId: 'id', workspaceId: 'other' };
  // @ts-expect-error No implicit execution target.
  await core.modules.execute({ requestId: 'id', moduleId: 'text-stats', input: { text: '' } });
  void invalid;
}
void contract;
