import { StrictMode } from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { ModuleError, type ModuleRun } from '@worknaru/core';
import { App } from '../../shell/App.js';
import { parseView, viewHash, type ModuleView } from '../../shell/navigation.js';
import { createFixture } from '../../testing/fixture.js';
import { moduleFixture, sampleRun } from '../../testing/moduleFixture.js';
import { sampleProject, sampleWorkspace } from '../../testing/workspaceFixture.js';

function setup() {
  const fixture = createFixture();
  const core = { ...fixture.core, modules: moduleFixture(fixture.core.workspace) };
  const element = (
    <StrictMode>
      <App core={core} />
    </StrictMode>
  );
  const rendered = render(element);
  fireEvent.click(screen.getByRole('button', { name: 'Module' }));
  return { core, rendered, element };
}
async function ready() {
  await screen.findByRole('button', { name: new RegExp(sampleRun.id) });
}
function navigate(hash: string) {
  act(() => {
    history.pushState(null, '', hash);
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
}
it('executes in all three explicit contexts and reopens server records through a URL', async () => {
  const { core, rendered, element } = setup();
  await ready();
  const execute = vi.spyOn(core.modules, 'execute');
  for (const target of [
    { type: 'standalone' as const },
    { type: 'workspace' as const, workspaceId: sampleWorkspace.id },
    { type: 'project' as const, projectId: sampleProject.id },
  ]) {
    const value =
      target.type === 'standalone'
        ? 'standalone'
        : target.type === 'workspace'
          ? `workspace:${target.workspaceId}`
          : `project:${target.projectId}`;
    fireEvent.change(screen.getByLabelText('실행 대상'), { target: { value } });
    await waitFor(() =>
      expect((screen.getByRole('button', { name: '실행' }) as HTMLButtonElement).disabled).toBe(
        false,
      ),
    );
    fireEvent.change(screen.getByLabelText('분석할 텍스트'), { target: { value: '가😀\n나' } });
    fireEvent.click(screen.getByRole('button', { name: '실행' }));
    await waitFor(() => expect(location.hash).toContain('run='));
    await screen.findByText('글자 수');
    expect(execute.mock.calls.at(-1)?.[0]).toMatchObject({ target, input: { text: '가😀\n나' } });
    expect(within(screen.getByRole('region', { name: '실행 결과' })).getByText('4')).toBeTruthy();
  }
  const url = location.hash;
  rendered.unmount();
  render(element);
  await screen.findByText('글자 수');
  expect(location.hash).toBe(url);
  expect((screen.getByLabelText('분석할 텍스트') as HTMLTextAreaElement).value).toBe('');
  expect(execute).toHaveBeenCalledTimes(3);
});
it('preserves an ambiguous request across navigation and retries the same ID without duplicate execution', async () => {
  const { core } = setup();
  await ready();
  const original = core.modules.execute;
  let reject!: (reason: Error) => void;
  const execute = vi.spyOn(core.modules, 'execute').mockImplementationOnce(async (request) => {
    await original(request);
    return new Promise((_, fail) => {
      reject = fail;
    });
  });
  fireEvent.change(screen.getByLabelText('분석할 텍스트'), { target: { value: '응답 유실' } });
  const form = screen.getByLabelText('분석할 텍스트').closest('form')!;
  fireEvent.submit(form);
  fireEvent.submit(form);
  expect(execute).toHaveBeenCalledTimes(1);
  await waitFor(() => expect(reject).toBeDefined());
  fireEvent.click(screen.getByRole('button', { name: '설정' }));
  await act(() => reject(new ModuleError('timeout', '응답 없음')));
  fireEvent.click(screen.getByRole('button', { name: '작업으로 돌아가기' }));
  expect((screen.getByLabelText('분석할 텍스트') as HTMLTextAreaElement).value).toBe('응답 유실');
  expect((screen.getByLabelText('분석할 텍스트') as HTMLTextAreaElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: '같은 요청으로 다시 확인' }));
  await screen.findByText('글자 수');
  expect(execute).toHaveBeenCalledTimes(2);
  expect(execute.mock.calls[0]![0]).toEqual(execute.mock.calls[1]![0]);
  expect(await core.modules.listRuns({ target: { type: 'standalone' } })).toHaveLength(2);
});
it('does not let late execution or reads replace the new selection', async () => {
  const { core } = setup();
  await ready();
  let finish!: (run: ModuleRun) => void;
  vi.spyOn(core.modules, 'execute').mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  fireEvent.click(screen.getByRole('button', { name: '실행' }));
  navigate(`#/modules?project=${sampleProject.id}`);
  await act(() => finish(sampleRun));
  expect(location.hash).toBe(`#/modules?project=${sampleProject.id}`);
  expect(screen.queryByText('글자 수')).toBeNull();
  let read!: (run: ModuleRun) => void;
  vi.spyOn(core.modules, 'getRun').mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        read = resolve;
      }),
  );
  navigate(`#/modules?run=${sampleRun.id}`);
  await waitFor(() => expect(read).toBeDefined());
  navigate(`#/modules?workspace=${sampleWorkspace.id}`);
  await act(() => read(sampleRun));
  expect(screen.queryByText('글자 수')).toBeNull();
  expect(location.hash).toBe(`#/modules?workspace=${sampleWorkspace.id}`);
});
it('rejects cross-context links and keeps missing/failed reads recoverable without executing', async () => {
  const { core } = setup();
  await ready();
  const execute = vi.spyOn(core.modules, 'execute');
  navigate(`#/modules?project=${sampleProject.id}&run=${sampleRun.id}`);
  await screen.findByText(/선택한 실행 대상에 속한 기록이 아닙니다/);
  expect(screen.queryByText('글자 수')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: '기록 선택 해제' }));
  await screen.findByText('아직 실행 기록이 없습니다');
  navigate('#/modules?run=99999999-9999-4999-8999-999999999999');
  await screen.findByText('실행 기록을 찾을 수 없습니다.');
  expect(execute).not.toHaveBeenCalled();
});
it('shows failed and uncertain outcomes without automatic re-execution and accepts empty input', async () => {
  const { core } = setup();
  await ready();
  const execute = vi.spyOn(core.modules, 'execute');
  for (const status of ['failed', 'uncertain'] as const) {
    execute.mockResolvedValueOnce({ ...sampleRun, status, result: null });
    vi.spyOn(core.modules, 'getRun').mockResolvedValue({ ...sampleRun, status, result: null });
    fireEvent.click(screen.getByRole('button', { name: '실행' }));
    await screen.findByText(status === 'failed' ? /실행에 실패했습니다/ : /실행이 중단되어/);
  }
  expect(execute).toHaveBeenCalledTimes(2);
  expect(execute.mock.calls[0]![0].input).toEqual({ text: '' });
  fireEvent.change(screen.getByLabelText('분석할 텍스트'), {
    target: { value: 'x'.repeat(100001) },
  });
  expect((screen.getByRole('button', { name: '실행' }) as HTMLButtonElement).disabled).toBe(true);
});
it('refreshes a running record to completion without executing it again', async () => {
  const { core } = setup();
  await ready();
  const execute = vi.spyOn(core.modules, 'execute');
  const read = vi
    .spyOn(core.modules, 'getRun')
    .mockResolvedValueOnce({ ...sampleRun, status: 'running', result: null })
    .mockResolvedValue(sampleRun);
  navigate(`#/modules?run=${sampleRun.id}`);
  await screen.findByText('실행 결과를 확인하는 중…');
  await screen.findByText('글자 수', {}, { timeout: 3000 });
  expect(read).toHaveBeenCalledTimes(2);
  expect(execute).not.toHaveBeenCalled();
});
it('Module URLs round-trip targets and records and reject invalid parameters', () => {
  const view: ModuleView = {
    kind: 'modules',
    target: { type: 'project', projectId: sampleProject.id },
    runId: sampleRun.id,
  };
  expect(parseView(viewHash(view))).toEqual(view);
  for (const hash of [
    '#/modules?run=no',
    '#/modules?workspace=',
    `#/modules?workspace=${sampleWorkspace.id}&project=${sampleProject.id}`,
    '#/modules?extra=1',
  ])
    expect(parseView(hash)).toEqual({ kind: 'invalid', feature: 'modules' });
});
