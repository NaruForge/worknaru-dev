import {
  AgentError,
  ModuleError,
  type Agent,
  type AgentHistory,
  type AgentRequest,
  type AgentSettings,
  type WorknaruCore,
} from '@worknaru/core';
import { workspaceFixture } from './workspaceFixture.js';

export type Scenario =
  | 'conversation'
  | 'empty'
  | 'loading'
  | 'error'
  | 'permission'
  | 'uncertain'
  | 'archived'
  | 'long'
  | 'continuity'
  | 'many';
const date = '2026-09-14T01:00:00.000Z';
const copy = <T>(value: T): T => structuredClone(value);
export function createFixture(scenario: Scenario = 'conversation') {
  const agent: Agent = {
    id: 'sample-agent',
    name: '주간 업무 정리',
    cwd: 'C:\\Projects\\my-work',
    model: 'Codex',
    status: 'idle',
    turnId: null,
    archivedAt: scenario === 'archived' ? date : null,
    parentId: null,
    permissions:
      scenario === 'permission'
        ? [
            {
              id: 'permission-one',
              kind: 'tool',
              title: '작업 실행 승인이 필요합니다',
              description: 'Agent가 보고서 폴더의 파일 목록을 확인하려고 합니다.',
              input: {},
              actions: [],
            },
          ]
        : [],
  };
  const agents: Agent[] = scenario === 'empty' ? [] : [agent];
  if (scenario === 'many') {
    agent.cwd = 'C:\\' + '긴-작업-폴더\\'.repeat(160);
    for (let index = 1; index <= 40; index++)
      agents.push({ ...agent, id: `agent-${index}`, name: `작업 ${index}`, permissions: [] });
  }
  const histories = new Map<string, AgentHistory>([
    [
      agent.id,
      {
        epoch: 'sample-history',
        cursor: null,
        entries: [
          {
            seq: 1,
            turnId: 'turn-one',
            type: 'user_message',
            text: '이번 주 작업을 정리해 주세요. 다음 주에 해야 할 일도 알려주세요.',
            messageId: 'message-one',
          },
          {
            seq: 2,
            turnId: 'turn-one',
            type: 'assistant_message',
            text: '이번 주에는 Agent 생성과 대화 기능을 정리했습니다.\n\n다음 주에는 공통 화면을 검토하고, 처음 사용하는 사람도 편하게 작업을 시작할 수 있도록 안내를 다듬으면 좋겠습니다.',
            messageId: 'message-two',
          },
        ],
      },
    ],
  ]);
  if (scenario === 'long' || scenario === 'continuity')
    histories.get(agent.id)!.entries = Array.from(
      { length: scenario === 'continuity' ? 120 : 50 },
      (_, index) => ({
        seq: index + 1,
        turnId: `turn-${index}`,
        type: index % 2 ? 'assistant_message' : 'user_message',
        text: `대화 ${index + 1}\n긴 내용도 이전 문맥을 확인하면서 읽을 수 있어야 합니다.\n${'프로젝트/한글경로/'.repeat(12)}`,
        messageId: `message-${index}`,
      }),
    );
  if (scenario === 'continuity') {
    agents.push({ ...agent, id: 'second-agent', name: '고객 미팅 준비', permissions: [] });
    histories.set('second-agent', {
      epoch: 'second-history',
      cursor: null,
      entries: [
        {
          seq: 1,
          turnId: 'second-turn',
          type: 'assistant_message',
          text: '미팅 준비를 시작하겠습니다.',
          messageId: 'second-message',
        },
      ],
    });
  }
  const requests: AgentRequest[] =
    scenario === 'uncertain'
      ? [
          {
            id: 'request-one',
            agentId: agent.id,
            text: '주간 보고서를 정리해 주세요.',
            mode: 'queue',
            context: { type: 'standalone', workspaceId: null, projectId: null },
            state: 'uncertain',
            turnId: null,
            createdAt: date,
            error: '연결이 끊겨 접수 결과를 확인하지 못했습니다.',
          },
        ]
      : [];
  let settings: AgentSettings = { sendMode: 'queue', revision: 0 };
  let paused = scenario === 'uncertain';
  const findAgent = (id: string) => {
    const found = agents.find((value) => value.id === id);
    if (!found) throw new AgentError('not_found', 'Agent를 찾을 수 없습니다.');
    return found;
  };
  const findRequest = (id: string) => {
    const found = requests.find((value) => value.id === id);
    if (!found) throw new AgentError('not_found', '요청을 찾을 수 없습니다.');
    return found;
  };
  const core: WorknaruCore = {
    modules: {
      list: async () => [],
      execute: async () => {
        throw new ModuleError('feature_unavailable', 'Module 실행은 CLI에서 사용합니다.');
      },
      getRun: async () => {
        throw new ModuleError('feature_unavailable', 'Module 조회는 CLI에서 사용합니다.');
      },
      listRuns: async () => [],
    },
    workspace: workspaceFixture(scenario === 'empty'),
    getDaemonStatus: async () => ({
      outcome: 'available',
      target: {
        id: 'sample',
        endpoint: 'ws://127.0.0.1/ws',
        expectedServerId: 'sample-server',
      },
      checkedAt: date,
      connection: 'connected',
      localProcess: 'unknown',
      server: { id: 'sample-server', version: '0.8.0' },
      failure: null,
    }),
    agents: {
      openSystem: async () => {
        const existing = agents.find((value) => value.role === 'system');
        if (existing) return copy(existing);
        const value: Agent = {
          ...agent,
          id: 'system-agent',
          name: 'System Agent',
          role: 'system',
          cwd: 'C:\\WorknaruData\\system-agent',
          archivedAt: null,
          permissions: [],
        };
        agents.push(value);
        histories.set(value.id, { epoch: value.id, cursor: null, entries: [] });
        return copy(value);
      },
      health: async () => ({ ready: true, version: 1 }),
      options: async () => ({
        models: [{ id: 'codex', name: 'Codex', default: true }],
        available: true,
      }),
      directories: async ({ query }) => ({ paths: [query] }),
      list: async (input) => {
        if (scenario === 'loading') return new Promise<Agent[]>(() => {});
        if (scenario === 'error')
          throw new AgentError(
            'connection_failed',
            '연결이 끊겼습니다. Daemon 상태를 확인해 주세요.',
          );
        return copy(agents.filter((value) => !!value.archivedAt === !!input?.archived));
      },
      show: async ({ agent: id }) => copy(findAgent(id)),
      create: async (input) => {
        const existing = agents.find((value) => value.id === input.id);
        if (existing) return copy(existing);
        const value = { ...agent, ...input, archivedAt: null, permissions: [] };
        agents.push(value);
        histories.set(value.id, { epoch: value.id, cursor: null, entries: [] });
        return copy(value);
      },
      history: async ({ agent: id, cursor }) => {
        const history = copy(histories.get(id) ?? { epoch: id, cursor: null, entries: [] });
        if (scenario !== 'continuity') return history;
        const before =
          cursor && typeof cursor === 'object' && 'before' in cursor
            ? Number(cursor.before)
            : Infinity;
        const entries = history.entries.filter((entry) => entry.seq < before).slice(-20);
        return {
          ...history,
          entries,
          cursor: entries[0] && entries[0].seq > 1 ? { before: entries[0].seq } : null,
        };
      },
      requests: async ({ agent: id }) => ({
        requests: copy(requests.filter((value) => value.agentId === id)),
        paused,
      }),
      send: async (input) => {
        if (findAgent(input.agent).archivedAt)
          throw new AgentError('archived', '보관된 Agent입니다.');
        const existing = requests.find((value) => value.id === input.id);
        if (existing) return copy(existing);
        const request: AgentRequest = {
          context: { type: 'standalone', workspaceId: null, projectId: null },
          id: input.id,
          agentId: input.agent,
          text: input.text,
          mode: settings.sendMode,
          state: 'completed',
          turnId: input.id,
          createdAt: date,
          error: null,
        };
        requests.push(request);
        const history = histories.get(input.agent)!;
        const seq = (history.entries.at(-1)?.seq ?? 0) + 1;
        history.entries.push(
          {
            seq,
            turnId: input.id,
            type: 'user_message',
            text: input.text,
            messageId: input.id,
          },
          {
            seq: seq + 1,
            turnId: input.id,
            type: 'assistant_message',
            text: `요청을 확인했습니다: ${input.text}`,
            messageId: `${input.id}-reply`,
          },
        );
        return copy(request);
      },
      cancel: async ({ id }) => {
        findRequest(id).state = 'canceled';
        return copy(findRequest(id));
      },
      discard: async ({ id }) => {
        findRequest(id).state = 'canceled';
        return copy(findRequest(id));
      },
      resume: async () => {
        if (requests.some((value) => value.state === 'uncertain'))
          throw new AgentError('uncertain', '결과 확인이 필요한 요청을 먼저 확인해 주세요.');
        paused = false;
        return { resumed: true };
      },
      permission: async ({ agent: id, id: permissionId }) => {
        const value = findAgent(id);
        value.permissions = value.permissions.filter(
          (permission) => permission.id !== permissionId,
        );
        return copy(value);
      },
      archivePreview: async ({ agent: id }) => ({
        token: id,
        agents: [copy(findAgent(id))],
        queued: copy(requests.filter((value) => value.agentId === id && value.state === 'queued')),
      }),
      archive: async ({ token }) => {
        findAgent(token).archivedAt = date;
        for (const request of requests.filter(
          (value) => value.agentId === token && value.state === 'queued',
        ))
          request.state = 'canceled';
        return { archived: [token], failed: [] };
      },
      settings: async () => copy(settings),
      saveSettings: async (input) => {
        if (input.revision !== settings.revision)
          throw new AgentError(
            'conflict',
            '다른 화면에서 설정이 변경됐습니다. 최신 설정을 불러와 주세요.',
          );
        settings = { sendMode: input.sendMode, revision: input.revision + 1 };
        return copy(settings);
      },
    },
  };
  return { core, agents, requests, histories };
}
