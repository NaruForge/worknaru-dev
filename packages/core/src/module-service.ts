import {
  ModuleError, WorkspaceDomainError, type ModuleAPI, type ModuleDefinition, type ModuleRun,
  type ModuleContext, type ModuleTarget, type WorkspaceDomain,
} from '@worknaru/runtime';

/** Only trusted, app-supplied implementations are executable. Validators return canonical JSON. */
export interface ModuleImplementation {
  readonly definition: ModuleDefinition;
  validateInput(input: unknown): Record<string, unknown>;
  validateResult(result: unknown): Record<string, unknown>;
  execute(input: Readonly<Record<string, unknown>>): Promise<unknown>;
}
export interface ModuleStore {
  /** Atomic unique request-ID insert: returns either the inserted run or the existing one. */
  accept(run: ModuleRun): ModuleRun;
  transition(id: string, from: ModuleRun['status'], run: ModuleRun): void;
  get(id: string): ModuleRun | null;
  list(context: ModuleContext): ModuleRun[];
  recover(): void;
}
const invalid = () => new ModuleError('invalid_input', 'Module 입력·대상·전체 UUID를 확인해 주세요.');
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
function json(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(json).join(',')}]`;
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${json((value as Record<string, unknown>)[key])}`).join(',')}}`;
}
function storage<T>(operation: () => T): T {
  try { return operation(); } catch { throw new ModuleError('storage_error', 'Module 실행 기록을 읽거나 저장하지 못했습니다.'); }
}

/** One service per owned Daemon. Startup recovery never re-executes pending work. */
export function createModuleService({ store, workspace, implementations }: {
  store: ModuleStore; workspace: WorkspaceDomain; implementations: readonly ModuleImplementation[];
}): ModuleAPI & { close(): Promise<void> } {
  const registry = new Map(implementations.map(module => [module.definition.id, module]));
  if (registry.size !== implementations.length) throw new Error('Duplicate module definition.');
  storage(() => store.recover());
  let closed = false;
  const active = new Set<Promise<ModuleRun>>();
  async function context(value: unknown): Promise<ModuleContext> {
    try {
      const type = (value as ModuleTarget | null)?.type;
      if (type === 'standalone') {
        fields(value, ['type']);
        return { type, workspaceId: null, projectId: null };
      }
      if (type === 'workspace') {
        const id = uuid(fields(value, ['type', 'workspaceId']).workspaceId);
        await workspace.getWorkspace({ id });
        return { type, workspaceId: id, projectId: null };
      }
      if (type === 'project') {
        const id = uuid(fields(value, ['type', 'projectId']).projectId);
        const project = await workspace.getProject({ id });
        return { type, projectId: id, workspaceId: project.workspaceId };
      }
      throw invalid();
    } catch (error) {
      if (error instanceof WorkspaceDomainError) throw new ModuleError(error.code, error.message);
      throw error;
    }
  }
  async function execute(raw: unknown): Promise<ModuleRun> {
    if (closed) throw new ModuleError('service_error', 'Module 서비스가 종료 중입니다.');
    const values = fields(raw, ['requestId', 'moduleId', 'target', 'input']);
    const requestId = uuid(values.requestId);
    if (typeof values.moduleId !== 'string') throw invalid();
    const module = registry.get(values.moduleId);
    if (!module) throw new ModuleError('module_not_found', 'Module을 찾을 수 없습니다.');
    const resolved = await context(values.target);
    if (!module.definition.contexts.includes(resolved.type)) throw invalid();
    let input: Record<string, unknown>;
    try { input = module.validateInput(values.input); } catch { throw invalid(); }
    if (closed) throw new ModuleError('service_error', 'Module 서비스가 종료 중입니다.');
    const candidate: ModuleRun = {
      id: crypto.randomUUID(), requestId, moduleId: module.definition.id, moduleVersion: module.definition.version,
      context: resolved, input, status: 'accepted', result: null, error: null,
      createdAt: new Date().toISOString(), startedAt: null, finishedAt: null,
    };
    // Same request remains the same execution even if the implementation version changes later.
    const accepted = storage(() => store.accept(candidate));
    if (accepted.moduleId !== candidate.moduleId || json(accepted.context) !== json(resolved) || json(accepted.input) !== json(input)) {
      throw new ModuleError('request_conflict', '같은 요청 ID에 다른 Module·입력·대상을 사용할 수 없습니다.');
    }
    if (accepted.id !== candidate.id) return structuredClone(accepted);
    const running: ModuleRun = { ...candidate, status: 'running', startedAt: new Date().toISOString() };
    storage(() => store.transition(candidate.id, 'accepted', running));
    let completed: ModuleRun;
    try {
      const result = module.validateResult(await module.execute(structuredClone(input)));
      completed = { ...running, status: 'succeeded', result, finishedAt: new Date().toISOString() };
    } catch {
      completed = { ...running, status: 'failed', error: { code: 'execution_failed', message: 'Module 실행 또는 결과 검증에 실패했습니다.' }, finishedAt: new Date().toISOString() };
    }
    storage(() => store.transition(candidate.id, 'running', completed));
    return structuredClone(completed);
  }
  return {
    async list() { return implementations.map(module => structuredClone(module.definition)); },
    execute(input) {
      const task = execute(input);
      active.add(task);
      void task.finally(() => active.delete(task)).catch(() => {});
      return task;
    },
    async getRun(input) {
      const id = uuid(fields(input, ['id']).id);
      const run = storage(() => store.get(id));
      if (!run) throw new ModuleError('run_not_found', 'Run을 찾을 수 없습니다.');
      return structuredClone(run);
    },
    async listRuns(input) {
      const resolved = await context(fields(input, ['target']).target);
      return structuredClone(storage(() => store.list(resolved)));
    },
    async close() { closed = true; await Promise.allSettled([...active]); },
  };
}
