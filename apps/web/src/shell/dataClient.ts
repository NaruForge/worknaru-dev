import { DaemonClient } from '@getpaseo/client/internal/daemon-client';
import { defaultWebSocketFactory } from '@getpaseo/client/internal/daemon-client-websocket-transport';

export interface DataItem {
  id: string;
  label: string;
  path: string;
  kind: string;
  manager: string;
  description: string;
  reset: boolean;
  state: 'present' | 'missing' | 'unavailable';
  canOpen: boolean;
}
export interface DataSnapshot {
  serverId: string;
  host: string;
  dataRoot: string;
  source: string;
  items: DataItem[];
  projectsError: string | null;
}
export interface ResetPreview {
  dataRoot: string;
  items: string[];
  blockers: { code: string; message: string }[];
  token: string | null;
}
export interface DataClient {
  snapshot(): Promise<DataSnapshot>;
  open(id: string): Promise<unknown>;
  preview(): Promise<ResetPreview>;
  reset(token: string, id: string): Promise<unknown>;
  restarted(id: string): Promise<boolean>;
  reload(): void;
}
export class DataManagementError extends Error {}

/** Development app transport: uses the existing Daemon socket, outside product Core/Runtime. */
export function createDataClient(endpoint: string, expectedServerId: string): DataClient {
  async function invoke<T>(operation: string, input: object): Promise<T> {
    const client = new DaemonClient({
      url: endpoint,
      clientId: `worknaru-data-${crypto.randomUUID()}`,
      clientType: 'browser',
      appVersion: '0.8.0',
      connectTimeoutMs: 5000,
      reconnect: { enabled: false },
      logger: { debug() {}, info() {}, warn() {}, error() {} },
      webSocketFactory: (url, options) => {
        const socket = defaultWebSocketFactory(url, options);
        const close = socket.close.bind(socket);
        socket.close = (code, reason) => close(code === 1001 ? 1000 : code, reason);
        return socket;
      },
    });
    try {
      await client.connect();
      const info = client.getLastServerInfoMessage();
      if (info?.serverId !== expectedServerId || info.version !== '0.8.0') {
        throw new DataManagementError('실행 환경이 변경됐습니다. 화면을 새로고침해 주세요.');
      }
      const result = (await client.invokePluginRpc('worknaru-agent-service', 'development.data', {
        operation,
        input,
      })) as {
        ok: boolean;
        data?: T;
        error?: { code: string; message: string };
      };
      // A relay timeout may occur after the controller accepted a reset.
      if (!result || result.error?.code === 'management_unavailable')
        throw new Error('관리 실행기의 응답을 확인하지 못했습니다.');
      if (!result?.ok)
        throw new DataManagementError(
          result?.error?.message ?? '데이터 관리 응답을 확인하지 못했습니다.',
        );
      return result.data as T;
    } finally {
      await client.close().catch(() => {});
    }
  }
  return {
    snapshot: () => invoke('snapshot', {}),
    open: (id) => invoke('open', { id }),
    preview: () => invoke('preview', {}),
    reset: (token, id) => invoke('reset', { token, id }),
    async restarted(id) {
      try {
        const response = await fetch('./connection.json', {
          cache: 'no-store',
          signal: AbortSignal.timeout(5000),
        });
        if (!response.ok) return false;
        const value = await response.json();
        // A different instance alone does not prove this reset finished.
        return (
          value.targetId === 'worknaru-dev' &&
          value.completedResetId === id &&
          typeof value.expectedServerId === 'string' &&
          value.expectedServerId !== expectedServerId
        );
      } catch {
        return false;
      }
    },
    reload: () => window.location.reload(),
  };
}
