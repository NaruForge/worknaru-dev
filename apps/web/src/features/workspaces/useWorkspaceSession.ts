import { useCallback, useEffect, useState } from 'react';
import {
  WorkspaceDomainError,
  type Project,
  type Workspace,
  type WorknaruCore,
} from '@worknaru/core';
import { initialWorkspaceView, type WorkspaceView } from '../../shell/navigation.js';

export function workspaceMessage(error: unknown) {
  return error instanceof WorkspaceDomainError
    ? error.message
    : '업무 데이터를 불러오거나 저장하지 못했습니다.';
}

type Snapshot = {
  key: string;
  workspaces: Workspace[];
  workspace: Workspace | null;
  project: Project | null;
  projects: Project[];
};

export function useWorkspaceSession(
  core: WorknaruCore,
  view: WorkspaceView,
  active: boolean,
  onNavigate: (view: WorkspaceView, replace?: boolean) => void,
) {
  const key = `${view.workspaceId ?? ''}:${view.projectId ?? ''}`;
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [read, setRead] = useState({ key: '', loading: true, error: '' });
  const [notice, setNotice] = useState('');
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision((value) => value + 1), []);
  useEffect(() => {
    if (!active) return;
    let stopped = false;
    setRead({ key, loading: true, error: '' });
    const selection = async () => {
      const project = view.projectId
        ? await core.workspace.getProject({ id: view.projectId })
        : null;
      const workspaceId = project?.workspaceId ?? view.workspaceId;
      if (!workspaceId) return { workspace: null, project: null, projects: [] };
      const [workspace, projects] = await Promise.all([
        core.workspace.getWorkspace({ id: workspaceId }),
        core.workspace.listProjects({ workspaceId }),
      ]);
      return { workspace, project, projects };
    };
    void Promise.all([core.workspace.listWorkspaces(), selection()])
      .then(([workspaces, selected]) => {
        if (stopped) return;
        setSnapshot({ key, workspaces, ...selected });
        setRead({ key, loading: false, error: '' });
      })
      .catch((error) => {
        if (stopped) return;
        setRead({ key, loading: false, error: workspaceMessage(error) });
        if (
          error instanceof WorkspaceDomainError &&
          ['workspace_not_found', 'project_not_found'].includes(error.code)
        ) {
          setNotice(
            '링크의 Workspace 또는 Project를 찾을 수 없습니다. 목록에서 다시 선택해 주세요.',
          );
          onNavigate(initialWorkspaceView, true);
        }
      });
    return () => {
      stopped = true;
    };
  }, [core, key, view.workspaceId, view.projectId, active, revision, onNavigate]);
  useEffect(() => {
    if (!active) return;
    const visible = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', visible);
    return () => {
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', visible);
    };
  }, [active, refresh]);
  const selected = snapshot?.key === key ? snapshot : null;
  return {
    workspaces: snapshot?.workspaces ?? [],
    workspace: selected?.workspace ?? null,
    project: selected?.project ?? null,
    projects: selected?.projects ?? [],
    loading: read.key !== key || read.loading,
    error: read.key === key ? read.error : '',
    notice,
    clearNotice: () => setNotice(''),
    refresh,
  };
}
