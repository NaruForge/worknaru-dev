import type {
  DaemonInfo, DaemonStatus, Runtime, RuntimeConnectionState,
  RuntimeFailure, RuntimeFailureCode, RuntimeTarget,
} from '@worknaru/runtime';
// Version-pinned internal dependency, confined to this adapter.
import { DaemonClient } from '@getpaseo/client/internal/daemon-client';
import { createStatusWebSocket } from './status-websocket.js';

export const SUPPORTED_PASEO_VERSION = '0.8.0';

export interface PaseoAdapterOptions {
  readonly targetId: string;
  readonly endpoint: string;
  readonly expectedServerId: string;
  /** App identity sent to Paseo; connection behavior is shared between both callers. */
  readonly clientType?: 'cli' | 'browser';
  /** Kept out of result objects and logs. Supply separately from the endpoint. */
  readonly password?: string;
  /** Total connect + status budget, in milliseconds (default 5 seconds). */
  readonly timeoutMs?: number;
}

const safeMessages: Record<RuntimeFailureCode, string> = {
  connection_failed: 'The configured daemon connection failed; local process state is unknown.',
  authentication_required: 'The configured daemon requires authentication.',
  authentication_failed: 'The configured daemon rejected authentication.',
  timeout: 'The daemon status check exceeded its time limit.',
  target_mismatch: 'The responding daemon does not match the expected server identity.',
  unsupported_version: 'The responding daemon version has not been verified with this adapter.',
  invalid_response: 'The daemon returned an invalid or inconsistent status response.',
  request_failed: 'The daemon rejected the status request.',
  cleanup_failed: 'The status check could not clean up its client connection.',
  unknown: 'The daemon status check failed for an unclassified reason.',
};

// Paseo's default logger can include raw errors. Status probes expose only safeMessages.
const silentLogger = { debug() {}, info() {}, warn() {}, error() {} };
class ProbeTimeout extends Error {}
class ProbeFailure extends Error {
  constructor(readonly code: RuntimeFailureCode) { super(safeMessages[code]); }
}

function connectionState(client: DaemonClient | undefined): RuntimeConnectionState {
  switch (client?.getConnectionState().status) {
    case 'idle': return 'not_connected';
    case 'connecting': return 'connecting';
    case 'connected': return 'connected';
    case 'disconnected':
    case 'disposed': return 'disconnected';
    default: return 'unknown';
  }
}

function classify(error: unknown): RuntimeFailureCode {
  if (error instanceof ProbeFailure) return error.code;
  if (error instanceof ProbeTimeout) return 'timeout';
  if (!(error instanceof Error)) return 'unknown';
  // Exact known errors from the pinned SDK/server. Unknown text is never exposed.
  if (error.message === 'Password required') return 'authentication_required';
  if (error.message === 'Incorrect password') return 'authentication_failed';
  if (error.message === 'Connection timed out' || /^Timeout waiting for message \(\d+ms\)$/.test(error.message)) return 'timeout';
  if (error.name === 'DaemonProtocolError') return 'invalid_response';
  if (error.name === 'DaemonRpcError') return 'request_failed';
  if (/^(Transport (closed|error|disconnected)|Connection lost|connect ECONNREFUSED|Received network error|WebSocket was closed)/.test(error.message)) return 'connection_failed';
  return 'unknown';
}

async function beforeDeadline<T>(operation: Promise<T>, deadline: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new ProbeTimeout()), Math.max(0, deadline - Date.now()));
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

function requiredText(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${label} is required.`);
}

/** Returns only the Worknaru Runtime contract. Invalid configuration fails before connecting. */
export function createPaseoRuntime(options: PaseoAdapterOptions): Runtime {
  requiredText(options.targetId, 'An explicit target ID');
  requiredText(options.endpoint, 'An explicit daemon endpoint');
  requiredText(options.expectedServerId, 'An expected server ID');
  const clientType = options.clientType ?? 'cli';
  if (clientType !== 'cli' && clientType !== 'browser') throw new TypeError('Unsupported client type.');
  let endpoint: URL;
  try { endpoint = new URL(options.endpoint); }
  catch { throw new TypeError('The daemon endpoint must be an absolute WebSocket URL.'); }
  if (!['ws:', 'wss:'].includes(endpoint.protocol) || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) {
    throw new TypeError('Use a ws/wss endpoint without credentials, query parameters or fragments.');
  }
  const timeoutMs = options.timeoutMs ?? 5000;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 300000) {
    throw new RangeError('timeoutMs must be an integer between 1 and 300000.');
  }
  if (options.password !== undefined && (typeof options.password !== 'string' || !options.password.length)) {
    throw new TypeError('password must be a non-empty string when supplied.');
  }
  const password = options.password;
  const target: RuntimeTarget = Object.freeze({
    id: options.targetId.trim(), endpoint: endpoint.href, expectedServerId: options.expectedServerId.trim(),
  });

  return {
    async getDaemonStatus(): Promise<DaemonStatus> {
      const deadline = Date.now() + timeoutMs;
      let client: DaemonClient | undefined;
      let server: DaemonInfo | null = null;
      let stage: RuntimeFailure['stage'] = 'connect';
      let result: DaemonStatus;
      const observation = () => ({
        target, checkedAt: new Date().toISOString(), connection: connectionState(client),
        localProcess: 'unknown' as const,
      });
      const unavailable = (code: RuntimeFailureCode): DaemonStatus => ({
        ...observation(), outcome: 'unavailable', server,
        failure: { code, stage, message: safeMessages[code] },
      });
      try {
        client = new DaemonClient({
          url: target.endpoint, clientId: `worknaru-status-${globalThis.crypto.randomUUID()}`, clientType,
          appVersion: SUPPORTED_PASEO_VERSION, connectTimeoutMs: timeoutMs,
          reconnect: { enabled: false }, logger: silentLogger,
          webSocketFactory: createStatusWebSocket,
          ...(password === undefined ? {} : { password }),
        });
        await beforeDeadline(client.connect(), deadline);
        stage = 'identity';
        const info = client.getLastServerInfoMessage();
        if (!info?.serverId) throw new ProbeFailure('invalid_response');
        server = { id: info.serverId, version: info.version ?? null };
        if (server.id !== target.expectedServerId) throw new ProbeFailure('target_mismatch');
        if (server.version !== null && server.version !== SUPPORTED_PASEO_VERSION) throw new ProbeFailure('unsupported_version');
        stage = 'status';
        if (Date.now() >= deadline) throw new ProbeTimeout();
        const detail = await beforeDeadline(client.getDaemonStatus({ timeout: Math.max(1, deadline - Date.now()) }), deadline);
        if (detail.serverId !== server.id) throw new ProbeFailure('target_mismatch');
        if (detail.version != null && server.version !== null && detail.version !== server.version) throw new ProbeFailure('invalid_response');
        server = { id: server.id, version: detail.version ?? server.version };
        if (server.version !== SUPPORTED_PASEO_VERSION) throw new ProbeFailure('unsupported_version');
        result = { ...observation(), outcome: 'available', server, failure: null };
      } catch (error) {
        result = unavailable(classify(error));
      } finally {
        try { await client?.close(); }
        catch { stage = 'cleanup'; result = unavailable('cleanup_failed'); }
      }
      return result;
    },
  };
}
