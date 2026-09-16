import { ExecutionContextError, WorkspaceDomainError, parseExecutionTarget, parseExecutionContext,
  type ExecutionContext, type WorkspaceDomain } from '@worknaru/runtime';

/** Product context only: no prompt rendering, cwd discovery, files or permissions. */
export function createContextResolver(workspace?: Pick<WorkspaceDomain, 'getWorkspace' | 'getProject'>) {
  return async (raw: unknown): Promise<ExecutionContext> => {
    const target = parseExecutionTarget(raw);
    if (target.type === 'standalone') return Object.freeze({ type: 'standalone', workspaceId: null, projectId: null });
    if (!workspace) throw new ExecutionContextError('feature_unavailable', '업무 컨텍스트 조회 기능이 준비되지 않았습니다.');
    try {
      if (target.type === 'workspace') {
        const item = await workspace.getWorkspace({ id: target.workspaceId });
        if (item.id !== target.workspaceId) throw new ExecutionContextError('invalid_response', 'Workspace 조회 결과가 대상과 다릅니다.');
        return parseExecutionContext({ type: target.type, workspaceId: target.workspaceId, projectId: null });
      }
      const project = await workspace.getProject({ id: target.projectId });
      if (project.id !== target.projectId) throw new ExecutionContextError('invalid_response', 'Project 조회 결과가 대상과 다릅니다.');
      const context = parseExecutionContext({ type: target.type, projectId: project.id, workspaceId: project.workspaceId });
      const parent = await workspace.getWorkspace({ id: project.workspaceId });
      if (parent.id !== context.workspaceId) throw new ExecutionContextError('invalid_response', 'Project 소속 Workspace를 확인할 수 없습니다.');
      return context;
    } catch (error) {
      if (error instanceof WorkspaceDomainError) throw new ExecutionContextError(error.code, error.message);
      if (error instanceof ExecutionContextError) throw error;
      throw new ExecutionContextError('service_error', '업무 컨텍스트를 확인하지 못했습니다.');
    }
  };
}
