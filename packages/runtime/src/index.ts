/** Worknaru-owned execution contract. No provider SDK types cross this boundary. */
export interface Runtime {
  /** Read-only probe. Does not start, restart or stop a daemon or agent. */
  getDaemonStatus(): Promise<DaemonStatus>;
}

export interface RuntimeTarget {
  readonly id: string;
  /** Explicit address without embedded credentials. */
  readonly endpoint: string;
  readonly expectedServerId: string;
}

export interface DaemonInfo {
  readonly id: string;
  readonly version: string | null;
}

export type RuntimeConnectionState =
  | 'not_connected' | 'connecting' | 'connected' | 'disconnected' | 'unknown';

export type RuntimeFailureCode =
  | 'connection_failed'
  | 'authentication_required'
  | 'authentication_failed'
  | 'timeout'
  | 'target_mismatch'
  | 'unsupported_version'
  | 'invalid_response'
  | 'request_failed'
  | 'cleanup_failed'
  | 'unknown';

export interface RuntimeFailure {
  readonly code: RuntimeFailureCode;
  readonly stage: 'connect' | 'identity' | 'status' | 'cleanup';
  /** Safe explanation, never a raw SDK error or authentication value. */
  readonly message: string;
}

interface DaemonStatusObservation {
  readonly target: RuntimeTarget;
  /** ISO 8601 time at which the result and connection snapshot were recorded. */
  readonly checkedAt: string;
  /** Observed before the probe's own client is closed; not a retained connection. */
  readonly connection: RuntimeConnectionState;
  /** Remote connectivity alone does not establish local process state. */
  readonly localProcess: 'unknown';
}

export type DaemonStatus = DaemonStatusObservation & (
  | { readonly outcome: 'available'; readonly server: DaemonInfo; readonly failure: null }
  | { readonly outcome: 'unavailable'; readonly server: DaemonInfo | null; readonly failure: RuntimeFailure }
);
