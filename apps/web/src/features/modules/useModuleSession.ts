import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ModuleError,
  WorkspaceDomainError,
  type ExecuteModuleInput,
  type ModuleDefinition,
  type ModuleRun,
  type ModuleTarget,
  type Project,
  type Workspace,
  type WorknaruCore,
} from '@worknaru/core';
import type { ModuleView } from '../../shell/navigation.js';

export const targetKey = (target: ModuleTarget) =>
  target.type === 'standalone'
    ? 'standalone'
    : target.type === 'workspace'
      ? `workspace:${target.workspaceId}`
      : `project:${target.projectId}`;
export const sameTarget = (run: ModuleRun, target: ModuleTarget) =>
  targetKey(
    run.context.type === 'standalone'
      ? run.context
      : run.context.type === 'workspace'
        ? { type: 'workspace', workspaceId: run.context.workspaceId }
        : { type: 'project', projectId: run.context.projectId },
  ) === targetKey(target);
const message = (cause: unknown) =>
  cause instanceof ModuleError || cause instanceof WorkspaceDomainError
    ? cause.message
    : '실행 환경에서 응답을 확인하지 못했습니다.';
type Draft = { text: string; request: ExecuteModuleInput | null; busy: boolean; error: string };
const emptyDraft = (): Draft => ({ text: '', request: null, busy: false, error: '' });
type Snapshot = {
  key: string;
  modules: ModuleDefinition[];
  workspaces: Workspace[];
  projects: Project[];
  runs: ModuleRun[];
  selected: ModuleRun | null;
};

export function useModuleSession(
  core: WorknaruCore,
  active: boolean,
  view: ModuleView,
  onNavigate: (view: ModuleView) => void,
) {
  const key = targetKey(view.target);
  const readKey = `${key}:${view.runId ?? ''}`;
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [read, setRead] = useState({ key: '', loading: false, error: '' });
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision((value) => value + 1), []);
  const drafts = useRef(new Map<string, Draft>());
  const [, render] = useState(0);
  const update = (origin: string, patch: Partial<Draft>) => {
    drafts.current.set(origin, { ...(drafts.current.get(origin) ?? emptyDraft()), ...patch });
    render((value) => value + 1);
  };
  const current = useRef({ active, view });
  if (current.current.active !== active || current.current.view !== view)
    current.current = { active, view };
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    if (!active) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    setRead({ key: readKey, loading: true, error: '' });
    const load = async () => {
      try {
        const [modules, workspaces, runs, selected] = await Promise.all([
          core.modules.list(),
          core.workspace.listWorkspaces(),
          core.modules.listRuns({ target: view.target }),
          view.runId ? core.modules.getRun({ id: view.runId }) : null,
        ]);
        const projectLists = await Promise.all(
          workspaces.map((workspace) => core.workspace.listProjects({ workspaceId: workspace.id })),
        );
        if (selected && !sameTarget(selected, view.target))
          throw new ModuleError(
            'invalid_input',
            '선택한 실행 대상에 속한 기록이 아닙니다. 이전 실행 목록에서 다시 선택해 주세요.',
          );
        if (stopped) return;
        setSnapshot({
          key: readKey,
          modules,
          workspaces,
          projects: projectLists.flat(),
          runs,
          selected,
        });
        setRead({ key: readKey, loading: false, error: '' });
        if (
          runs.some((run) => ['accepted', 'running'].includes(run.status)) ||
          (selected && ['accepted', 'running'].includes(selected.status))
        )
          timer = setTimeout(() => void load(), 1500);
      } catch (cause) {
        if (!stopped) setRead({ key: readKey, loading: false, error: message(cause) });
      }
    };
    void load();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [core, active, readKey, revision, view.target, view.runId]);
  const draft = drafts.current.get(key) ?? emptyDraft();
  async function execute() {
    const previous = drafts.current.get(key) ?? emptyDraft();
    if (previous.busy || previous.text.length > 100000) return;
    const origin = current.current;
    const request = previous.request ?? {
      moduleId: 'text-stats',
      requestId: crypto.randomUUID(),
      target: view.target,
      input: { text: previous.text },
    };
    update(key, { request, busy: true, error: '' });
    try {
      const run = await core.modules.execute(request);
      if (!alive.current) return;
      update(key, { request: null, busy: false });
      refresh();
      if (current.current === origin && origin.active) onNavigate({ ...view, runId: run.id });
    } catch (cause) {
      if (!alive.current) return;
      // Only explicit pre-acceptance rejections release the request. All ambiguous failures retain it.
      const rejected =
        cause instanceof ModuleError &&
        [
          'invalid_input',
          'module_not_found',
          'workspace_not_found',
          'project_not_found',
          'request_conflict',
        ].includes(cause.code);
      update(key, { busy: false, error: message(cause), ...(rejected ? { request: null } : {}) });
    }
  }
  return {
    data: snapshot?.key === readKey ? snapshot : null,
    choices: snapshot,
    loading: read.key !== readKey || read.loading,
    error: read.key === readKey ? read.error : '',
    draft,
    refresh,
    execute,
    setText: (text: string) => {
      if (!draft.request) update(key, { text, error: '' });
    },
  };
}
