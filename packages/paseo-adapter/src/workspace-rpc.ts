import { DaemonClient } from '@getpaseo/client/internal/daemon-client';
import {
  WorkspaceDomainError, type WorkspaceDomainErrorCode, type WorkspaceDomain,
  type Workspace, type Project,
} from '@worknaru/runtime';
import { SUPPORTED_PASEO_VERSION, type PaseoAdapterOptions } from './index.js';
import { createStatusWebSocket } from './status-websocket.js';

const messages: Record<WorkspaceDomainErrorCode, string> = {
  invalid_input: '입력을 확인해 주세요. 이름은 제어 문자 없이 1~200자, ID는 생성된 전체 UUID를 사용합니다.',
  workspace_not_found: 'Workspace를 찾을 수 없습니다.',
  project_not_found: 'Project를 찾을 수 없습니다.',
  storage_error: '업무 데이터를 읽거나 저장하지 못했습니다.',
  feature_unavailable: 'Workspace 기능을 사용할 수 없습니다.',
  service_error: 'Workspace 서비스에서 요청을 처리하지 못했습니다. 실행 환경의 준비 상태를 확인해 주세요.',
  connection_failed: '실행 환경에 연결할 수 없습니다.',
  authentication_required: '실행 환경의 인증이 필요합니다.',
  authentication_failed: '실행 환경에서 인증을 거부했습니다.',
  timeout: 'Workspace 요청의 제한 시간을 초과했습니다.',
  target_mismatch: '실행 환경이 초기화되었거나 바뀌었습니다. Web은 새로고침하고 CLI는 현재 환경으로 다시 실행해 주세요.',
  unsupported_version: '지원하지 않는 Daemon 버전입니다.',
  invalid_response: 'Workspace 응답 형식을 확인할 수 없습니다.',
};
const domainCodes = new Set(['invalid_input', 'workspace_not_found', 'project_not_found', 'storage_error', 'service_error']);
const failure = (code: WorkspaceDomainErrorCode) => new WorkspaceDomainError(code, messages[code]);
const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const uuid = (value: unknown): value is string => typeof value === 'string'
  && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value);

function entity(value: unknown): Workspace {
  if (!record(value) || !uuid(value.id) || typeof value.name !== 'string'
    || typeof value.createdAt !== 'string' || !Number.isFinite(Date.parse(value.createdAt))
    || new Date(value.createdAt).toISOString() !== value.createdAt) throw failure('invalid_response');
  return { id: value.id, name: value.name, createdAt: value.createdAt };
}

function project(value: unknown, workspaceId?: unknown): Project {
  const item = entity(value);
  if (!record(value) || !uuid(value.workspaceId)
    || (workspaceId !== undefined && value.workspaceId !== workspaceId)) throw failure('invalid_response');
  return { ...item, workspaceId: value.workspaceId };
}

function decode(operation: keyof WorkspaceDomain, data: unknown, input: unknown) {
  const values = record(input) ? input : {};
  if (operation === 'listWorkspaces' || operation === 'listProjects') {
    if (!Array.isArray(data)) throw failure('invalid_response');
    return data.map(value => operation === 'listProjects' ? project(value, values.workspaceId) : entity(value));
  }
  const item = operation === 'getProject' || operation === 'createProject'
    ? project(data, operation === 'createProject' ? values.workspaceId : undefined) : entity(data);
  if ((operation === 'getWorkspace' || operation === 'getProject') && item.id !== values.id) throw failure('invalid_response');
  return item;
}

function classify(error: unknown, connected: boolean): WorkspaceDomainError {
  if (error instanceof WorkspaceDomainError) return error;
  if (error instanceof Error) {
    if (error.message === 'Password required') return failure('authentication_required');
    if (error.message === 'Incorrect password') return failure('authentication_failed');
    if (error.message === 'Connection timed out' || /^Timeout waiting for message \(\d+ms\)$/.test(error.message)) return failure('timeout');
    if (error.name === 'DaemonProtocolError') return failure('invalid_response');
    // Paseo 0.8.0 reports absent plugins/methods and handler failures alike.
    if (error.name === 'DaemonRpcError') return failure('service_error');
    if (/^(Transport (closed|error|disconnected)|Connection lost|connect ECONNREFUSED|Received network error|WebSocket was closed)/.test(error.message)) return failure('connection_failed');
  }
  return failure(connected ? 'service_error' : 'connection_failed');
}

async function beforeDeadline<T>(operation: Promise<T>, deadline: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([operation, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(failure('timeout')), Math.max(0, deadline - Date.now()));
    })]);
  } finally { clearTimeout(timer); }
}

export function workspaceRpc(options: PaseoAdapterOptions): WorkspaceDomain {
  const invoke = async <T>(operation: keyof WorkspaceDomain, input: unknown): Promise<T> => {
    const timeoutMs = options.timeoutMs ?? 5000;
    const deadline = Date.now() + timeoutMs;
    let client: DaemonClient | undefined;
    let connected = false;
    let sent = false;
    try {
      client = new DaemonClient({
        url: options.endpoint, clientId: `worknaru-workspace-${crypto.randomUUID()}`,
        clientType: options.clientType ?? 'cli', appVersion: SUPPORTED_PASEO_VERSION,
        connectTimeoutMs: timeoutMs, reconnect: { enabled: false },
        logger: { debug() {}, info() {}, warn() {}, error() {} }, webSocketFactory: createStatusWebSocket,
        ...(options.password ? { password: options.password } : {}),
      });
      await beforeDeadline(client.connect(), deadline);
      connected = true;
      const info = client.getLastServerInfoMessage();
      if (!info?.serverId) throw failure('invalid_response');
      if (info.serverId !== options.expectedServerId) throw failure('target_mismatch');
      if (info.version !== SUPPORTED_PASEO_VERSION) throw failure('unsupported_version');
      if (Date.now() >= deadline) throw failure('timeout');
      sent = true;
      const response: unknown = await beforeDeadline(
        client.invokePluginRpc('worknaru-agent-service', 'workspace.execute', { operation, input }), deadline,
      );
      if (!record(response) || typeof response.ok !== 'boolean') throw failure('invalid_response');
      if (!response.ok) {
        if (!record(response.error) || typeof response.error.code !== 'string'
          || typeof response.error.message !== 'string' || !domainCodes.has(response.error.code)) throw failure('invalid_response');
        throw failure(response.error.code as WorkspaceDomainErrorCode);
      }
      return decode(operation, response.data, input) as T;
    } catch (error) {
      const safe = classify(error, connected);
      if (sent && operation.startsWith('create')
        && ['timeout', 'connection_failed', 'invalid_response', 'service_error'].includes(safe.code)) {
        throw new WorkspaceDomainError(safe.code, `${safe.message} 생성됐을 수 있으므로 목록을 확인한 뒤 다시 생성해 주세요. 같은 이름만으로 성공 여부를 확정할 수 없습니다.`);
      }
      throw safe;
    } finally { await client?.close().catch(() => {}); }
  };
  return {
    createWorkspace: input => invoke('createWorkspace', input),
    listWorkspaces: () => invoke('listWorkspaces', {}),
    getWorkspace: input => invoke('getWorkspace', input),
    createProject: input => invoke('createProject', input),
    listProjects: input => invoke('listProjects', input),
    getProject: input => invoke('getProject', input),
  };
}
