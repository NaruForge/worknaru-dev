export type SendMode = 'queue' | 'steer';
export type RequestState = 'queued' | 'sending' | 'running' | 'completed' | 'failed' | 'canceled' | 'uncertain';
export interface Permission {
  id: string; kind: string; title: string; description: string;
  input: Record<string, unknown>; actions: { id: string; label: string; behavior: 'allow' | 'deny' }[];
}
export interface Agent {
  id: string; name: string; cwd: string; model: string | null; status: string;
  turnId: string | null; archivedAt: string | null; parentId: string | null;
  permissions: Permission[];
}
export interface AgentRequest {
  id: string; agentId: string; text: string; mode: SendMode; state: RequestState;
  turnId: string | null; createdAt: string; error: string | null;
}
export interface HistoryEntry {
  seq: number; turnId: string | null; type: string; text: string; messageId: string | null;
}
export interface AgentHistory { entries: HistoryEntry[]; cursor: unknown; epoch: string | null }
export interface AgentSettings { sendMode: SendMode; revision: number }
export interface AgentOptions { defaultCwd: string; models: { id: string; name: string; default: boolean }[]; available: boolean }
export interface ArchivePreview { token: string; agents: Agent[]; queued: AgentRequest[] }
/** Agent-only capabilities. Transport operation names and envelopes are adapter details. */
export interface AgentAPI {
  health(input?: Record<string, never>): Promise<{ ready: boolean; version: number }>;
  options(input?: { cwd?: string }): Promise<AgentOptions>;
  directories(input: { query: string }): Promise<{ paths: string[] }>;
  create(input: { id: string; name: string; cwd: string; model: string }): Promise<Agent>;
  list(input?: { archived?: boolean }): Promise<Agent[]>;
  show(input: { agent: string }): Promise<Agent>;
  history(input: { agent: string; cursor?: unknown }): Promise<AgentHistory>;
  send(input: { agent: string; id: string; text: string; mode?: SendMode }): Promise<AgentRequest>;
  requests(input: { agent: string }): Promise<{ requests: AgentRequest[]; paused: boolean }>;
  cancel(input: { agent: string; id: string }): Promise<AgentRequest>;
  discard(input: { agent: string; id: string }): Promise<AgentRequest>;
  resume(input: { agent: string }): Promise<{ resumed: boolean }>;
  permission(input: { agent: string; id: string; behavior: 'allow' | 'deny'; actionId?: string; answers?: Record<string, unknown> }): Promise<Agent>;
  archivePreview(input: { agent: string }): Promise<ArchivePreview>;
  archive(input: { token: string }): Promise<{ archived: string[]; failed: string[] }>;
  settings(input?: Record<string, never>): Promise<AgentSettings>;
  saveSettings(input: { sendMode: SendMode; revision: number }): Promise<AgentSettings>;
}
export class AgentError extends Error {
  constructor(readonly code: string, message: string) { super(message); this.name = 'AgentError'; }
}
