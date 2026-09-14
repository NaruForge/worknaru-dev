import { AgentError, type Agent, type AgentHistory } from '@worknaru/core';

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
