import { StrictMode } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { App } from './App.js';
import { parseView, viewHash } from './navigation.js';
import { readLayout, layoutKey } from './layout.js';
import { createFixture } from '../testing/fixture.js';
import type { AgentHistory, AgentRequest } from '@worknaru/core';

const settings = () => fireEvent.click(screen.getByRole('button', { name: /^설정/ }));
const back = () => fireEvent.click(screen.getByRole('button', { name: '작업으로 돌아가기' }));
async function open() {
  const fixture = createFixture('continuity');
  const rendered = render(
    <StrictMode>
      <App core={fixture.core} />
    </StrictMode>,
  );
  fireEvent.click(await screen.findByRole('button', { name: /주간 업무 정리/ }));
  await screen.findByLabelText('메시지');
  return { fixture, ...rendered };
}
it('retains draft and older pages through Settings and A → B → A', async () => {
  await open();
  fireEvent.change(screen.getByLabelText('메시지'), { target: { value: '나의 작업 초안' } });
  fireEvent.click(await screen.findByRole('button', { name: '이전 대화 불러오기' }));
  await screen.findByText(/^대화 81\b/);
  settings();
  fireEvent.change(screen.getByLabelText('화면 테마'), { target: { value: 'dark' } });
  back();
  fireEvent.click(screen.getByRole('button', { name: /고객 미팅 준비/ }));
  fireEvent.click(screen.getByRole('button', { name: /주간 업무 정리/ }));
  expect((screen.getByLabelText('메시지') as HTMLTextAreaElement).value).toBe('나의 작업 초안');
  expect(screen.getByText(/^대화 81\b/)).toBeTruthy();
});
it('keeps request ownership during navigation and late acknowledgements', async () => {
  const { fixture } = await open();
  let finish!: (value: AgentRequest) => void;
  const send = vi.spyOn(fixture.core.agents, 'send').mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  fireEvent.change(screen.getByLabelText('메시지'), { target: { value: '첫 Agent 작업' } });
  fireEvent.click(screen.getByRole('button', { name: '보내기' }));
  settings();
  back();
  await act(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
  fireEvent.click(screen.getByRole('button', { name: /고객 미팅 준비/ }));
  fireEvent.change(screen.getByLabelText('메시지'), { target: { value: '다른 Agent의 초안' } });
  const input = send.mock.calls[0]![0];
  const focused = screen.getByRole('button', { name: /고객 미팅 준비/ });
  act(() => focused.focus());
  await act(() =>
    finish({
      id: input.id,
      agentId: input.agent,
      text: input.text,
      mode: 'queue',
      context: { type: 'standalone', workspaceId: null, projectId: null },
      state: 'queued',
      turnId: null,
      createdAt: '',
      error: null,
    }),
  );
  expect((screen.getByLabelText('메시지') as HTMLTextAreaElement).value).toBe('다른 Agent의 초안');
  expect(send).toHaveBeenCalledTimes(1);
  expect(document.activeElement).toBe(focused);
  fireEvent.click(screen.getByRole('button', { name: /주간 업무 정리/ }));
  expect((screen.getByLabelText('메시지') as HTMLTextAreaElement).value).toBe('');
});
it('keeps manually loaded older pages when an in-flight history gap finishes', async () => {
  const { fixture } = await open();
  await screen.findByText(/^대화 101\b/);
  const history = fixture.histories.get('sample-agent')!;
  const template = history.entries.at(-1)!;
  for (let seq = 121; seq <= 160; seq++)
    history.entries.push({
      ...template,
      seq,
      turnId: `turn-${seq}`,
      text: `대화 ${seq}`,
      messageId: `new-${seq}`,
    });
  const read = fixture.core.agents.history;
  let release!: () => void;
  let bridgeStarted = false;
  vi.spyOn(fixture.core.agents, 'history').mockImplementation(async (input) => {
    const page = await read(input);
    if ((input.cursor as { before?: number } | undefined)?.before === 141) {
      bridgeStarted = true;
      return new Promise<AgentHistory>((resolve) => {
        release = () => resolve(page);
      });
    }
    return page;
  });
  act(() => document.dispatchEvent(new Event('visibilitychange')));
  await waitFor(() => expect(bridgeStarted).toBe(true));
  fireEvent.click(screen.getByRole('button', { name: '이전 대화 불러오기' }));
  await screen.findByText(/^대화 81\b/);
  await act(async () => release());
  await screen.findByText('대화 160');
  expect(screen.getByText(/^대화 81\b/)).toBeTruthy();
  expect(screen.getByText(/^대화 101\b/)).toBeTruthy();
});
it('retains the lost-ack request ID after settings and another Agent', async () => {
  const { fixture } = await open();
  const send = vi
    .spyOn(fixture.core.agents, 'send')
    .mockRejectedValue(Error('lost acknowledgement'));
  fireEvent.change(screen.getByLabelText('메시지'), { target: { value: '같은 요청' } });
  fireEvent.click(screen.getByRole('button', { name: '보내기' }));
  await waitFor(() =>
    expect((screen.getByRole('button', { name: '보내기' }) as HTMLButtonElement).disabled).toBe(
      false,
    ),
  );
  settings();
  back();
  fireEvent.click(screen.getByRole('button', { name: /고객 미팅 준비/ }));
  fireEvent.click(screen.getByRole('button', { name: /주간 업무 정리/ }));
  fireEvent.click(screen.getByRole('button', { name: '보내기' }));
  await waitFor(() => expect(send).toHaveBeenCalledTimes(2));
  expect(send.mock.calls[1]![0].id).toBe(send.mock.calls[0]![0].id);
});
it('keeps unsaved settings through navigation and does not save automatically', async () => {
  const { fixture } = await open();
  const save = vi.spyOn(fixture.core.agents, 'saveSettings');
  fireEvent.click(screen.getByRole('button', { name: '설정' }));
  fireEvent.click(screen.getAllByRole('button', { name: 'Agent 동작' })[0]!);
  fireEvent.change(screen.getByLabelText('기본 전송 방식'), { target: { value: 'steer' } });
  back();
  settings();
  expect((screen.getByLabelText('기본 전송 방식') as HTMLSelectElement).value).toBe('steer');
  expect(save).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: '변경 취소' }));
  expect((screen.getByLabelText('기본 전송 방식') as HTMLSelectElement).value).toBe('queue');
  expect(save).not.toHaveBeenCalled();
});
it('isolates same Agent IDs when the connection changes', async () => {
  const { rerender } = await open();
  fireEvent.change(screen.getByLabelText('메시지'), { target: { value: '첫 환경에만 남는 초안' } });
  rerender(<App core={createFixture().core} endpoint="다른 실행 환경" />);
  await screen.findByLabelText('메시지');
  expect((screen.getByLabelText('메시지') as HTMLTextAreaElement).value).toBe('');
});
describe('local navigation and layout contracts', () => {
  it('round-trips selection, archive and mobile context and supports legacy IDs', () => {
    const view = { kind: 'agents', agentId: '한글 / id', archived: true, pane: 'list' } as const;
    expect(parseView(viewHash(view))).toEqual(view);
    expect(parseView('#sample-agent')).toEqual({ kind: 'legacy', agentId: 'sample-agent' });
    expect(parseView('#/settings/connection')).toEqual({ kind: 'settings', section: 'connection' });
    expect(parseView('#/unsupported')).toEqual({ kind: 'invalid' });
  });
  it('bounds malformed stored layout and tolerates denied storage', () => {
    localStorage.setItem(
      layoutKey,
      JSON.stringify({
        sidebarWidth: 99999,
        detailsWidth: 'bad',
        sidebarCollapsed: 'false',
        detailsOpen: true,
      }),
    );
    expect(readLayout()).toEqual({
      sidebarWidth: 400,
      detailsWidth: null,
      sidebarCollapsed: false,
      detailsOpen: true,
    });
    const get = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw Error('denied');
    });
    expect(readLayout().sidebarWidth).toBeNull();
    get.mockRestore();
  });
});
