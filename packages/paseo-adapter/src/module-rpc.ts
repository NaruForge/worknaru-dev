import { DaemonClient } from '@getpaseo/client/internal/daemon-client';
import { ModuleError, type ModuleErrorCode, type ModuleAPI, type ModuleRun, type ModuleTarget } from '@worknaru/runtime';
import { SUPPORTED_PASEO_VERSION, type PaseoAdapterOptions } from './index.js';
import { createStatusWebSocket } from './status-websocket.js';

const codes = new Set<ModuleErrorCode>(['invalid_input', 'workspace_not_found', 'project_not_found', 'module_not_found',
  'run_not_found', 'request_conflict', 'storage_error', 'service_error']);
const failure = (code: ModuleErrorCode) => new ModuleError(code, `Module 요청을 완료하지 못했습니다 (${code}). 실행 요청은 같은 요청 ID·입력·대상으로 확인하세요.`);
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const uuid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value);
const date = (value: unknown) => typeof value === 'string' && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
const matches = (run: ModuleRun, target: ModuleTarget) => run.context.type === target.type
  && (target.type === 'standalone' || (target.type === 'workspace' ? run.context.workspaceId === target.workspaceId : run.context.projectId === target.projectId));
function run(value: unknown): ModuleRun {
  if (!record(value) || !uuid(value.id) || !uuid(value.requestId) || typeof value.moduleId !== 'string' || !value.moduleId
    || typeof value.moduleVersion !== 'string' || !value.moduleVersion || !record(value.input) || !record(value.context)
    || !date(value.createdAt) || !(value.startedAt === null || date(value.startedAt))
    || !(value.finishedAt === null || date(value.finishedAt))) throw failure('invalid_response');
  const c = value.context;
  if (!(c.type === 'standalone' && c.workspaceId === null && c.projectId === null
    || c.type === 'workspace' && uuid(c.workspaceId) && c.projectId === null
    || c.type === 'project' && uuid(c.workspaceId) && uuid(c.projectId))) throw failure('invalid_response');
  if (value.status === 'accepted' || value.status === 'running') {
    if (value.result !== null || value.error !== null || value.finishedAt !== null
      || (value.status === 'accepted' ? value.startedAt !== null : value.startedAt === null)) throw failure('invalid_response');
  } else if (value.status === 'succeeded') {
    if (!record(value.result) || value.error !== null || !value.startedAt || !value.finishedAt) throw failure('invalid_response');
  } else if (value.status === 'failed' || value.status === 'uncertain') {
    if (value.result !== null || !record(value.error) || typeof value.error.message !== 'string' || !value.finishedAt
      || value.error.code !== (value.status === 'failed' ? 'execution_failed' : 'interrupted')
      || value.status === 'failed' && !value.startedAt) throw failure('invalid_response');
    value = { ...value, error: { code: value.error.code, message: value.status === 'failed' ? 'Module 실행에 실패했습니다.' : '실행 결과 미확정. 자동 재실행하지 않습니다.' } };
  } else throw failure('invalid_response');
  return value as unknown as ModuleRun;
}
function decode(operation: keyof ModuleAPI, data: unknown, input: unknown): unknown {
  const values = record(input) ? input : {};
  if (operation === 'list') {
    if (!Array.isArray(data)) throw failure('invalid_response');
    return data.map(item => {
      if (!record(item) || typeof item.id !== 'string' || !item.id || typeof item.version !== 'string' || !item.version
        || typeof item.name !== 'string' || !Array.isArray(item.contexts) || !item.contexts.length
        || item.contexts.some(type => !['standalone', 'workspace', 'project'].includes(type))) throw failure('invalid_response');
      return { id: item.id, version: item.version, name: item.name, contexts: item.contexts };
    });
  }
  if (operation === 'listRuns') {
    if (!Array.isArray(data)) throw failure('invalid_response');
    return data.map(value => { const item = run(value); if (!matches(item, values.target as ModuleTarget)) throw failure('invalid_response'); return item; });
  }
  const item = run(data);
  if (operation === 'getRun' && item.id !== values.id) throw failure('invalid_response');
  if (operation === 'execute' && (item.requestId !== values.requestId || item.moduleId !== values.moduleId
    || !matches(item, values.target as ModuleTarget) || JSON.stringify(item.input) !== JSON.stringify(values.input))) throw failure('invalid_response');
  return item;
}
export function moduleRpc(options: PaseoAdapterOptions): ModuleAPI {
  async function invoke<T>(operation: keyof ModuleAPI, input: unknown): Promise<T> {
    const timeoutMs = options.timeoutMs ?? 5000;
    const client = new DaemonClient({ url: options.endpoint, clientId: `worknaru-module-${crypto.randomUUID()}`,
      clientType: options.clientType ?? 'cli', appVersion: SUPPORTED_PASEO_VERSION, connectTimeoutMs: timeoutMs,
      reconnect: { enabled: false }, logger: { debug() {}, info() {}, warn() {}, error() {} },
      webSocketFactory: createStatusWebSocket, ...(options.password ? { password: options.password } : {}) });
    let expired = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let connected = false;
    try {
      return await Promise.race([
        (async () => {
          await client.connect();
          if (expired) throw failure('timeout');
          connected = true;
          const info = client.getLastServerInfoMessage();
          if (!info?.serverId) throw failure('invalid_response');
          if (info.serverId !== options.expectedServerId) throw failure('target_mismatch');
          if (info.version !== SUPPORTED_PASEO_VERSION) throw failure('unsupported_version');
          const response: unknown = await client.invokePluginRpc('worknaru-agent-service', 'modules.execute', { operation, input });
          if (!record(response) || typeof response.ok !== 'boolean') throw failure('invalid_response');
          if (!response.ok) {
            if (!record(response.error) || !codes.has(response.error.code as ModuleErrorCode)) throw failure('invalid_response');
            throw failure(response.error.code as ModuleErrorCode);
          }
          return decode(operation, response.data, input) as T;
        })(),
        new Promise<never>((_, reject) => { timer = setTimeout(() => { expired = true; reject(failure('timeout')); }, timeoutMs); }),
      ]);
    } catch (error) {
      if (error instanceof ModuleError) throw error;
      if (error instanceof Error) {
        if (error.message === 'Password required') throw failure('authentication_required');
        if (error.message === 'Incorrect password') throw failure('authentication_failed');
        if (error.message === 'Connection timed out' || /^Timeout waiting for message \(\d+ms\)$/.test(error.message)) throw failure('timeout');
        if (error.name === 'DaemonProtocolError') throw failure('invalid_response');
        if (error.name === 'DaemonRpcError') throw failure('service_error');
        if (/^(Transport (closed|error|disconnected)|Connection lost|connect ECONNREFUSED|Received network error|WebSocket was closed)/.test(error.message)) throw failure('connection_failed');
      }
      throw failure(connected ? 'service_error' : 'connection_failed');
    } finally { clearTimeout(timer); await client.close().catch(() => {}); }
  }
  return { list: () => invoke('list', {}), execute: input => invoke('execute', input),
    getRun: input => invoke('getRun', input), listRuns: input => invoke('listRuns', input) };
}
