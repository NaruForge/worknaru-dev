import { useEffect, useRef, useState } from 'react';
import { WorkspaceDomainError, type Workspace, type WorknaruCore } from '@worknaru/core';
import {
  Alert,
  Button,
  Dialog,
  EmptyState,
  Icon,
  Inline,
  Loading,
  PanelGroup,
  ResizablePanel,
  Select,
  Stack,
  TextField,
} from '@worknaru/ui';
import { initialWorkspaceView, type WorkspaceView } from '../../shell/navigation.js';
import type { usePanelLayout } from '../../shell/layout.js';
import { useMediaQuery } from '../../shell/theme.js';
import { useWorkspaceSession, workspaceMessage } from './useWorkspaceSession.js';
import styles from './workspaces.module.css';

type Draft = { kind: 'Workspace' | 'Project'; name: string; workspace: Workspace | null };
export function WorkspaceScreen({
  core,
  active,
  view,
  onNavigate,
  panels,
}: {
  core: WorknaruCore;
  active: boolean;
  view: WorkspaceView;
  onNavigate: (view: WorkspaceView, replace?: boolean) => void;
  panels: ReturnType<typeof usePanelLayout>;
}) {
  const ui = useWorkspaceSession(core, view, active, onNavigate);
  const desktop = useMediaQuery('(min-width: 768px)');
  const DetailHeading = desktop ? 'h2' : 'h1';
  const [draft, setDraft] = useState<Draft | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [uncertain, setUncertain] = useState(false);
  const guard = useRef(false);
  const alive = useRef(true);
  const current = useRef({ active, view });
  if (current.current.active !== active || current.current.view !== view)
    current.current = { active, view };
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const heading = useRef<HTMLHeadingElement>(null);
  const sidebar = useRef<HTMLElement>(null);
  const createButton = useRef<HTMLButtonElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const selected = ui.project ?? ui.workspace;
  const chooseDetail = (next: WorkspaceView) => {
    onNavigate(next);
    if (next.pane === 'detail' && !desktop) requestAnimationFrame(() => heading.current?.focus());
  };
  const chooseWorkspace = (id: string) =>
    chooseDetail({
      ...initialWorkspaceView,
      workspaceId: id || null,
      pane: id ? 'detail' : 'list',
    });
  function openCreate(kind: Draft['kind']) {
    opener.current = document.activeElement as HTMLElement;
    setDialogOpen(true);
    if (draft?.kind === kind && (kind === 'Workspace' || draft.workspace?.id === ui.workspace?.id))
      return;
    setDraft({ kind, name: '', workspace: kind === 'Project' ? ui.workspace : null });
    setError('');
    setUncertain(false);
  }
  async function create() {
    if (!draft || guard.current || !draft.name.trim()) return;
    const origin = current.current;
    const request = draft;
    guard.current = true;
    setBusy(true);
    setError('');
    setUncertain(false);
    try {
      if (request.kind === 'Project' && !request.workspace)
        throw new WorkspaceDomainError('invalid_input', '소속 Workspace를 선택해 주세요.');
      const result =
        request.kind === 'Project' && request.workspace
          ? await core.workspace.createProject({
              workspaceId: request.workspace.id,
              name: request.name,
            })
          : await core.workspace.createWorkspace({ name: request.name });
      if (!alive.current) return;
      setDraft(null);
      setDialogOpen(false);
      ui.refresh();
      if (current.current === origin && origin.active) {
        // Dialog closes after its exit transition; its focus restoration owns this move.
        opener.current = heading.current;
        onNavigate({
          ...initialWorkspaceView,
          pane: 'detail',
          ...(request.kind === 'Project' ? { projectId: result.id } : { workspaceId: result.id }),
        });
      }
    } catch (cause) {
      if (!alive.current) return;
      setError(workspaceMessage(cause));
      setUncertain(
        !(cause instanceof WorkspaceDomainError) ||
          ['timeout', 'connection_failed', 'invalid_response', 'service_error'].includes(
            cause.code,
          ),
      );
    } finally {
      guard.current = false;
      if (alive.current) setBusy(false);
    }
  }
  const showList = () => {
    onNavigate({ ...view, pane: 'list' });
    requestAnimationFrame(() => sidebar.current?.querySelector('select')?.focus());
  };
  const expandList = () => panels.setLayout((value) => ({ ...value, sidebarCollapsed: false }));
  return (
    <>
      {ui.notice && (
        <Alert tone="warning">
          {ui.notice}
          <Button variant="ghost" size="small" onClick={ui.clearNotice}>
            안내 닫기
          </Button>
        </Alert>
      )}
      {ui.error && (
        <Alert tone="error">
          {ui.error}
          <Button variant="secondary" size="small" onClick={ui.refresh}>
            다시 불러오기
          </Button>
        </Alert>
      )}
      <PanelGroup className={styles.layout} data-pane={view.pane}>
        <div className={styles.listPane} data-collapsed={panels.layout.sidebarCollapsed}>
          <ResizablePanel
            label="Workspace 목록"
            side="start"
            width={panels.layout.sidebarWidth}
            collapsed={panels.layout.sidebarCollapsed}
            onWidthChange={(sidebarWidth) =>
              panels.setLayout((value) => ({ ...value, sidebarWidth }))
            }
          >
            <section ref={sidebar} className={styles.sidebar} aria-label="Workspace 탐색">
              <Inline align="between">
                <h1>Workspace</h1>
                <Button variant="ghost" size="small" onClick={ui.refresh} disabled={ui.loading}>
                  새로고침
                </Button>
              </Inline>
              <Button ref={createButton} onClick={() => openCreate('Workspace')}>
                <Icon name="plus" />
                Workspace 만들기
              </Button>
              <Select
                label="Workspace 선택"
                value={ui.workspace?.id ?? view.workspaceId ?? ''}
                onChange={(event) => chooseWorkspace(event.target.value)}
              >
                <option value="">Workspace를 선택하세요</option>
                {ui.workspaces.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} · {item.id}
                  </option>
                ))}
              </Select>
              {ui.loading && <Loading>업무 공간을 불러오는 중…</Loading>}
              {!ui.loading && !ui.error && !ui.workspaces.length && (
                <p className={styles.muted}>첫 Workspace를 만들어 업무를 정리하세요.</p>
              )}
              {ui.workspace && (
                <>
                  <Button variant="secondary" onClick={() => chooseWorkspace(ui.workspace!.id)}>
                    Workspace 정보 보기
                  </Button>
                  <Inline align="between">
                    <h2>Project</h2>
                    <Button
                      variant="ghost"
                      size="small"
                      disabled={ui.loading}
                      onClick={() => openCreate('Project')}
                    >
                      <Icon name="plus" />
                      Project 만들기
                    </Button>
                  </Inline>
                  <nav aria-label="Project 선택" className={styles.projects}>
                    {ui.projects.map((item) => (
                      <Button
                        key={item.id}
                        variant={view.projectId === item.id ? 'secondary' : 'ghost'}
                        aria-current={view.projectId === item.id ? 'page' : undefined}
                        className={styles.projectRow}
                        onClick={() =>
                          chooseDetail({
                            ...initialWorkspaceView,
                            projectId: item.id,
                            pane: 'detail',
                          })
                        }
                      >
                        <span>{item.name}</span>
                        <small>{item.id}</small>
                      </Button>
                    ))}
                  </nav>
                  {!ui.loading && !ui.projects.length && (
                    <p className={styles.muted}>아직 Project가 없습니다.</p>
                  )}
                </>
              )}
            </section>
          </ResizablePanel>
        </div>
        <section className={styles.detailPane} aria-label="업무 공간 상세">
          <header className={styles.heading}>
            <div className={styles.mobileOnly}>
              <Button variant="ghost" onClick={showList}>
                <Icon name="back" />
                목록으로
              </Button>
            </div>
            <div className={styles.desktopOnly}>
              <Button
                variant="ghost"
                size="small"
                onClick={
                  panels.layout.sidebarCollapsed
                    ? expandList
                    : () => panels.setLayout((value) => ({ ...value, sidebarCollapsed: true }))
                }
              >
                {panels.layout.sidebarCollapsed ? '목록 펼치기' : '목록 접기'}
              </Button>
            </div>
            <DetailHeading ref={heading} tabIndex={-1}>
              {selected?.name ?? '업무 공간'}
            </DetailHeading>
          </header>
          <div className={styles.content}>
            {ui.loading ? (
              <Loading>선택한 업무 공간을 확인하는 중…</Loading>
            ) : selected ? (
              <Stack>
                <p className={styles.muted}>{ui.project ? 'Project' : 'Workspace'}</p>
                <dl className={styles.metadata}>
                  <dt>이름</dt>
                  <dd>{selected.name}</dd>
                  <dt>{ui.project ? 'Project ID' : 'Workspace ID'}</dt>
                  <dd>{selected.id}</dd>
                  <dt>생성 시각</dt>
                  <dd>
                    <time dateTime={selected.createdAt}>{selected.createdAt}</time>
                  </dd>
                  {ui.project && ui.workspace && (
                    <>
                      <dt>소속 Workspace</dt>
                      <dd>
                        {ui.workspace.name}
                        <br />
                        {ui.workspace.id}
                      </dd>
                    </>
                  )}
                </dl>
              </Stack>
            ) : (
              <EmptyState title="업무 공간을 선택하세요">
                Workspace를 만들거나 목록에서 선택하면 소속 Project를 확인할 수 있습니다.
              </EmptyState>
            )}
          </div>
        </section>
      </PanelGroup>
      <Dialog
        open={active && dialogOpen}
        busy={busy}
        onOpenChange={(open) => {
          if (!guard.current) setDialogOpen(open);
        }}
        title={`${draft?.kind ?? 'Workspace'} 만들기`}
        description="이름으로 업무 공간을 구분합니다. 같은 이름도 사용할 수 있습니다."
        returnFocus={() =>
          current.current.active ? (opener.current ?? createButton.current) : null
        }
      >
        {draft && (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void create();
            }}
          >
            <Stack>
              {draft.workspace && (
                <p className={styles.parent}>
                  소속 Workspace: {draft.workspace.name}
                  <br />
                  {draft.workspace.id}
                </p>
              )}
              <TextField
                label={`${draft.kind} 이름`}
                value={draft.name}
                required
                maxLength={200}
                disabled={busy}
                onChange={(event) => setDraft({ ...draft, name: event.target.value })}
              />
              {error && <Alert tone="error">{error}</Alert>}
              {uncertain && (
                <Alert tone="warning">
                  생성됐을 수 있습니다. 입력을 유지했습니다. 목록을 확인한 뒤 다시 생성해 주세요.
                  같은 이름만으로 성공 여부를 확정할 수 없습니다.
                  <Button
                    variant="secondary"
                    size="small"
                    onClick={() => {
                      setDialogOpen(false);
                      ui.refresh();
                      showList();
                    }}
                  >
                    목록 확인
                  </Button>
                </Alert>
              )}
              <Inline align="end">
                <Button variant="secondary" disabled={busy} onClick={() => setDialogOpen(false)}>
                  취소
                </Button>
                <Button type="submit" disabled={busy || !draft.name.trim()}>
                  {busy ? '생성 중…' : uncertain ? '다시 생성' : '만들기'}
                </Button>
              </Inline>
            </Stack>
          </form>
        )}
      </Dialog>
    </>
  );
}
