import type { DaemonStatus, Runtime } from '@worknaru/runtime';
import { AgentError, WorkspaceDomainError, type AgentAPI, type WorkspaceDomain } from '@worknaru/runtime';
export * from '@worknaru/runtime';
export { conversationMessages } from './conversation.js';
export * from './workspace-domain.js';
export * from './module-service.js';
import { ModuleError, type ModuleAPI } from '@worknaru/runtime';

export type { DaemonStatus } from '@worknaru/runtime';

/** Product API used by Worknaru applications. */
export interface WorknaruCore {
  readonly agents: AgentAPI;
  readonly workspace: WorkspaceDomain;
  readonly modules: ModuleAPI;
  getDaemonStatus(): Promise<DaemonStatus>;
}

/** The caller selects a Runtime; Core does not discover or configure providers. */
export function createWorknaruCore({ runtime }: { readonly runtime: Runtime }): WorknaruCore {
  const agents = () => {
    if (!runtime.agents) throw new AgentError('feature_unavailable', 'Agent 기능을 준비해 주세요. pnpm exec worknaru agent setup');
    return runtime.agents;
  };
  const workspace = () => {
    if (!runtime.workspace) throw new WorkspaceDomainError('feature_unavailable', 'Workspace 기능을 사용할 수 없습니다.');
    return runtime.workspace;
  };
  const modules = () => {
    if (!runtime.modules) throw new ModuleError('feature_unavailable', 'Module 기능을 사용할 수 없습니다.');
    return runtime.modules;
  };
  return {
    modules: {
      list: async () => modules().list(),
      execute: async input => modules().execute(input),
      getRun: async input => modules().getRun(input),
      listRuns: async input => modules().listRuns(input),
    },
    workspace: {
      createWorkspace: async input => workspace().createWorkspace(input),
      listWorkspaces: async () => workspace().listWorkspaces(),
      getWorkspace: async input => workspace().getWorkspace(input),
      createProject: async input => workspace().createProject(input),
      listProjects: async input => workspace().listProjects(input),
      getProject: async input => workspace().getProject(input),
    },
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
