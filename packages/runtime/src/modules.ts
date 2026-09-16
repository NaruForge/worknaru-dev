import type { WorkspaceDomainErrorCode } from './workspace-domain.js';
import type { ExecutionTarget, ExecutionContext } from './execution-context.js';

export type ModuleTarget = ExecutionTarget;
export type ModuleContext = ExecutionContext;
export interface ModuleDefinition {
  readonly id: string;
  readonly version: string;
  readonly name: string;
  readonly contexts: readonly ModuleTarget['type'][];
}
export type ModuleRunStatus = 'accepted' | 'running' | 'succeeded' | 'failed' | 'uncertain';
export interface ModuleRun {
  readonly id: string;
  readonly requestId: string;
  readonly moduleId: string;
  readonly moduleVersion: string;
  readonly context: ModuleContext;
  readonly input: Readonly<Record<string, unknown>>;
  readonly status: ModuleRunStatus;
  readonly result: Readonly<Record<string, unknown>> | null;
  readonly error: { readonly code: 'execution_failed' | 'interrupted'; readonly message: string } | null;
  readonly createdAt: string;
  readonly startedAt: string | null;
  readonly finishedAt: string | null;
}
export interface ExecuteModuleInput {
  readonly requestId: string;
  readonly moduleId: string;
  readonly target: ModuleTarget;
  readonly input: Readonly<Record<string, unknown>>;
}
export type ModuleErrorCode = WorkspaceDomainErrorCode | 'module_not_found' | 'run_not_found' | 'request_conflict';
export class ModuleError extends Error {
  constructor(readonly code: ModuleErrorCode, message: string) { super(message); this.name = 'ModuleError'; }
}
export interface ModuleAPI {
  list(): Promise<ModuleDefinition[]>;
  execute(input: ExecuteModuleInput): Promise<ModuleRun>;
  getRun(input: { readonly id: string }): Promise<ModuleRun>;
  listRuns(input: { readonly target: ModuleTarget }): Promise<ModuleRun[]>;
}
