import { useLayoutEffect, useRef, useState } from 'react';
import { conversationMessages, type Agent, type WorknaruCore } from '@worknaru/core';
import {
  Alert,
  Badge,
  Button,
  Dialog,
  EmptyState,
  Icon,
  IconButton,
  Inline,
  ResizablePanel,
  PanelGroup,
  Loading,
  TextArea,
} from '@worknaru/ui';
import { ArchiveAgentDialog, CreateAgentDialog, DiscardDialog } from './AgentDialogs.js';
import { PermissionCard } from './PermissionCard.js';
import { agentLabel, messageOf, statusLabel } from './agentState.js';
import type { AgentSession } from './useAgentSession.js';
import type { AgentView } from '../../shell/navigation.js';
import type { usePanelLayout } from '../../shell/layout.js';
import { useMediaQuery } from '../../shell/theme.js';
import styles from './agents.module.css';

function AgentDetails({ agent }: { agent: Agent }) {
  return (
    <dl className={styles.metadata}>
      <dt>상태</dt>
      <dd>{agentLabel(agent)}</dd>
      <dt>모델</dt>
      <dd>{agent.model ?? 'Codex'}</dd>
      <dt>작업 폴더</dt>
      <dd>{agent.cwd}</dd>
      <dt>Agent ID</dt>
      <dd>{agent.id}</dd>
    </dl>
  );
}
export function AgentScreen({
  core,
  ui,
  active,
  view,
  onNavigate,
  panels,
  onSettings,
}: {
  core: WorknaruCore;
  ui: AgentSession;
  active: boolean;
  view: AgentView;
  onNavigate: (view: AgentView) => void;
  panels: ReturnType<typeof usePanelLayout>;
  onSettings: () => void;
}) {
  const [dialog, setDialog] = useState<'create' | 'archive' | null>(null);
  const [createOrigin, setCreateOrigin] = useState<string | null>(null);
  const currentView = useRef({ active, agentId: view.agentId });
  currentView.current = { active, agentId: view.agentId };
  function openCreate() {
    setCreateOrigin(view.agentId);
    setDialog('create');
  }
  const [archiveTarget, setArchiveTarget] = useState<Agent | null>(null);
  const expandList = useRef<HTMLButtonElement>(null);
  const detailsToggle = useRef<HTMLButtonElement>(null);
  const details = panels.layout.detailsOpen;
  const setDetails = (detailsOpen: boolean) => {
    panels.setLayout((value) => ({ ...value, detailsOpen }));
    if (!detailsOpen) requestAnimationFrame(() => detailsToggle.current?.focus());
  };
  const wide = useMediaQuery('(min-width: 1280px)');
  const [discard, setDiscard] = useState<{ agent: string; id: string } | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const actionGuard = useRef(false);
  const historyBox = useRef<HTMLDivElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  const atBottom = useRef(true);
  const previousAgent = useRef<string | undefined>(undefined);
  const positions = useRef(
    new Map<
      string,
      {
        epoch: string | null;
        seq: string | undefined;
        offset: number;
        top: number;
        bottom: boolean;
      }
    >(),
  );
  const wasVisible = useRef(false);
  const previousEpoch = useRef<string | null>(null);
  const olderAnchor = useRef<{
    height: number;
    top: number;
    first: number;
    agent: string;
  } | null>(null);
  const [olderBusy, setOlderBusy] = useState(false);
  const selected = ui.selected;
  function rememberPosition() {
    const box = historyBox.current;
    if (!box || !box.clientHeight || !selected || !ui.history) return;
    const top = box.getBoundingClientRect().top;
    const anchor = [...box.querySelectorAll<HTMLElement>('[data-entry-seq]')].find(
      (element) => element.getBoundingClientRect().bottom > top,
    );
    positions.current.set(selected.id, {
      epoch: ui.history.epoch,
      seq: anchor?.dataset.entrySeq,
      offset: anchor ? anchor.getBoundingClientRect().top - top : 0,
      top: box.scrollTop,
      bottom: atBottom.current,
    });
  }
  function choose(agent: Agent) {
    rememberPosition();
    onNavigate({
      kind: 'agents',
      agentId: agent.id,
      archived: !!agent.archivedAt,
      pane: 'conversation',
    });
    setActionError('');
  }
  useLayoutEffect(() => {
    const box = historyBox.current;
    if (!box || !active || !box.clientHeight || (view.pane === 'list' && window.innerWidth < 768)) {
      wasVisible.current = false;
      return;
    }
    if (!ui.history || !selected) return;
    if (
      previousAgent.current !== selected.id ||
      !wasVisible.current ||
      previousEpoch.current !== ui.history.epoch
    ) {
      const saved = positions.current.get(selected.id);
      const anchor =
        saved?.epoch === ui.history.epoch && saved.seq
          ? box.querySelector<HTMLElement>(`[data-entry-seq="${saved.seq}"]`)
          : null;
      if (saved?.epoch === ui.history.epoch && !saved.bottom && anchor) {
        box.scrollTop +=
          anchor.getBoundingClientRect().top - box.getBoundingClientRect().top - saved.offset;
        atBottom.current = false;
      } else {
        box.scrollTop = box.scrollHeight;
        atBottom.current = true;
      }
      previousAgent.current = selected?.id;
      olderAnchor.current = null;
    } else if (
      olderAnchor.current &&
      olderAnchor.current.agent === selected?.id &&
      (ui.history?.entries[0]?.seq ?? Infinity) < olderAnchor.current.first
    ) {
      box.scrollTop = olderAnchor.current.top + box.scrollHeight - olderAnchor.current.height;
      olderAnchor.current = null;
    } else if (atBottom.current && !olderAnchor.current) box.scrollTop = box.scrollHeight;
    wasVisible.current = true;
    previousEpoch.current = ui.history.epoch;
    rememberPosition();
  }, [ui.history, selected?.id, selected?.permissions, ui.queue, active, view.pane]);
  async function action(work: () => Promise<unknown>, notice: string, closeDiscard = false) {
    if (actionGuard.current) return;
    actionGuard.current = true;
    setActionBusy(true);
    setActionError('');
    try {
      await work();
      ui.setNotice(notice);
      if (closeDiscard) setDiscard(null);
      await ui.refresh();
    } catch (e) {
      setActionError(messageOf(e));
    } finally {
      actionGuard.current = false;
      setActionBusy(false);
    }
  }
  async function older() {
    if (!historyBox.current || !selected || olderBusy) return;
    const box = historyBox.current;
    olderAnchor.current = {
      height: box.scrollHeight,
      top: box.scrollTop,
      first: ui.history?.entries[0]?.seq ?? Infinity,
      agent: selected.id,
    };
    setOlderBusy(true);
    try {
      await ui.older();
    } catch (e) {
      olderAnchor.current = null;
      ui.setNotice(messageOf(e));
    } finally {
      setOlderBusy(false);
    }
  }
  const pending = ui.queue.requests.filter((request) =>
    ['queued', 'sending', 'running', 'failed', 'uncertain'].includes(request.state),
  );
  const disableSelection = ui.archiving;
  return (
    <>
      {ui.notice && (
        <div className={styles.notice}>
          <span role="status">{ui.notice}</span>
          <IconButton label="안내 닫기" icon="close" onClick={() => ui.setNotice('')} />
        </div>
      )}
      <PanelGroup className={styles.agentLayout} data-pane={view.pane}>
        <div className={styles.agentNavigation}>
          <ResizablePanel
            label="Agent 목록 너비"
            side="start"
            width={panels.layout.sidebarWidth}
            onWidthChange={(sidebarWidth) =>
              panels.setLayout((value) => ({ ...value, sidebarWidth }))
            }
            collapsed={panels.layout.sidebarCollapsed}
          >
            <aside className={styles.sidebar} aria-label="Agent 목록">
              <div className={styles.sidebarHeading}>
                <Inline align="between">
                  <h1>Agent</h1>
                  <Inline>
                    <Badge>{ui.agents.length}</Badge>
                    <Button
                      variant="ghost"
                      size="small"
                      className={styles.desktopOnly}
                      onClick={() => {
                        panels.setLayout((value) => ({ ...value, sidebarCollapsed: true }));
                        requestAnimationFrame(() => expandList.current?.focus());
                      }}
                    >
                      목록 접기
                    </Button>
                  </Inline>
                </Inline>
                <Button onClick={openCreate} disabled={disableSelection}>
                  <Icon name="plus" />새 Agent
                </Button>
                <Inline>
                  <Button
                    variant={!ui.archived ? 'secondary' : 'ghost'}
                    size="small"
                    aria-pressed={!ui.archived}
                    disabled={disableSelection}
                    onClick={() => {
                      rememberPosition();
                      onNavigate({ kind: 'agents', archived: false, agentId: null, pane: 'list' });
                    }}
                  >
                    활성
                  </Button>
                  <Button
                    variant={ui.archived ? 'secondary' : 'ghost'}
                    size="small"
                    aria-pressed={ui.archived}
                    disabled={disableSelection}
                    onClick={() => {
                      rememberPosition();
                      onNavigate({ kind: 'agents', archived: true, agentId: null, pane: 'list' });
                    }}
                  >
                    <Icon name="archive" />
                    보관함
                  </Button>
                </Inline>
              </div>
              <nav aria-label="Agent 선택" className={styles.agentList}>
                {ui.loading && <Loading />}
                {!ui.loading && !ui.agents.length && (
                  <p className={styles.muted}>
                    {ui.archived ? '보관된 Agent가 없습니다.' : '아직 Agent가 없습니다.'}
                  </p>
                )}
                {ui.agents.map((agent) => (
                  <Button
                    key={agent.id}
                    variant="ghost"
                    className={styles.agentRow}
                    aria-pressed={agent.id === selected?.id}
                    disabled={disableSelection}
                    onClick={() => {
                      choose(agent);
                    }}
                  >
                    <span className={styles.agentRowName}>{agent.name}</span>
                    <span className={styles.muted}>{agentLabel(agent)}</span>
                  </Button>
                ))}
              </nav>
              <div className={styles.sidebarFooter}>
                <Button variant="ghost" onClick={onSettings}>
                  <Icon name="settings" />
                  전송 설정
                </Button>
              </div>
            </aside>
          </ResizablePanel>
        </div>
        <section className={styles.main} aria-label="Agent 작업 영역">
          {panels.layout.sidebarCollapsed && (
            <div className={styles.restoreList}>
              <Button
                ref={expandList}
                variant="ghost"
                size="small"
                onClick={() => panels.setLayout((value) => ({ ...value, sidebarCollapsed: false }))}
              >
                목록 펼치기
              </Button>
            </div>
          )}
          {!selected && ui.selectedId && !ui.readError ? (
            <Loading>Agent를 불러오는 중…</Loading>
          ) : !selected ? (
            <EmptyState
              title={ui.archived ? '보관한 대화를 다시 살펴보세요' : '어떤 일을 함께할까요?'}
              action={
                !ui.archived && (
                  <Button onClick={openCreate}>
                    <Icon name="plus" />첫 Agent 만들기
                  </Button>
                )
              }
            >
              {ui.archived
                ? '왼쪽 보관함에서 Agent를 선택하면 대화 기록을 볼 수 있습니다.'
                : 'Agent는 작업 폴더에서 일을 돕는 AI입니다. Agent를 만들고 메시지로 작업을 요청하세요.'}
            </EmptyState>
          ) : (
            <>
              <header className={styles.conversationHeading}>
                <Inline>
                  <span className={styles.mobileBack}>
                    <IconButton
                      icon="back"
                      label="Agent 목록으로"
                      disabled={disableSelection}
                      onClick={() => {
                        rememberPosition();
                        onNavigate({ ...view, pane: 'list' });
                      }}
                    />
                  </span>
                  <div className={styles.headingName}>
                    <h2>{selected.name}</h2>
                    <Badge tone={selected.permissions.length ? 'warning' : 'neutral'}>
                      {agentLabel(selected)}
                    </Badge>
                  </div>
                </Inline>
                <Inline>
                  <IconButton
                    ref={detailsToggle}
                    icon="info"
                    label="Agent 상세 정보"
                    aria-expanded={details}
                    onClick={() => setDetails(!details)}
                  />
                  <Button
                    variant="ghost"
                    disabled={!!selected.archivedAt || disableSelection}
                    onClick={() => {
                      setArchiveTarget(selected);
                      setDialog('archive');
                    }}
                  >
                    <Icon name="archive" />
                    보관
                  </Button>
                </Inline>
              </header>
              <PanelGroup className={styles.conversationBody}>
                <div className={styles.conversation}>
                  <div
                    ref={historyBox}
                    className={styles.history}
                    aria-label="대화 기록"
                    tabIndex={0}
                    onScroll={(event) => {
                      const box = event.currentTarget;
                      if (!box.clientHeight || !active) return;
                      atBottom.current = box.scrollHeight - box.scrollTop - box.clientHeight < 90;
                      rememberPosition();
                    }}
                  >
                    <div className={styles.reading}>
                      {!!ui.history?.cursor && (
                        <Button
                          variant="secondary"
                          size="small"
                          disabled={olderBusy}
                          onClick={() => void older()}
                        >
                          {olderBusy ? '불러오는 중…' : '이전 대화 불러오기'}
                        </Button>
                      )}
                      {!ui.history ? (
                        <Loading>대화를 불러오는 중…</Loading>
                      ) : !ui.history.entries.some((entry) => entry.text) ? (
                        <EmptyState
                          title={
                            selected.archivedAt ? '보관된 Agent입니다' : '첫 메시지를 보내세요'
                          }
                        >
                          {selected.archivedAt
                            ? '대화 기록이 없습니다.'
                            : '할 일을 구체적으로 적어 주면 Agent가 선택한 폴더에서 작업을 시작합니다.'}
                        </EmptyState>
                      ) : (
                        conversationMessages(ui.history.entries)
                          .filter((entry) => entry.text)
                          .map((entry) => (
                            <article
                              key={`${ui.history?.epoch}-${entry.seq}`}
                              data-entry-seq={entry.seq}
                              className={
                                entry.type === 'user_message'
                                  ? styles.userMessage
                                  : styles.agentMessage
                              }
                            >
                              <strong>
                                {entry.type === 'user_message'
                                  ? '나'
                                  : entry.type === 'assistant_message'
                                    ? 'Agent'
                                    : '작업 기록'}
                              </strong>
                              <div>{entry.text}</div>
                            </article>
                          ))
                      )}
                      {!selected.archivedAt && (
                        <section aria-label="응답이 필요한 요청">
                          {selected.permissions.map((permission) => (
                            <PermissionCard
                              key={`${selected.id}-${permission.id}`}
                              core={core}
                              agentId={selected.id}
                              permission={permission}
                              answers={ui.permissionAnswers(permission.id)}
                              onAnswersChange={(answers) =>
                                ui.setPermissionAnswers(permission.id, answers)
                              }
                              busy={ui.permissionBusy(permission.id)}
                              onBusy={(busy) => ui.setPermissionBusy(permission.id, busy)}
                              onResponded={() => {
                                ui.setNotice('응답을 전달했습니다.');
                                void ui.refresh();
                              }}
                            />
                          ))}
                        </section>
                      )}
                      {(pending.length > 0 || ui.queue.paused) && (
                        <section aria-label="메시지 실행 상태" className={styles.queue}>
                          <h3>메시지 실행 상태</h3>
                          {ui.queue.paused && (
                            <Alert tone="warning">
                              자동 실행이 멈췄습니다. 대화와 요청 상태를 확인해 주세요.
                            </Alert>
                          )}
                          {pending.map((request) => (
                            <div key={request.id} className={styles.queueRow}>
                              <Badge
                                tone={
                                  ['uncertain', 'failed'].includes(request.state)
                                    ? 'warning'
                                    : 'neutral'
                                }
                              >
                                {statusLabel[request.state]}
                              </Badge>
                              <p>{request.text}</p>
                              {request.error && <p>{request.error}</p>}
                              {request.state === 'queued' && !selected.archivedAt && (
                                <Button
                                  variant="secondary"
                                  size="small"
                                  disabled={actionBusy}
                                  onClick={() =>
                                    void action(
                                      () =>
                                        core.agents.cancel({
                                          agent: selected.id,
                                          id: request.id,
                                        }),
                                      '대기 메시지를 취소했습니다.',
                                    )
                                  }
                                >
                                  취소
                                </Button>
                              )}
                              {request.state === 'uncertain' && !selected.archivedAt && (
                                <Button
                                  variant="secondary"
                                  size="small"
                                  disabled={actionBusy}
                                  onClick={() => {
                                    setActionError('');
                                    setDiscard({
                                      agent: selected.id,
                                      id: request.id,
                                    });
                                  }}
                                >
                                  기록 확인 후 실행 포기
                                </Button>
                              )}
                            </div>
                          ))}
                          {ui.queue.paused && !selected.archivedAt && (
                            <Button
                              variant="secondary"
                              disabled={actionBusy}
                              onClick={() =>
                                void action(
                                  () => core.agents.resume({ agent: selected.id }),
                                  '남은 대기열을 재개했습니다.',
                                )
                              }
                            >
                              남은 대기열 재개
                            </Button>
                          )}
                          {actionError && !discard && <Alert tone="error">{actionError}</Alert>}
                        </section>
                      )}
                    </div>
                  </div>
                  <div className={styles.composerWrap}>
                    {selected.archivedAt ? (
                      <Alert>보관된 Agent입니다. 대화 기록은 계속 볼 수 있습니다.</Alert>
                    ) : (
                      <form
                        className={styles.composer}
                        onSubmit={(event) => {
                          event.preventDefault();
                          const input = composer.current;
                          const focused = document.activeElement;
                          const agentId = selected.id;
                          void ui.send().then(() => {
                            if (
                              currentView.current.active &&
                              currentView.current.agentId === agentId &&
                              input?.isConnected &&
                              input.getClientRects().length &&
                              document.activeElement === focused
                            )
                              input.focus();
                          });
                        }}
                      >
                        <TextArea
                          ref={composer}
                          label="메시지"
                          rows={3}
                          maxLength={65536}
                          required
                          value={ui.draft}
                          disabled={ui.archiving}
                          placeholder="어떤 작업을 도와드릴까요?"
                          onChange={(event) => ui.setDraft(event.target.value)}
                          onKeyDown={(event) => {
                            if (
                              event.key === 'Enter' &&
                              !event.shiftKey &&
                              !event.nativeEvent.isComposing &&
                              event.keyCode !== 229
                            ) {
                              event.preventDefault();
                              event.currentTarget.form?.requestSubmit();
                            }
                          }}
                        />
                        <Inline align="between">
                          <div className={styles.composerHint}>
                            <span>
                              전송 방식: {ui.settings.sendMode === 'queue' ? '대기열' : '추가 지시'}
                            </span>
                            <Button variant="ghost" size="small" onClick={onSettings}>
                              전송 방식 변경
                            </Button>
                            <span>Enter로 전송 · Shift+Enter로 줄바꿈</span>
                          </div>
                          <Button
                            type="submit"
                            disabled={ui.sending || ui.archiving || !ui.draft.trim()}
                          >
                            <Icon name="send" />
                            {ui.sending ? '보내는 중…' : '보내기'}
                          </Button>
                        </Inline>
                      </form>
                    )}
                  </div>
                </div>
                {details && wide && (
                  <ResizablePanel
                    label="상세 패널 너비"
                    side="end"
                    width={panels.layout.detailsWidth}
                    onWidthChange={(detailsWidth) =>
                      panels.setLayout((value) => ({ ...value, detailsWidth }))
                    }
                  >
                    <aside aria-label="Agent 상세 정보" className={styles.details}>
                      <Inline align="between">
                        <h3>상세 정보</h3>
                        <IconButton
                          icon="close"
                          label="상세 정보 닫기"
                          onClick={() => setDetails(false)}
                        />
                      </Inline>
                      <AgentDetails agent={selected} />
                    </aside>
                  </ResizablePanel>
                )}
              </PanelGroup>
            </>
          )}
        </section>
      </PanelGroup>
      {active &&
        selected &&
        details &&
        !wide &&
        (view.pane === 'conversation' || window.innerWidth >= 768) && (
          <Dialog
            open
            onOpenChange={setDetails}
            presentation="sheet"
            title="Agent 상세 정보"
            description="선택한 Agent의 상태와 작업 환경입니다."
          >
            <AgentDetails agent={selected} />
          </Dialog>
        )}
      {dialog === 'create' && (
        <CreateAgentDialog
          open={active && view.agentId === createOrigin}
          core={core}
          onClose={() => setDialog(null)}
          focusAfterCreate={() => composer.current}
          onCreated={(agent) => {
            setDialog(null);
            ui.remember(agent);
            if (currentView.current.active && currentView.current.agentId === createOrigin)
              choose(agent);
            else void ui.refresh();
          }}
        />
      )}
      {dialog === 'archive' && archiveTarget && (
        <ArchiveAgentDialog
          open={active && view.agentId === archiveTarget.id}
          core={core}
          agent={archiveTarget}
          onClose={() => setDialog(null)}
          onBusy={(busy) => ui.setAgentArchiving(archiveTarget.id, busy)}
          focusAfterArchive={() => historyBox.current}
          onArchived={() => {
            setDialog(null);
            ui.setNotice(
              `${archiveTarget.name}을 보관했습니다. 보관함에서 대화 기록을 다시 볼 수 있습니다.`,
            );
            void ui.refresh();
          }}
        />
      )}
      {discard && (
        <DiscardDialog
          open={active && view.agentId === discard.agent}
          busy={actionBusy}
          error={actionError}
          onClose={() => setDiscard(null)}
          onConfirm={() =>
            void action(
              () => core.agents.discard(discard),
              '요청을 취소 처리했습니다. 남은 대기열을 재개할 수 있습니다.',
              true,
            )
          }
        />
      )}
    </>
  );
}
