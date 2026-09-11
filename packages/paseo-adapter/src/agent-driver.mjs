import { DaemonClient } from '@getpaseo/client/internal/daemon-client';
import { AgentError } from '@worknaru/runtime';
import path from 'node:path';
import { createStatusWebSocket } from '../dist/status-websocket.js';

const logger = { debug() {}, info() {}, warn() {}, error() {} };
const agent = value => ({
  id: value.id, name: value.title || value.id.slice(0, 8), cwd: value.cwd, model: value.model,
  status: value.status, turnId: value.activeTurn?.turnId ?? null, archivedAt: value.archivedAt ?? null,
  parentId: value.labels?.['parent-agent-id'] ?? null,
  managed: value.labels?.['worknaru-source'] === 'agent-service', createId: value.labels?.['worknaru-create-id'] ?? null,
  permissions: (value.pendingPermissions ?? []).map(p => ({ id: p.id, kind: p.kind, title: p.title ?? p.name,
    description: p.description ?? '', input: p.input ?? {}, actions: (p.actions ?? []).map(a => ({ id: a.id, label: a.label, behavior: a.behavior })) })),
});

export async function connectAgentDriver({ endpoint, serverId, defaultCwd }) {
  const client = new DaemonClient({ url: endpoint, clientId: `worknaru-agent-worker-${crypto.randomUUID()}`,
    clientType: 'cli', appVersion: '0.8.0', connectTimeoutMs: 5000, reconnect: { enabled: true }, logger, webSocketFactory: createStatusWebSocket });
  try { await client.connect(); } catch (error) { await client.close().catch(() => {}); throw error; }
  const info = client.getLastServerInfoMessage();
  if (info?.serverId !== serverId || info?.version !== '0.8.0') {
    await client.close(); throw new AgentError('target_mismatch', '전용 Daemon의 서버 ID·버전이 일치하지 않습니다.');
  }
  const watches = new Map(); const listeners = new Map();
  // Permission acknowledgements are opt-in events in the pinned 0.8.0 client.
  const stopEvents = client.subscribe(() => {});
  const connected = () => client.isConnected && client.getLastServerInfoMessage()?.serverId === serverId && client.getLastServerInfoMessage()?.version === '0.8.0';
  const stopStatus = client.subscribeConnectionStatus(state => { if (state.status !== 'connected') for (const listener of listeners.values()) listener({ type: 'connection_lost' }); });
  const safe = async fn => {
    if (!connected()) throw new AgentError('runtime_unconfirmed', 'Daemon 연결을 확인할 수 없습니다. 잠시 후 다시 확인해 주세요.');
    try { return await fn(); }
    catch {
      throw new AgentError('runtime_unconfirmed', 'Daemon 작업 결과를 확정할 수 없습니다. 상태를 다시 확인해 주세요.');
    }
  };
  return {
    connected,
    async options(cwd = defaultCwd) {
      const value = await safe(() => client.listProviderModels('codex', { cwd }));
      return { defaultCwd, available: !value.error && value.models?.length > 0,
        models: (value.models ?? []).filter(m => m.isSelectable !== false).map(m => ({ id: m.id, name: m.label ?? m.id, default: m.isDefault === true })) };
    },
    async directories(query) {
      const resolved = path.resolve(defaultCwd, query); const trailing = /[\\/]$/.test(query);
      const cwd = trailing ? resolved : path.dirname(resolved);
      const value = await safe(() => client.getDirectorySuggestions({ query: trailing ? '' : path.basename(resolved), cwd, includeFiles: false, includeDirectories: true, limit: 20 }));
      return { paths: (value.entries ?? []).filter(e => e.kind === 'directory').map(e => path.resolve(cwd, e.path)) };
    },
    async list() {
      const result = []; let cursor;
      do {
        const page = await safe(() => client.fetchAgents({ filter: { includeArchived: true }, page: { limit: 200, ...(cursor ? { cursor } : {}) } }));
        result.push(...page.entries.map(e => agent(e.agent)));
        cursor = page.pageInfo.nextCursor;
      } while (cursor);
      return result;
    },
    async get(id) { const value = await safe(() => client.fetchAgent({ agentId: id })); return value ? agent(value.agent) : null; },
    async create(input) {
      const value = await safe(() => client.createAgent({ provider: 'codex', model: input.model, cwd: input.cwd, title: input.name,
        idempotencyKey: input.id, labels: { 'worknaru-source': 'agent-service', 'worknaru-create-id': input.id },
        providerOptions: { sandbox_mode: 'workspace-write', approval_policy: 'on-request' } }));
      return agent(value);
    },
    async history(id, cursor) {
      const page = await safe(() => client.fetchAgentTimeline(id, { limit: 200, projection: 'canonical',
        ...(cursor ? { direction: 'before', cursor } : { direction: 'tail' }) }));
      if (page.error) throw new AgentError('history_unavailable', '대화 기록을 조회할 수 없습니다.');
      return { epoch: page.epoch, cursor: page.hasOlder ? page.startCursor : null,
        entries: page.entries.map(e => ({ seq: e.seqStart, turnId: e.turnId ?? null, type: e.item.type,
          text: e.item.text ?? e.item.message ?? (e.item.type === 'tool_call' ? (e.item.name ?? '도구 실행') : ''),
          messageId: e.item.clientMessageId ?? e.item.messageId ?? null })) };
    },
    async watch(id, listener) {
      if (watches.has(id)) return;
      const subscription = client.subscribeAgentTimeline(id, message => {
        if (message.type === 'agent_stream') listener(message.payload.event);
        else listener({ type: 'replacement' });
      });
      watches.set(id, subscription);
      listeners.set(id, listener);
      try { await subscription.ready; } catch (error) { watches.delete(id); listeners.delete(id); subscription(); throw error; }
    },
    send(id, text, messageId, mode) { return safe(() => client.sendAgentMessage(id, text, { messageId, activeTurnBehavior: mode === 'steer' ? 'steer' : 'interrupt' })); },
    async permission(id, input) {
      const response = input.behavior === 'allow'
        ? { behavior: 'allow', ...(input.answers ? { updatedInput: input.answers } : {}), ...(input.actionId ? { selectedActionId: input.actionId } : {}) }
        : { behavior: 'deny', ...(input.actionId ? { selectedActionId: input.actionId } : {}) };
      await safe(() => client.respondToPermissionAndWait(id, input.id, response, 15000));
    },
    archive(id) { return safe(() => client.archiveAgent(id)); },
    async close() { stopStatus(); stopEvents(); listeners.clear(); for (const stop of watches.values()) stop(); watches.clear(); await client.close().catch(() => {}); },
  };
}
