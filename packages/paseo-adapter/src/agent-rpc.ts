import { DaemonClient } from '@getpaseo/client/internal/daemon-client';
import { AgentError, parseExecutionContext, type AgentAPI, type ExecutionTarget } from '@worknaru/runtime';
import type { PaseoAdapterOptions } from './index.js';
import { createStatusWebSocket } from './status-websocket.js';

export function agentRpc(options: PaseoAdapterOptions): AgentAPI {
  // This envelope is private to the adapter. Apps consume named Agent capabilities.
  const invoke = async <K extends keyof AgentAPI>(operation: K, input: unknown): Promise<Awaited<ReturnType<AgentAPI[K]>>> => {
    const client = new DaemonClient({ url: options.endpoint, clientId: `worknaru-agent-${crypto.randomUUID()}`,
      clientType: options.clientType ?? 'cli', appVersion: '0.8.0', connectTimeoutMs: options.timeoutMs ?? 5000,
      reconnect: { enabled: false }, logger: { debug() {}, info() {}, warn() {}, error() {} },
      webSocketFactory: createStatusWebSocket, ...(options.password ? { password: options.password } : {}) });
    try {
      await client.connect();
      const info = client.getLastServerInfoMessage();
      if (info?.serverId !== options.expectedServerId) throw new AgentError('target_mismatch', '실행 환경이 초기화되었거나 바뀌었습니다. Web은 새로고침하고 CLI는 현재 환경으로 다시 실행해 주세요.');
      if (info.version !== '0.8.0') throw new AgentError('unsupported_version', '지원하지 않는 Daemon 버전입니다.');
      const response = await client.invokePluginRpc('worknaru-agent-service', 'agents.execute', { operation, input }) as
        { ok: true; data: never } | { ok: false; error: { code: string; message: string } };
      if (!response || typeof response !== 'object' || typeof response.ok !== 'boolean') throw new AgentError('invalid_response', 'Agent 응답 형식을 확인할 수 없습니다.');
      if (!response.ok) throw new AgentError(response.error.code, response.error.message);
      try {
        const data = response.data as unknown as Record<string, unknown>;
        const records = ['send', 'cancel', 'discard'].includes(operation) ? [data]
          : operation === 'requests' ? data.requests : operation === 'archivePreview' ? data.queued : [];
        if (!Array.isArray(records)) throw Error();
        for (const record of records) parseExecutionContext(record.context);
        if (operation === 'send') {
          const request = input as { id: string; text: string; target?: ExecutionTarget };
          const target = request.target ?? { type: 'standalone' };
          const context = parseExecutionContext(data.context);
          if (data.id !== request.id || data.text !== request.text || context.type !== target.type
            || (target.type === 'workspace' && context.workspaceId !== target.workspaceId)
            || (target.type === 'project' && context.projectId !== target.projectId)) throw Error();
        }
      } catch { throw new AgentError('invalid_response', 'Agent 요청의 업무 컨텍스트를 확인할 수 없습니다.'); }
      return response.data;
    } catch (error) {
      if (error instanceof AgentError) throw error;
      throw new AgentError('agent_service_unavailable', 'Agent 실행부에 연결할 수 없습니다. doctor로 준비 상태를 확인해 주세요.');
    } finally { await client.close().catch(() => {}); }
  };
  return {
    health: (input = {}) => invoke('health', input),
    options: input => invoke('options', input),
    directories: input => invoke('directories', input),
    create: input => invoke('create', input),
    list: (input = {}) => invoke('list', input),
    show: input => invoke('show', input),
    history: input => invoke('history', input),
    send: input => invoke('send', structuredClone(input)),
    requests: input => invoke('requests', input),
    cancel: input => invoke('cancel', input),
    discard: input => invoke('discard', input),
    resume: input => invoke('resume', input),
    permission: input => invoke('permission', input),
    archivePreview: input => invoke('archivePreview', input),
    archive: input => invoke('archive', input),
    settings: (input = {}) => invoke('settings', input),
    saveSettings: input => invoke('saveSettings', input),
  };
}
