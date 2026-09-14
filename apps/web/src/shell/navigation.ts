import { useCallback, useEffect, useRef, useState } from 'react';

export type SettingsSection = 'appearance' | 'behavior' | 'connection' | 'data';
export type AgentView = {
  kind: 'agents';
  archived: boolean;
  agentId: string | null;
  pane: 'list' | 'conversation';
};
export type View =
  | AgentView
  | { kind: 'settings'; section: SettingsSection }
  | { kind: 'legacy'; agentId: string }
  | { kind: 'invalid' };
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
export function viewHash(view: AgentView | { kind: 'settings'; section: SettingsSection }): string {
  if (view.kind === 'settings') return `#/settings/${view.section}`;
  const params = new URLSearchParams({ list: view.archived ? 'archived' : 'active' });
  if (view.agentId) params.set('agent', view.agentId);
  if (view.agentId && view.pane === 'list') params.set('pane', 'list');
  return `#/agents?${params}`;
}
export function useNavigation() {
  const [view, setView] = useState<View>(() => parseView(location.hash));
  const lastAgent = useRef<AgentView>(view.kind === 'agents' ? view : initialAgentView);
  if (view.kind === 'agents') lastAgent.current = view;
  const navigate = useCallback(
    (next: AgentView | { kind: 'settings'; section: SettingsSection }, replace = false) => {
      const hash = viewHash(next);
      if (location.hash !== hash)
        window.history[replace ? 'replaceState' : 'pushState'](null, '', hash);
      setView(next);
    },
    [],
  );
  useEffect(() => {
    const read = () => setView(parseView(location.hash));
    window.addEventListener('popstate', read);
    window.addEventListener('hashchange', read);
    return () => {
      window.removeEventListener('popstate', read);
      window.removeEventListener('hashchange', read);
    };
  }, []);
  return { view, agentView: lastAgent.current, navigate };
}
