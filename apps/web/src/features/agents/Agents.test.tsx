import { StrictMode } from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AgentError, type AgentRequest } from '@worknaru/core';
import { App } from '../../shell/App.js';
import { createFixture } from '../../testing/fixture.js';

async function opened(fixture = createFixture()) {
  render(
    <StrictMode>
      <App core={fixture.core} />
    </StrictMode>,
  );
  fireEvent.click(await screen.findByRole('button', { name: /주간 업무 정리/ }));
  await screen.findByLabelText('메시지');
  return fixture;
}
describe('request identity and drafts', () => {
  for (const states of [
    ['failed', 'completed'],
    ['uncertain', 'canceled', 'completed'],
    ['lost', 'uncertain', 'completed'],
  ] as const) {
    it(`preserves the draft and the correct retry identity: ${states.join(' → ')}`, async () => {
      const fixture = createFixture();
      const original = fixture.core.agents.send;
      let attempt = 0;
      const send = vi.spyOn(fixture.core.agents, 'send').mockImplementation(async (input) => {
        const state = states[attempt++];
        if (state === 'lost') throw Error('lost acknowledgement');
        if (state === 'completed') return original(input);
        return {
          id: input.id,
          agentId: input.agent,
          text: input.text,
          mode: 'queue',
          state,
          turnId: null,
          createdAt: '',
          error: null,
        } as AgentRequest;
      });
      await opened(fixture);
      const input = screen.getByLabelText('메시지');
      fireEvent.change(input, { target: { value: 'Please continue' } });
      for (let i = 0; i < states.length; i++) {
        fireEvent.click(screen.getByRole('button', { name: '보내기' }));
        await waitFor(() => expect(send).toHaveBeenCalledTimes(i + 1));
        await waitFor(() =>
          expect(
            (
              screen.getByRole('button', {
                name: '보내기',
              }) as HTMLButtonElement
            ).disabled,
          ).toBe(states[i] === 'completed'),
        );
        expect((input as HTMLTextAreaElement).value).toBe(
          states[i] === 'completed' ? '' : 'Please continue',
        );
      }
      const ids = send.mock.calls.map(([input]) => input.id);
      if (states[0] === 'failed') expect(ids[1]).not.toBe(ids[0]);
      else {
        expect(ids[1]).toBe(ids[0]);
        if (states[1] === 'canceled') expect(ids[2]).not.toBe(ids[1]);
        else expect(ids[2]).toBe(ids[0]);
      }
      expect(send.mock.calls.every(([input]) => !('mode' in input))).toBe(true);
    });
  }
  it('observes CLI cancellation before issuing a new request ID', async () => {
    const fixture = createFixture();
    const send = vi.spyOn(fixture.core.agents, 'send').mockImplementation(async (input) => {
      const request: AgentRequest = {
        id: input.id,
        agentId: input.agent,
        text: input.text,
        mode: 'queue',
        state: 'uncertain',
        turnId: null,
        createdAt: '',
        error: null,
      };
      fixture.requests.push(request);
      return { ...request };
    });
    await opened(fixture);
    fireEvent.change(screen.getByLabelText('메시지'), {
      target: { value: 'Continue' },
    });
    fireEvent.click(screen.getByRole('button', { name: '보내기' }));
    await waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    fixture.requests[0]!.state = 'canceled';
    fireEvent(document, new Event('visibilitychange'));
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: '기록 확인 후 실행 포기' })).toBeNull(),
    );
    fireEvent.click(screen.getByRole('button', { name: '보내기' }));
    await waitFor(() => expect(send).toHaveBeenCalledTimes(2));
    expect(send.mock.calls[1]![0].id).not.toBe(send.mock.calls[0]![0].id);
  });
  it('keeps drafts across selection and ignores a late response for the previous selection', async () => {
    const fixture = createFixture();
    fixture.agents.push({
      ...fixture.agents[0]!,
      id: 'second',
      name: '두 번째 Agent',
    });
    await opened(fixture);
    fireEvent.change(screen.getByLabelText('메시지'), {
      target: { value: '작성 중인 초안' },
    });
    fireEvent.click(screen.getByRole('button', { name: /두 번째 Agent/ }));
    expect((screen.getByLabelText('메시지') as HTMLTextAreaElement).value).toBe('');
    fireEvent.click(screen.getByRole('button', { name: /주간 업무 정리/ }));
    expect((screen.getByLabelText('메시지') as HTMLTextAreaElement).value).toBe('작성 중인 초안');
  });
  it('does not submit during Korean composition or Shift+Enter', async () => {
    const fixture = await opened();
    const send = vi.spyOn(fixture.core.agents, 'send');
    const input = screen.getByLabelText('메시지');
    fireEvent.change(input, { target: { value: '한글 입력' } });
    fireEvent.keyDown(input, { key: 'Enter', isComposing: true });
    fireEvent.keyDown(input, { key: 'Enter', keyCode: 229 });
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true });
    expect(send).not.toHaveBeenCalled();
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(send).toHaveBeenCalledTimes(1));
  });
});
it('creates once, retains the creation ID across a lost acknowledgement and selects the Agent', async () => {
  const fixture = createFixture('empty');
  const original = fixture.core.agents.create;
  let first = true;
  const create = vi.spyOn(fixture.core.agents, 'create').mockImplementation(async (input) => {
    const value = await original(input);
    if (first) {
      first = false;
      throw Error('lost');
    }
    return value;
  });
  render(
    <StrictMode>
      <App core={fixture.core} />
    </StrictMode>,
  );
  fireEvent.click(screen.getByRole('button', { name: '새 Agent' }));
  fireEvent.change(screen.getByLabelText('작업 폴더'), {
    target: { value: 'C:\\Projects\\my-work' },
  });
  const button = await screen.findByRole('button', { name: '만들기' });
  await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(button);
  await screen.findByRole('alert');
  fireEvent.click(screen.getByRole('button', { name: '만들기' }));
  await screen.findByLabelText('메시지');
  expect(create).toHaveBeenCalledTimes(2);
  expect(create.mock.calls[0]![0].id).toBe(create.mock.calls[1]![0].id);
  expect(fixture.agents).toHaveLength(1);
});
it('does not permit creation when models are unavailable', async () => {
  const fixture = createFixture('empty');
  fixture.core.agents.options = async () => ({
    available: false,
    models: [],
  });
  const create = vi.spyOn(fixture.core.agents, 'create');
  render(<App core={fixture.core} />);
  fireEvent.click(screen.getByRole('button', { name: '새 Agent' }));
  fireEvent.change(screen.getByLabelText('작업 폴더'), {
    target: { value: 'C:\\Projects\\my-work' },
  });
  await screen.findByRole('alert');
  expect((screen.getByRole('button', { name: '만들기' }) as HTMLButtonElement).disabled).toBe(true);
  expect(create).not.toHaveBeenCalled();
});
it.each(['header', 'list'])(
  'requires a fresh archive preview after partial failure from %s and preserves history',
  async (source) => {
    const fixture = await opened();
    const original = fixture.core.agents.archive;
    let first = true;
    const archive = vi
      .spyOn(fixture.core.agents, 'archive')
      .mockImplementation(async (input) =>
        first ? ((first = false), { archived: [], failed: ['sample-agent'] }) : original(input),
      );
    fireEvent.click(
      screen.getByRole('button', { name: source === 'list' ? 'Agent 보관' : '보관' }),
    );
    await waitFor(() =>
      expect(
        (
          screen.getByRole('button', {
            name: '확인하고 보관',
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(false),
    );
    fireEvent.click(screen.getByRole('button', { name: '확인하고 보관' }));
    await screen.findByRole('button', { name: '보관 대상 다시 확인' });
    expect(
      (screen.getByRole('button', { name: '확인하고 보관' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: '보관 대상 다시 확인' }));
    await waitFor(() =>
      expect(
        (
          screen.getByRole('button', {
            name: '확인하고 보관',
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(false),
    );
    fireEvent.click(screen.getByRole('button', { name: '확인하고 보관' }));
    await waitFor(() => expect(screen.queryByLabelText('메시지')).toBeNull());
    expect(archive).toHaveBeenCalledTimes(2);
    expect(screen.getByText(/이번 주에는 Agent 생성/)).toBeTruthy();
  },
);
it('archives an unselected Agent without changing the current draft and sends only once', async () => {
  const fixture = await opened(createFixture('continuity'));
  const user = userEvent.setup();
  const preview = vi.spyOn(fixture.core.agents, 'archivePreview');
  const original = fixture.core.agents.archive;
  let finish!: () => void;
  const archive = vi.spyOn(fixture.core.agents, 'archive').mockImplementation(async (input) => {
    await new Promise<void>((resolve) => {
      finish = resolve;
    });
    return original(input);
  });
  fireEvent.change(screen.getByLabelText('메시지'), { target: { value: '현재 작업 초안' } });
  const opener = within(screen.getByRole('group', { name: '고객 미팅 준비' })).getByRole('button', {
    name: 'Agent 보관',
  });
  await user.click(opener);
  await waitFor(() => expect(preview).toHaveBeenCalledWith({ agent: 'second-agent' }));
  await user.click(screen.getByRole('button', { name: '취소' }));
  await waitFor(() => expect(document.activeElement).toBe(opener));
  expect(archive).not.toHaveBeenCalled();
  await user.click(opener);
  const confirm = screen.getByRole('button', { name: '확인하고 보관' });
  await waitFor(() => expect((confirm as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(confirm);
  fireEvent.click(confirm);
  expect(archive).toHaveBeenCalledTimes(1);
  expect(archive).toHaveBeenCalledWith({ token: 'second-agent' });
  await act(async () => finish());
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  await waitFor(() => expect(screen.queryByRole('group', { name: '고객 미팅 준비' })).toBeNull());
  expect(screen.getByRole('heading', { name: '주간 업무 정리' })).toBeTruthy();
  expect((screen.getByLabelText('메시지') as HTMLTextAreaElement).value).toBe('현재 작업 초안');
  expect(fixture.agents[0]!.archivedAt).toBeNull();
  expect(fixture.agents[1]!.archivedAt).toBeTruthy();
  expect(document.activeElement).toBe(screen.getByRole('navigation', { name: 'Agent 선택' }));
});
it('retains a settings conflict and reloads the current revision before saving', async () => {
  const fixture = await opened();
  fireEvent.click(screen.getByRole('button', { name: '설정' }));
  fireEvent.click(screen.getAllByRole('button', { name: 'Agent 동작' })[0]!);
  await screen.findByLabelText('기본 전송 방식');
  fireEvent.change(screen.getByLabelText('기본 전송 방식'), { target: { value: 'steer' } });
  await act(() => fixture.core.agents.saveSettings({ sendMode: 'queue', revision: 0 }));
  await screen.findByText(
    '다른 화면에서 설정이 변경됐습니다. 편집 내용은 유지했습니다.',
    {
      exact: false,
    },
    { timeout: 3000 },
  );
  fireEvent.click(screen.getByRole('button', { name: '저장' }));
  await screen.findByRole('alert');
  fireEvent.click(screen.getByRole('button', { name: '최신 설정 다시 불러오기' }));
  await waitFor(() =>
    expect((screen.getByLabelText('기본 전송 방식') as HTMLSelectElement).value).toBe('queue'),
  );
  fireEvent.change(screen.getByLabelText('기본 전송 방식'), { target: { value: 'steer' } });
  fireEvent.click(screen.getByRole('button', { name: '저장' }));
  await screen.findByText('기본 전송 방식을 저장했습니다. 새로 접수하는 메시지부터 적용합니다.');
});
it('only sends an explicit permission response and keeps entered answers during refresh', async () => {
  const fixture = createFixture('permission');
  fixture.agents[0]!.permissions[0]!.input = {
    questions: [{ header: '범위', question: '작업 범위', options: [{ label: '전체' }] }],
  };
  const permission = vi.spyOn(fixture.core.agents, 'permission');
  await opened(fixture);
  const field = await screen.findByLabelText('작업 범위');
  fireEvent.change(field, { target: { value: '문서만' } });
  fireEvent(document, new Event('visibilitychange'));
  await waitFor(() =>
    expect((screen.getByLabelText('작업 범위') as HTMLInputElement).value).toBe('문서만'),
  );
  expect(permission).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: '답변 전송' }));
  await waitFor(() =>
    expect(permission).toHaveBeenCalledWith(
      expect.objectContaining({
        behavior: 'allow',
        answers: { answers: { 범위: '문서만' } },
      }),
    ),
  );
});
it('returns focus to the opener on cancel and offers theme selection', async () => {
  render(<App core={createFixture('empty').core} />);
  const user = userEvent.setup();
  const opener = screen.getByRole('button', { name: '새 Agent' });
  await user.click(opener);
  await screen.findByRole('dialog');
  await user.keyboard('{Escape}');
  await waitFor(() => expect(document.activeElement).toBe(opener));
  await user.click(screen.getByRole('button', { name: '설정' }));
  await user.selectOptions(screen.getByLabelText('화면 테마'), 'dark');
  expect(document.documentElement.dataset.theme).toBe('dark');
  expect(localStorage.getItem('worknaru.ui.theme')).toBe('dark');
});

it('starts with an editable blank folder and ignores a late model response after the folder changes', async () => {
  const fixture = createFixture('empty');
  type Options = Awaited<ReturnType<typeof fixture.core.agents.options>>;
  let finishOld!: (value: Options) => void;
  let finishNew!: (value: Options) => void;
  const options = vi.spyOn(fixture.core.agents, 'options').mockImplementation(
    ({ cwd }) =>
      new Promise<Options>((resolve) => {
        if (cwd === 'C:/first') finishOld = resolve;
        else finishNew = resolve;
      }),
  );
  render(<App core={fixture.core} />);
  fireEvent.click(screen.getByRole('button', { name: '새 Agent' }));
  const folder = screen.getByLabelText('작업 폴더') as HTMLInputElement;
  const create = screen.getByRole('button', { name: '만들기' }) as HTMLButtonElement;
  expect(folder.disabled).toBe(false);
  expect(folder.value).toBe('');
  expect(options).not.toHaveBeenCalled();
  expect(create.disabled).toBe(true);
  fireEvent.change(folder, { target: { value: 'C:/first' } });
  await waitFor(() => expect(options).toHaveBeenCalledTimes(1));
  fireEvent.change(folder, { target: { value: 'C:/second' } });
  await waitFor(() => expect(options).toHaveBeenCalledTimes(2));
  const value: Options = {
    available: true,
    models: [{ id: 'new', name: 'New model', default: true }],
  };
  await act(async () =>
    finishOld({ ...value, models: [{ id: 'old', name: 'Old model', default: true }] }),
  );
  expect(create.disabled).toBe(true);
  expect(screen.queryByText('Old model')).toBeNull();
  await act(async () => finishNew(value));
  expect(create.disabled).toBe(false);
  expect((screen.getByLabelText('모델') as HTMLSelectElement).value).toBe('new');
  fireEvent.change(folder, { target: { value: '' } });
  expect(create.disabled).toBe(true);
});
