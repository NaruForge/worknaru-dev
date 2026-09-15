/** Worknaru business containers, not filesystem paths or Paseo entities. */
export interface Workspace {
  readonly id: string;
  readonly name: string;
  readonly createdAt: string;
}

export interface Project {
  readonly id: string;
  readonly workspaceId: string;
  readonly name: string;
  readonly createdAt: string;
}

export interface CreateWorkspaceInput { readonly name: string }
export interface CreateProjectInput { readonly workspaceId: string; readonly name: string }
export interface EntityInput { readonly id: string }
export interface ListProjectsInput { readonly workspaceId: string }

type Stored<T> = T | Promise<T>;

/** Persistence port. Inserts must be atomic; insertProject must enforce the parent FK. */
export interface WorkspaceStore {
  insertWorkspace(workspace: Workspace): Stored<void>;
  findWorkspace(id: string): Stored<Workspace | null>;
  listWorkspaces(): Stored<readonly Workspace[]>;
  insertProject(project: Project): Stored<void>;
  findProject(id: string): Stored<Project | null>;
  listProjects(workspaceId: string): Stored<readonly Project[]>;
}

export type WorkspaceDomainErrorCode =
  | 'invalid_input' | 'workspace_not_found' | 'project_not_found' | 'storage_error';

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

function fields(input: unknown, allowed: readonly string[]): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)
    || Reflect.ownKeys(input).some(key => typeof key !== 'string' || !allowed.includes(key))) {
    throw new WorkspaceDomainError('invalid_input', '허용된 필드로 입력 객체를 지정해 주세요.');
  }
  return input as Record<string, unknown>;
}

function name(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 200
    || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new WorkspaceDomainError('invalid_input', '이름은 제어 문자 없이 1~200자로 지정해 주세요.');
  }
  return value.trim();
}

function id(value: unknown): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value)) {
    throw new WorkspaceDomainError('invalid_input', '생성된 대상의 ID를 명시해 주세요.');
  }
  return value;
}

async function storage<T>(operation: () => Stored<T>): Promise<T> {
  try { return await operation(); }
  catch {
    // Never expose SQL, local filenames or driver-specific exception messages.
    throw new WorkspaceDomainError('storage_error', '업무 데이터를 읽거나 저장하지 못했습니다.');
  }
}

/** No Runtime, Agent, default workspace, cwd or database discovery is needed. */
export function createWorkspaceDomain({ store }: { readonly store: WorkspaceStore }): WorkspaceDomain {
  async function workspace(workspaceId: string): Promise<Workspace> {
    const result = await storage(() => store.findWorkspace(workspaceId));
    if (!result) throw new WorkspaceDomainError('workspace_not_found', 'Workspace를 찾을 수 없습니다.');
    return { ...result };
  }

  return {
    async createWorkspace(input) {
      const normalizedName = name(fields(input, ['name']).name);
      const result: Workspace = {
        id: globalThis.crypto.randomUUID(), name: normalizedName, createdAt: new Date().toISOString(),
      };
      await storage(() => store.insertWorkspace(result));
      return { ...result };
    },
    async listWorkspaces() {
      return (await storage(() => store.listWorkspaces())).map(value => ({ ...value }));
    },
    async getWorkspace(input) {
      return workspace(id(fields(input, ['id']).id));
    },
    async createProject(input) {
      const values = fields(input, ['workspaceId', 'name']);
      const workspaceId = id(values.workspaceId);
      const normalizedName = name(values.name);
      await workspace(workspaceId);
      const result: Project = {
        id: globalThis.crypto.randomUUID(), workspaceId, name: normalizedName, createdAt: new Date().toISOString(),
      };
      await storage(() => store.insertProject(result));
      return { ...result };
    },
    async listProjects(input) {
      const workspaceId = id(fields(input, ['workspaceId']).workspaceId);
      await workspace(workspaceId);
      return (await storage(() => store.listProjects(workspaceId))).map(value => ({ ...value }));
    },
    async getProject(input) {
      const projectId = id(fields(input, ['id']).id);
      const result = await storage(() => store.findProject(projectId));
      if (!result) throw new WorkspaceDomainError('project_not_found', 'Project를 찾을 수 없습니다.');
      return { ...result };
    },
  };
}
