import type { DaemonStatus, Runtime } from '@worknaru/runtime';
import { AgentError, type AgentAPI } from '@worknaru/runtime';
export * from '@worknaru/runtime';
export { conversationMessages } from './conversation.js';

export type { DaemonStatus } from '@worknaru/runtime';

/** Product API used by Worknaru applications. */
export interface WorknaruCore extends AgentAPI {
  getDaemonStatus(): Promise<DaemonStatus>;
}

/** The caller selects a Runtime; Core does not discover or configure providers. */
export function createWorknaruCore({ runtime }: { readonly runtime: Runtime }): WorknaruCore {
  return {
    agents: (operation, input) => {
      if (!runtime.agents) throw new AgentError('feature_unavailable', 'Agent 기능을 준비해 주세요. pnpm exec worknaru agent setup');
      return runtime.agents(operation, input);
    },
    getDaemonStatus: () => runtime.getDaemonStatus(),
  };
}
