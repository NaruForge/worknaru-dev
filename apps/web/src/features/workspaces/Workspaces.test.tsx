import { StrictMode } from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { WorkspaceDomainError, type Workspace, type Project } from '@worknaru/core';
import { App } from '../../shell/App.js';
import { initialWorkspaceView, parseView, viewHash } from '../../shell/navigation.js';
import { createFixture } from '../../testing/fixture.js';
import { sampleWorkspace, sampleProject } from '../../testing/workspaceFixture.js';

const openWorkspace = () => fireEvent.click(screen.getByRole('button', { name: 'Workspace' }));
const settings = () => fireEvent.click(screen.getByRole('button', { name: /^설정/ }));
function navigate(hash: string) {
  act(() => {
    history.pushState(null, '', hash);
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
}
function open() {
  const fixture = createFixture();
  render(
    <StrictMode>
      <App core={fixture.core} />
    </StrictMode>,
  );
  return fixture;
}
async function selectWorkspace() {
  await screen.findByRole('option', { name: /제품 개발/ });
  fireEvent.change(screen.getByLabelText('Workspace 선택'), {
    target: { value: sampleWorkspace.id },
  });
  await screen.findByRole('button', { name: /가을 출시 준비/ });
}

it('keeps Agent drafts and unsaved settings while Workspace creation selects the returned ID', async () => {
  const f = open();
  fireEvent.click(await screen.findByRole('button', { name: /주간 업무 정리/ }));
  fireEvent.change(await screen.findByLabelText('메시지'), { target: { value: 'Agent 초안' } });
  openWorkspace();
  await selectWorkspace();
  const create = vi.spyOn(f.core.workspace, 'createProject');
  fireEvent.click(screen.getByRole('button', { name: 'Project 만들기' }));
  fireEvent.change(screen.getByLabelText('Project 이름'), { target: { value: '새 계획' } });
  fireEvent.click(screen.getByRole('button', { name: '만들기' }));
  await screen.findByRole('heading', { name: '새 계획' });
  expect(create).toHaveBeenCalledWith({ workspaceId: sampleWorkspace.id, name: '새 계획' });
  const selectedUrl = location.hash;
  expect(selectedUrl).toMatch(/^#\/workspaces\?project=/);
  settings();
  fireEvent.click(screen.getAllByRole('button', { name: 'Agent 동작' })[0]!);
  fireEvent.change(await screen.findByLabelText('기본 전송 방식'), { target: { value: 'steer' } });
  fireEvent.click(screen.getByRole('button', { name: '작업으로 돌아가기' }));
  expect(location.hash).toBe(selectedUrl);
  expect(screen.getByRole('heading', { name: '새 계획' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Agent' }));
  expect((screen.getByLabelText('메시지') as HTMLTextAreaElement).value).toBe('Agent 초안');
  settings();
  expect((screen.getByLabelText('기본 전송 방식') as HTMLSelectElement).value).toBe('steer');
});

it('retains uncertain input for manual inspection and never infers success from a duplicate name', async () => {
  const f = open();
  openWorkspace();
  await screen.findByRole('option', { name: /제품 개발/ });
  let reject!: (error: Error) => void;
  const create = vi.spyOn(f.core.workspace, 'createWorkspace').mockImplementationOnce(
    () =>
      new Promise((_, fail) => {
        reject = fail;
      }),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Workspace 만들기' }));
  fireEvent.change(screen.getByLabelText('Workspace 이름'), {
    target: { value: sampleWorkspace.name },
  });
  fireEvent.click(screen.getByRole('button', { name: '만들기' }));
  expect((screen.getByRole('button', { name: '생성 중…' }) as HTMLButtonElement).disabled).toBe(
    true,
  );
  fireEvent.submit(screen.getByLabelText('Workspace 이름').closest('form')!);
  expect(create).toHaveBeenCalledTimes(1);
  await act(() => reject(new WorkspaceDomainError('timeout', '응답을 확인하지 못했습니다.')));
  expect(screen.getByText(/같은 이름만으로 성공 여부/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: '목록 확인' }));
  await screen.findByRole('option', { name: /제품 개발/ });
  expect(location.hash).toBe('#/workspaces');
  fireEvent.click(screen.getByRole('button', { name: 'Workspace 만들기' }));
  expect((screen.getByLabelText('Workspace 이름') as HTMLInputElement).value).toBe(
    sampleWorkspace.name,
  );
  expect(create).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button', { name: '다시 생성' }));
  await screen.findByRole('heading', { name: sampleWorkspace.name });
  expect(create).toHaveBeenCalledTimes(2);
  expect(location.hash).not.toContain(sampleWorkspace.id);
});

it('a late creation acknowledgement cannot navigate after leaving and returning to the feature', async () => {
  const f = open();
  openWorkspace();
  let finish!: (value: Workspace) => void;
  vi.spyOn(f.core.workspace, 'createWorkspace').mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Workspace 만들기' }));
  fireEvent.change(screen.getByLabelText('Workspace 이름'), { target: { value: '늦은 생성' } });
  fireEvent.click(screen.getByRole('button', { name: '만들기' }));
  navigate('#/settings/appearance');
  expect(screen.queryByRole('dialog')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: '작업으로 돌아가기' }));
  await act(() => finish(sampleWorkspace));
  expect(location.hash).toBe('#/workspaces');
  expect(screen.queryByRole('dialog')).toBeNull();
});

it('ignores stale selection reads, preserves URLs on connection failure and recovers missing links', async () => {
  const f = open();
  let finish!: (value: Project) => void;
  vi.spyOn(f.core.workspace, 'getProject').mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  navigate(`#/workspaces?project=${sampleProject.id}`);
  await waitFor(() => expect(finish).toBeDefined());
  navigate(`#/workspaces?workspace=${sampleWorkspace.id}&pane=list`);
  await screen.findByRole('button', { name: /가을 출시 준비/ });
  await act(() => finish(sampleProject));
  expect(screen.getByRole('heading', { name: sampleWorkspace.name })).toBeTruthy();
  expect(location.hash).toContain('pane=list');
  vi.spyOn(f.core.workspace, 'listWorkspaces').mockRejectedValueOnce(
    new WorkspaceDomainError('connection_failed', '일시적 연결 오류'),
  );
  fireEvent.click(screen.getByRole('button', { name: '새로고침' }));
  await screen.findByText('일시적 연결 오류');
  expect(location.hash).toContain(sampleWorkspace.id);
  navigate('#/workspaces?project=33333333-3333-4333-8333-333333333333');
  await waitFor(() => expect(location.hash).toBe('#/workspaces'));
  expect(screen.getByText(/링크의 Workspace 또는 Project/)).toBeTruthy();
  expect(
    within(screen.getByRole('region', { name: 'Workspace 탐색' })).getByLabelText('Workspace 선택'),
  ).toBeTruthy();
});

it('Workspace URLs round-trip selection and pane while invalid combinations stay in the Workspace feature', () => {
  const view = { ...initialWorkspaceView, projectId: sampleProject.id, pane: 'list' as const };
  expect(parseView(viewHash(view))).toEqual(view);
  expect(parseView(`#/workspaces?project=${sampleProject.id}`)).toEqual({
    ...view,
    pane: 'detail',
  });
  for (const hash of [
    `#/workspaces?workspace=${sampleWorkspace.id}&project=${sampleProject.id}`,
    '#/workspaces?workspace=',
    '#/workspaces?project=prefix',
  ]) {
    expect(parseView(hash)).toEqual({ kind: 'invalid', feature: 'workspaces' });
  }
});
