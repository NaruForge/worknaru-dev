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
export interface AgentOperationMap {
  health: { input: Record<string, never>; output: { ready: boolean; version: number } };
  options: { input: { cwd?: string }; output: AgentOptions };
  directories: { input: { query: string }; output: { paths: string[] } };
  create: { input: { id: string; name: string; cwd: string; model: string }; output: Agent };
  list: { input: { archived?: boolean }; output: Agent[] };
  show: { input: { agent: string }; output: Agent };
  history: { input: { agent: string; cursor?: unknown }; output: AgentHistory };
  send: { input: { agent: string; id: string; text: string; mode?: SendMode }; output: AgentRequest };
  requests: { input: { agent: string }; output: { requests: AgentRequest[]; paused: boolean } };
  cancel: { input: { agent: string; id: string }; output: AgentRequest };
  discard: { input: { agent: string; id: string }; output: AgentRequest };
  resume: { input: { agent: string }; output: { resumed: boolean } };
  permission: { input: { agent: string; id: string; behavior: 'allow' | 'deny'; actionId?: string; answers?: Record<string, unknown> }; output: Agent };
  archivePreview: { input: { agent: string }; output: ArchivePreview };
  archive: { input: { token: string }; output: { archived: string[]; failed: string[] } };
  settings: { input: Record<string, never>; output: AgentSettings };
  saveSettings: { input: { sendMode: SendMode; revision: number }; output: AgentSettings };
}
export type AgentOperation = keyof AgentOperationMap;
export interface AgentAPI {
  agents<K extends AgentOperation>(operation: K, input: AgentOperationMap[K]['input']): Promise<AgentOperationMap[K]['output']>;
}
export class AgentError extends Error {
  constructor(readonly code: string, message: string) { super(message); this.name = 'AgentError'; }
}
