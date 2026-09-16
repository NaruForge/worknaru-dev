import type { WorkspaceDomainErrorCode } from './workspace-domain.js';

export type ExecutionTarget = { readonly type: 'standalone' }
  | { readonly type: 'workspace'; readonly workspaceId: string }
  | { readonly type: 'project'; readonly projectId: string };
export type ExecutionContext = { readonly type: 'standalone'; readonly workspaceId: null; readonly projectId: null }
  | { readonly type: 'workspace'; readonly workspaceId: string; readonly projectId: null }
  | { readonly type: 'project'; readonly workspaceId: string; readonly projectId: string };
export type AgentExecutionContext = ExecutionContext;
export class ExecutionContextError extends Error {
  constructor(readonly code: WorkspaceDomainErrorCode, message: string) { super(message); this.name = 'ExecutionContextError'; }
}
const invalid = () => new ExecutionContextError('invalid_input', '실행 대상의 형식과 전체 UUID를 확인해 주세요.');
function fields(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Reflect.ownKeys(value).some(key => typeof key !== 'string' || !keys.includes(key))
    || keys.some(key => !Object.hasOwn(value, key))) throw invalid();
  return value as Record<string, unknown>;
}
function uuid(value: unknown): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value)) throw invalid();
  return value;
}
/** Shape validation only. Existence and ownership must be resolved on the server. */
export function parseExecutionTarget(value: unknown): ExecutionTarget {
  const type = (value as ExecutionTarget | null)?.type;
  if (type === 'standalone') { fields(value, ['type']); return Object.freeze({ type }); }
  if (type === 'workspace') return Object.freeze({ type, workspaceId: uuid(fields(value, ['type', 'workspaceId']).workspaceId) });
  if (type === 'project') return Object.freeze({ type, projectId: uuid(fields(value, ['type', 'projectId']).projectId) });
  throw invalid();
}
/** Copy and freeze an already resolved snapshot; never fill missing context from ambient state. */
export function parseExecutionContext(value: unknown): ExecutionContext {
  const item = fields(value, ['type', 'workspaceId', 'projectId']);
  if (item.type === 'standalone' && item.workspaceId === null && item.projectId === null)
    return Object.freeze({ type: 'standalone', workspaceId: null, projectId: null });
  if (item.type === 'workspace' && item.projectId === null)
    return Object.freeze({ type: 'workspace', workspaceId: uuid(item.workspaceId), projectId: null });
  if (item.type === 'project')
    return Object.freeze({ type: 'project', workspaceId: uuid(item.workspaceId), projectId: uuid(item.projectId) });
  throw invalid();
}
