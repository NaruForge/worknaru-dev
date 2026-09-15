/** Worknaru business containers, not filesystem paths or Paseo entities. */
export interface Workspace {
  readonly id: string;
  readonly name: string;
  readonly createdAt: string;
}

export interface Project extends Workspace {
  readonly workspaceId: string;
}

export interface CreateWorkspaceInput { readonly name: string }
export interface CreateProjectInput { readonly workspaceId: string; readonly name: string }
export interface EntityInput { readonly id: string }
export interface ListProjectsInput { readonly workspaceId: string }

export type WorkspaceDomainErrorCode =
  | 'invalid_input' | 'workspace_not_found' | 'project_not_found' | 'storage_error'
  | 'feature_unavailable' | 'service_error' | 'connection_failed'
  | 'authentication_required' | 'authentication_failed' | 'timeout'
  | 'target_mismatch' | 'unsupported_version' | 'invalid_response';

export class WorkspaceDomainError extends Error {
  constructor(readonly code: WorkspaceDomainErrorCode, message: string) {
    super(message);
    this.name = 'WorkspaceDomainError';
  }
}

export interface WorkspaceDomain {
  createWorkspace(input: CreateWorkspaceInput): Promise<Workspace>;
  listWorkspaces(): Promise<Workspace[]>;
  getWorkspace(input: EntityInput): Promise<Workspace>;
  createProject(input: CreateProjectInput): Promise<Project>;
  listProjects(input: ListProjectsInput): Promise<Project[]>;
  getProject(input: EntityInput): Promise<Project>;
}
