import type { HistoryEntry } from '@worknaru/runtime';

/** The runtime can deliver one assistant message as several ordered chunks. */
export function conversationMessages(entries: HistoryEntry[]): HistoryEntry[] {
  const result: HistoryEntry[] = [];
  for (const entry of entries) {
    const last = result.at(-1);
    if (last && entry.messageId && last.messageId === entry.messageId && last.turnId === entry.turnId
      && last.type === entry.type && ['assistant_message', 'reasoning'].includes(entry.type)) last.text += entry.text;
    else result.push({ ...entry });
  }
  return result;
}
