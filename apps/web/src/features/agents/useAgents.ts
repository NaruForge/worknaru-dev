import { useEffect, useRef, useState } from 'react';
import {
  AgentError,
  type Agent,
  type AgentHistory,
  type AgentSettings,
  type WorknaruCore,
} from '@worknaru/core';

export const statusLabel: Record<string, string> = {
  idle: '대기 중',
  closed: '쉬는 중',
  running: '작업 중',
  initializing: '준비 중',
  error: '확인 필요',
  queued: '대기 중',
  sending: '전송 중',
  completed: '완료',
  failed: '실패',
  canceled: '취소됨',
  uncertain: '결과 확인 필요',
};
export const messageOf = (error: unknown) =>
  error instanceof AgentError
    ? error.message
    : '요청을 처리하지 못했습니다. 연결 상태를 확인한 뒤 다시 시도해 주세요.';
export const agentLabel = (agent: Agent) =>
  agent.archivedAt
    ? '보관됨'
    : agent.permissions.length
      ? '응답 필요'
      : (statusLabel[agent.status] ?? agent.status);
type Queue = Awaited<ReturnType<WorknaruCore['agents']['requests']>>;
export function mergeHistory(
  previous: AgentHistory | null,
  page: AgentHistory,
  older = false,
): AgentHistory {
  if (
    !previous?.entries.length ||
    page.epoch !== previous.epoch ||
    (!older && page.entries[0] && page.entries[0].seq > previous.entries.at(-1)!.seq + 1)
  )
    return page;
  const entries = new Map(previous.entries.map((entry) => [entry.seq, entry]));
  for (const entry of page.entries) entries.set(entry.seq, entry);
  return {
    ...page,
    cursor: older ? page.cursor : previous.cursor,
    entries: [...entries.values()].sort((a, b) => a.seq - b.seq),
  };
}
interface State {
  agents: Agent[];
  selected: Agent | null;
  archived: boolean;
  loading: boolean;
  history: AgentHistory | null;
  queue: Queue;
  settings: AgentSettings;
  notice: string;
  readError: string;
  sending: boolean;
  archiving: boolean;
  draft: string;
}
export function useAgents(core: WorknaruCore) {
  const [state, setState] = useState<State>({
    agents: [],
    selected: null,
    archived: false,
    loading: true,
    history: null,
    queue: { requests: [], paused: false },
    settings: { sendMode: 'queue', revision: 0 },
    notice: '',
    readError: '',
    sending: false,
    archiving: false,
    draft: '',
  });
  const current = useRef(state);
  const drafts = useRef(new Map<string, string>());
  const pending = useRef<{ id: string; agent: string; text: string } | null>(null);
  const refreshRef = useRef<() => Promise<void>>(async () => {});
  function update(patch: Partial<State>) {
    current.current = { ...current.current, ...patch };
    setState(current.current);
  }
  function select(agent: Agent | null) {
    const old = current.current;
    if (old.selected) drafts.current.set(old.selected.id, old.draft);
    update({
      selected: agent,
      draft: agent ? (drafts.current.get(agent.id) ?? '') : '',
      history: null,
      queue: { requests: [], paused: false },
    });
    if (agent) window.history.replaceState(null, '', `#${encodeURIComponent(agent.id)}`);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
    void refreshRef.current();
  }
  useEffect(() => {
    let stopped = false,
      busy = false,
      again = false;
    const refresh = async () => {
      if (stopped || document.hidden) return;
      if (busy) {
        again = true;
        return;
      }
      busy = true;
      do {
        again = false;
        const { archived, selected } = current.current;
        try {
          const [agents, settings] = await Promise.all([
            core.agents.list({ archived }),
            core.agents.settings({}),
          ]);
          if (stopped) return;
          if (archived !== current.current.archived) {
            again = true;
            continue;
          }
          update({ agents, settings, loading: false, readError: '' });
          let agentId = selected?.id;
          if (!selected && !current.current.selected && window.location.hash) {
            let id = '';
            try {
              id = decodeURIComponent(window.location.hash.slice(1));
            } catch {
              /* Ignore malformed external links. */
            }
            const saved = agents.find((agent) => agent.id === id);
            if (saved) {
              update({
                selected: saved,
                draft: drafts.current.get(saved.id) ?? '',
              });
              agentId = saved.id;
            }
          }
          if (agentId) {
            const [agent, page, queue] = await Promise.all([
              core.agents.show({ agent: agentId }),
              core.agents.history({ agent: agentId }),
              core.agents.requests({ agent: agentId }),
            ]);
            if (stopped) return;
            if (current.current.selected?.id !== agentId) {
              again = true;
              continue;
            }
            if (
              !current.current.sending &&
              pending.current?.agent === agentId &&
              queue.requests.some(
                (request) =>
                  request.id === pending.current?.id &&
                  ['failed', 'canceled'].includes(request.state),
              )
            )
              pending.current = null;
            const merged = mergeHistory(current.current.history, page);
            update({
              selected: agent,
              queue,
              history:
                JSON.stringify(merged) === JSON.stringify(current.current.history)
                  ? current.current.history
                  : merged,
            });
          }
        } catch (error) {
          if (!stopped) update({ loading: false, readError: messageOf(error) });
        }
      } while (again && !stopped);
      busy = false;
    };
    refreshRef.current = refresh;
    void refresh();
    const timer = setInterval(() => void refresh(), 1500);
    const visible = () => {
      if (!document.hidden) void refresh();
    };
    const hash = () => {
      let id = '';
      try {
        id = decodeURIComponent(location.hash.slice(1));
      } catch {
        return;
      }
      const found = current.current.agents.find((agent) => agent.id === id);
      if (found && found.id !== current.current.selected?.id) select(found);
    };
    document.addEventListener('visibilitychange', visible);
    window.addEventListener('hashchange', hash);
    return () => {
      stopped = true;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', visible);
      window.removeEventListener('hashchange', hash);
    };
  }, [core]);

  async function send() {
    const { selected, draft, sending, archiving } = current.current;
    if (!selected || selected.archivedAt || sending || archiving || !draft.trim()) return;
    if (!pending.current || pending.current.agent !== selected.id || pending.current.text !== draft)
      pending.current = {
        id: crypto.randomUUID(),
        agent: selected.id,
        text: draft,
      };
    update({ sending: true });
    try {
      const request = await core.agents.send(pending.current);
      if (request.state === 'uncertain')
        update({ notice: request.error ?? '전송 결과를 확인해 주세요.' });
      else if (request.state === 'failed' || request.state === 'canceled') {
        pending.current = null;
        update({
          notice: `${request.error ?? (request.state === 'canceled' ? '이전 요청이 취소됐습니다.' : '전송에 실패했습니다.')} 다시 보내면 새 요청으로 접수합니다.`,
        });
      } else {
        if (current.current.selected?.id === selected.id && current.current.draft === draft)
          update({ draft: '' });
        if (drafts.current.get(selected.id) === draft) drafts.current.set(selected.id, '');
        pending.current = null;
        update({
          notice:
            request.state === 'completed'
              ? '이미 완료된 요청입니다. 대화 기록을 확인해 주세요.'
              : request.mode === 'steer'
                ? '메시지를 전달했습니다.'
                : '대기열에 추가했습니다. 이 화면을 닫아도 실행됩니다.',
        });
      }
    } catch (error) {
      update({ notice: messageOf(error) });
    } finally {
      update({ sending: false });
      await refreshRef.current();
    }
  }
  async function older() {
    const { selected, history } = current.current;
    if (!selected || !history?.cursor) return;
    const page = await core.agents.history({
      agent: selected.id,
      cursor: history.cursor,
    });
    if (current.current.selected?.id === selected.id)
      update({ history: mergeHistory(current.current.history, page, true) });
  }
  return {
    ...state,
    select,
    send,
    older,
    refresh: () => refreshRef.current(),
    setDraft: (draft: string) => update({ draft }),
    setNotice: (notice: string) => update({ notice }),
    setArchiving: (archiving: boolean) => update({ archiving }),
    setArchived: (archived: boolean) => {
      update({ archived, loading: true });
      select(null);
    },
    created: (agent: Agent) => {
      update({
        archived: false,
        notice: 'Agent를 만들었습니다. 첫 메시지를 보내세요.',
      });
      select(agent);
    },
  };
}
