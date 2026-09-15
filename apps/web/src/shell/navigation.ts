import { useCallback, useEffect, useRef, useState } from 'react';

export type SettingsSection = 'appearance' | 'behavior' | 'connection' | 'data';
export type AgentView = {
  kind: 'agents';
  archived: boolean;
  agentId: string | null;
  pane: 'list' | 'conversation';
};
export type WorkspaceView = {
  kind: 'workspaces';
  workspaceId: string | null;
  projectId: string | null;
  pane: 'list' | 'detail';
};
export type NavigableView =
  AgentView | WorkspaceView | { kind: 'settings'; section: SettingsSection };
export type View =
  NavigableView | { kind: 'legacy'; agentId: string } | { kind: 'invalid'; feature?: 'workspaces' };
export const initialWorkspaceView: WorkspaceView = {
  kind: 'workspaces',
  workspaceId: null,
  projectId: null,
  pane: 'list',
};
export const initialAgentView: AgentView = {
  kind: 'agents',
  archived: false,
  agentId: null,
  pane: 'list',
};
export function parseView(hash: string): View {
  if (!hash || hash === '#') return initialAgentView;
  const value = hash.slice(1);
  if (!value.startsWith('/')) {
    try {
      return { kind: 'legacy', agentId: decodeURIComponent(value) };
    } catch {
      return { kind: 'invalid' };
    }
  }
  const [path, query = ''] = value.split('?');
  if (path === '/workspaces') {
    const params = new URLSearchParams(query);
    const workspaceId = params.get('workspace');
    const projectId = params.get('project');
    const validId = (id: string | null) =>
      id === null || /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id);
    if (
      !validId(workspaceId) ||
      !validId(projectId) ||
      (workspaceId && projectId) ||
      [...params.keys()].some(
        (key) => !['workspace', 'project', 'pane'].includes(key) || params.getAll(key).length !== 1,
      ) ||
      (params.has('pane') && !['list', 'detail'].includes(params.get('pane')!))
    )
      return { kind: 'invalid', feature: 'workspaces' };
    return {
      kind: 'workspaces',
      workspaceId,
      projectId,
      pane: (workspaceId || projectId) && params.get('pane') !== 'list' ? 'detail' : 'list',
    };
  }
  if (path === '/agents') {
    const params = new URLSearchParams(query);
    const agentId = params.get('agent') || null;
    return {
      kind: 'agents',
      archived: params.get('list') === 'archived',
      agentId,
      pane: agentId && params.get('pane') !== 'list' ? 'conversation' : 'list',
    };
  }
  const section = path?.slice('/settings/'.length);
  if (
    path?.startsWith('/settings/') &&
    ['appearance', 'behavior', 'connection', 'data'].includes(section!)
  )
    return { kind: 'settings', section: section as SettingsSection };
  return { kind: 'invalid' };
}
export function viewHash(view: NavigableView): string {
  if (view.kind === 'settings') return `#/settings/${view.section}`;
  if (view.kind === 'workspaces') {
    const params = new URLSearchParams();
    if (view.projectId) params.set('project', view.projectId);
    else if (view.workspaceId) params.set('workspace', view.workspaceId);
    if ((view.projectId || view.workspaceId) && view.pane === 'list') params.set('pane', 'list');
    return `#/workspaces${params.size ? `?${params}` : ''}`;
  }
  const params = new URLSearchParams({ list: view.archived ? 'archived' : 'active' });
  if (view.agentId) params.set('agent', view.agentId);
  if (view.agentId && view.pane === 'list') params.set('pane', 'list');
  return `#/agents?${params}`;
}
export function useNavigation() {
  const [view, setView] = useState<View>(() => parseView(location.hash));
  const lastAgent = useRef<AgentView>(view.kind === 'agents' ? view : initialAgentView);
  const lastWorkspace = useRef<WorkspaceView>(
    view.kind === 'workspaces' ? view : initialWorkspaceView,
  );
  const lastWork = useRef<AgentView | WorkspaceView>(
    view.kind === 'workspaces' ? view : lastAgent.current,
  );
  if (view.kind === 'agents') lastAgent.current = view;
  if (view.kind === 'workspaces') lastWorkspace.current = view;
  if (view.kind === 'agents' || view.kind === 'workspaces') lastWork.current = view;
  const navigate = useCallback((next: NavigableView, replace = false) => {
    const hash = viewHash(next);
    if (location.hash !== hash)
      window.history[replace ? 'replaceState' : 'pushState'](null, '', hash);
    setView(next);
  }, []);
  useEffect(() => {
    const read = () => setView(parseView(location.hash));
    window.addEventListener('popstate', read);
    window.addEventListener('hashchange', read);
    return () => {
      window.removeEventListener('popstate', read);
      window.removeEventListener('hashchange', read);
    };
  }, []);
  return {
    view,
    agentView: lastAgent.current,
    workspaceView: lastWorkspace.current,
    workView: lastWork.current,
    navigate,
  };
}
