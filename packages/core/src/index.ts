import type { DaemonStatus, Runtime } from '@worknaru/runtime';
import { AgentError, type AgentAPI } from '@worknaru/runtime';
export * from '@worknaru/runtime';
export { conversationMessages } from './conversation.js';

export type { DaemonStatus } from '@worknaru/runtime';

/** Product API used by Worknaru applications. */
export interface WorknaruCore {
  readonly agents: AgentAPI;
  getDaemonStatus(): Promise<DaemonStatus>;
}

/** The caller selects a Runtime; Core does not discover or configure providers. */
export function createWorknaruCore({ runtime }: { readonly runtime: Runtime }): WorknaruCore {
  const agents = () => {
    if (!runtime.agents) throw new AgentError('feature_unavailable', 'Agent 기능을 준비해 주세요. pnpm exec worknaru agent setup');
    return runtime.agents;
  };
  return {
    agents: {
      health: input => agents().health(input),
      options: input => agents().options(input),
      directories: input => agents().directories(input),
      create: input => agents().create(input),
      list: input => agents().list(input),
      show: input => agents().show(input),
      history: input => agents().history(input),
      send: input => agents().send(input),
      requests: input => agents().requests(input),
      cancel: input => agents().cancel(input),
      discard: input => agents().discard(input),
      resume: input => agents().resume(input),
      permission: input => agents().permission(input),
      archivePreview: input => agents().archivePreview(input),
      archive: input => agents().archive(input),
      settings: input => agents().settings(input),
      saveSettings: input => agents().saveSettings(input),
    },
    getDaemonStatus: () => runtime.getDaemonStatus(),
  };
}
