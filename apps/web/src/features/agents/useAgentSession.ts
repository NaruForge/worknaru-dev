import { useEffect, useReducer, useRef, useState } from 'react';
import {
  AgentError,
  type Agent,
  type AgentHistory,
  type AgentSettings,
  type WorknaruCore,
} from '@worknaru/core';
import type { AgentView } from '../../shell/navigation.js';
import { mergeHistory, messageOf } from './agentState.js';

type Queue = Awaited<ReturnType<WorknaruCore['agents']['requests']>>;
interface Memory {
  agent: Agent | null;
  history: AgentHistory | null;
  queue: Queue;
  draft: string;
  notice: string;
  error: string;
  sending: boolean;
  archiving: boolean;
  pending: { agent: string; id: string; text: string } | null;
  answers: Map<string, Record<string, string>>;
  missing: boolean;
  permissionBusy: Set<string>;
}
const emptyMemory = (): Memory => ({
  agent: null,
  history: null,
  queue: { requests: [], paused: false },
  draft: '',
  notice: '',
  error: '',
  sending: false,
  archiving: false,
  pending: null,
  answers: new Map(),
  missing: false,
  permissionBusy: new Set(),
});

/** One connection session owns work; changing the visible View never recreates it. */
export function useAgentSession(core: WorknaruCore, view: AgentView) {
  const memories = useRef(new Map<string, Memory>());
  const target = useRef(view);
  target.current = view;
  const [, redraw] = useReducer((value: number) => value + 1, 0);
  const [list, setList] = useState({
    agents: [] as Agent[],
    archived: view.archived,
    loading: true,
    error: '',
    settings: { sendMode: 'queue', revision: 0 } as AgentSettings,
  });
  const refreshRef = useRef<() => Promise<void>>(async () => {});
  const alive = useRef(true);
  function memory(id: string) {
    let value = memories.current.get(id);
    if (!value) {
      value = emptyMemory();
      memories.current.set(id, value);
    }
    return value;
  }
  const notify = () => {
    if (alive.current) redraw();
  };
  useEffect(() => {
    alive.current = true;
    let stopped = false,
      busy = false,
      again = false;
    async function refresh() {
      if (stopped || document.hidden) return;
      if (busy) {
        again = true;
        return;
      }
      busy = true;
      try {
        do {
          again = false;
          const wanted = target.current;
          try {
            const [agents, settings] = await Promise.all([
              core.agents.list({ archived: wanted.archived }),
              core.agents.settings({}),
            ]);
            if (stopped) return;
            for (const agent of agents) memory(agent.id).agent = agent;
            if (wanted.archived === target.current.archived)
              setList({ agents, settings, archived: wanted.archived, loading: false, error: '' });
            else again = true;
            if (!wanted.agentId) continue;
            const id = wanted.agentId;
            const entry = memory(id);
            const [agent, latest, queue] = await Promise.all([
              core.agents.show({ agent: id }),
              core.agents.history({ agent: id }),
              core.agents.requests({ agent: id }),
            ]);
            if (stopped) return;
            entry.agent = agent;
            entry.queue = queue;
            entry.error = '';
            entry.missing = false;
            if (
              !entry.sending &&
              entry.pending &&
              queue.requests.some(
                (request) =>
                  request.id === entry.pending?.id &&
                  ['failed', 'canceled'].includes(request.state),
              )
            )
              entry.pending = null;
            // Recover the range between the cached history and the latest page
            // before merging. Opaque cursors stay inside the existing Core API.
            let page = latest;
            const previous = entry.history;
            const lastSeq = previous?.entries.at(-1)?.seq;
            const seen = new Set<string>();
            while (
              previous &&
              page.epoch === previous.epoch &&
              lastSeq !== undefined &&
              page.entries[0] &&
              page.entries[0].seq > lastSeq + 1
            ) {
              if (stopped || target.current.agentId !== id) break;
              const cursor = JSON.stringify(page.cursor);
              if (!page.cursor || seen.has(cursor)) throw Error('History range unavailable');
              seen.add(cursor);
              const older = await core.agents.history({ agent: id, cursor: page.cursor });
              if (stopped) return;
              if (older.epoch !== page.epoch) {
                page = older;
                break;
              }
              if (!older.entries.length || older.entries[0]!.seq >= page.entries[0]!.seq)
                throw Error('History range did not advance');
              page = mergeHistory(page, older, true);
            }
            if (target.current.agentId !== id) {
              again = true;
              notify();
              continue;
            }
            if (previous && page.epoch !== previous.epoch)
              entry.notice = '대화 기록이 갱신되어 이전에 읽던 위치를 복원할 수 없습니다.';
            // Loading older history may finish while range recovery is awaiting
            // another page. Merge with the current cache, not the old snapshot.
            const currentHistory = entry.history;
            const merged = mergeHistory(currentHistory, page);
            entry.history =
              JSON.stringify(merged) === JSON.stringify(currentHistory) ? currentHistory : merged;
            notify();
          } catch (error) {
            if (stopped) return;
            if (wanted.agentId) {
              const entry = memory(wanted.agentId);
              entry.error = messageOf(error);
              entry.missing = error instanceof AgentError && error.code === 'not_found';
            }
            if (
              wanted.archived === target.current.archived &&
              wanted.agentId === target.current.agentId
            )
              setList((current) => ({ ...current, loading: false, error: messageOf(error) }));
            else again = true;
            notify();
          }
        } while (again && !stopped);
      } finally {
        busy = false;
      }
    }
    refreshRef.current = refresh;
    void refresh();
    const timer = setInterval(() => void refresh(), 1500);
    const visible = () => {
      if (!document.hidden) void refresh();
    };
    document.addEventListener('visibilitychange', visible);
    return () => {
      stopped = true;
      alive.current = false;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', visible);
    };
  }, [core]);
  useEffect(() => {
    void refreshRef.current();
  }, [view.agentId, view.archived]);
  const current = view.agentId ? memory(view.agentId) : null;
  async function send() {
    if (
      !current?.agent ||
      current.agent.archivedAt ||
      current.sending ||
      current.archiving ||
      !current.draft.trim()
    )
      return;
    const draft = current.draft;
    const id = current.agent.id;
    if (!current.pending || current.pending.text !== draft)
      current.pending = { agent: id, id: crypto.randomUUID(), text: draft };
    const requestInput = current.pending;
    current.sending = true;
    notify();
    try {
      const request = await core.agents.send(requestInput);
      if (request.state === 'uncertain')
        current.notice = request.error ?? '전송 결과를 확인해 주세요.';
      else if (request.state === 'failed' || request.state === 'canceled') {
        current.pending = null;
        current.notice = `${request.error ?? (request.state === 'canceled' ? '이전 요청이 취소됐습니다.' : '전송에 실패했습니다.')} 다시 보내면 새 요청으로 접수합니다.`;
      } else {
        if (current.draft === draft) current.draft = '';
        current.pending = null;
        current.notice =
          request.state === 'completed'
            ? '이미 완료된 요청입니다. 대화 기록을 확인해 주세요.'
            : request.mode === 'steer'
              ? '메시지를 전달했습니다.'
              : '대기열에 추가했습니다. 이 화면을 닫아도 실행됩니다.';
      }
    } catch (error) {
      current.notice = messageOf(error);
    } finally {
      current.sending = false;
      notify();
      await refreshRef.current();
    }
  }
  async function older() {
    if (!current?.agent || !current.history?.cursor) return;
    const previous = current.history;
    const page = await core.agents.history({ agent: current.agent.id, cursor: previous.cursor });
    if (!alive.current || current.history?.epoch !== previous.epoch) return;
    if (page.epoch !== previous.epoch) {
      current.notice = '대화 기록이 갱신됐습니다. 최신 기록을 다시 확인해 주세요.';
      await refreshRef.current();
      return;
    }
    current.history = mergeHistory(current.history, page, true);
    notify();
  }
  return {
    agents: list.archived === view.archived ? list.agents : [],
    selected: current?.agent ?? null,
    selectedId: view.agentId,
    missing: current?.missing ?? false,
    archived: view.archived,
    loading: list.loading || list.archived !== view.archived,
    readError: current?.error || list.error,
    settings: list.settings,
    history: current?.history ?? null,
    queue: current?.queue ?? { requests: [], paused: false },
    draft: current?.draft ?? '',
    notice: current?.notice ?? '',
    sending: current?.sending ?? false,
    archiving: current?.archiving ?? false,
    send,
    older,
    refresh: () => refreshRef.current(),
    setDraft: (draft: string) => {
      if (current) {
        current.draft = draft;
        notify();
      }
    },
    setNotice: (notice: string) => {
      if (current) {
        current.notice = notice;
        notify();
      }
    },
    setAgentArchiving: (id: string, archiving: boolean) => {
      memory(id).archiving = archiving;
      notify();
    },
    remember: (agent: Agent) => {
      memory(agent.id).agent = agent;
      notify();
    },
    permissionAnswers: (id: string) => current?.answers.get(id) ?? {},
    setPermissionAnswers: (id: string, answers: Record<string, string>) => {
      current?.answers.set(id, answers);
      notify();
    },
    permissionBusy: (id: string) => current?.permissionBusy.has(id) ?? false,
    setPermissionBusy: (id: string, busy: boolean) => {
      if (busy) current?.permissionBusy.add(id);
      else current?.permissionBusy.delete(id);
      notify();
    },
  };
}
export type AgentSession = ReturnType<typeof useAgentSession>;
