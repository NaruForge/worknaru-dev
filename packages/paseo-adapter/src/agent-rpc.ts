import { DaemonClient } from '@getpaseo/client/internal/daemon-client';
import { AgentError, type AgentAPI } from '@worknaru/runtime';
import type { PaseoAdapterOptions } from './index.js';
import { createStatusWebSocket } from './status-websocket.js';

export function agentRpc(options: PaseoAdapterOptions): AgentAPI['agents'] {
  return async (operation, input) => {
    const client = new DaemonClient({ url: options.endpoint, clientId: `worknaru-agent-${crypto.randomUUID()}`,
      clientType: options.clientType ?? 'cli', appVersion: '0.8.0', connectTimeoutMs: options.timeoutMs ?? 5000,
      reconnect: { enabled: false }, logger: { debug() {}, info() {}, warn() {}, error() {} },
      webSocketFactory: createStatusWebSocket, ...(options.password ? { password: options.password } : {}) });
    try {
      await client.connect();
      const info = client.getLastServerInfoMessage();
      if (info?.serverId !== options.expectedServerId) throw new AgentError('target_mismatch', '접속 대상의 서버 ID가 일치하지 않습니다.');
      if (info.version !== '0.8.0') throw new AgentError('unsupported_version', '지원하지 않는 Daemon 버전입니다.');
      const response = await client.invokePluginRpc('worknaru-agent-service', 'agents.execute', { operation, input }) as
        { ok: true; data: never } | { ok: false; error: { code: string; message: string } };
      if (!response || typeof response !== 'object' || typeof response.ok !== 'boolean') throw new AgentError('invalid_response', 'Agent 응답 형식을 확인할 수 없습니다.');
      if (!response.ok) throw new AgentError(response.error.code, response.error.message);
      return response.data;
    } catch (error) {
      if (error instanceof AgentError) throw error;
      throw new AgentError('agent_service_unavailable', 'Agent 실행부에 연결할 수 없습니다. doctor로 준비 상태를 확인해 주세요.');
    } finally { await client.close().catch(() => {}); }
  };
}
