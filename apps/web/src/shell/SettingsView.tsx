import { useEffect, useRef, useState } from 'react';
import type { AgentSettings, DaemonStatus, WorknaruCore } from '@worknaru/core';
import {
  Alert,
  Badge,
  Button,
  Inline,
  Loading,
  PanelGroup,
  ResizablePanel,
  Select,
  Stack,
} from '@worknaru/ui';
import { messageOf } from '../features/agents/agentState.js';
import type { SettingsSection } from './navigation.js';
import type { Theme } from './theme.js';
import type { usePanelLayout } from './layout.js';
import styles from './shell.module.css';

export function useSharedSettings(core: WorknaruCore, observed: AgentSettings) {
  const [base, setBase] = useState<AgentSettings | null>(null);
  const [latest, setLatest] = useState<AgentSettings | null>(null);
  const [mode, setMode] = useState<AgentSettings['sendMode']>('queue');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const guard = useRef(false);
  const loadGeneration = useRef(0);
  const dirty = !!base && mode !== base.sendMode;
  useEffect(() => {
    let stopped = false;
    const generation = ++loadGeneration.current;
    void core.agents
      .settings({})
      .then((value) => {
        if (!stopped && generation === loadGeneration.current) {
          setBase(value);
          setLatest(value);
          setMode(value.sendMode);
        }
      })
      .catch((e) => {
        if (!stopped && generation === loadGeneration.current) setError(messageOf(e));
      });
    return () => {
      stopped = true;
      loadGeneration.current++;
    };
  }, [core]);
  useEffect(() => {
    if (!base || observed.revision <= (latest?.revision ?? -1)) return;
    setLatest(observed);
    if (!dirty && !busy) {
      setBase(observed);
      setMode(observed.sendMode);
    }
  }, [observed, base, latest, dirty, busy]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  async function reload() {
    if (guard.current) return;
    const generation = ++loadGeneration.current;
    guard.current = true;
    setBusy(true);
    setError('');
    try {
      const value = await core.agents.settings({});
      if (generation === loadGeneration.current) {
        setLatest(value);
        setBase(value);
        setMode(value.sendMode);
        setNotice('최신 설정을 불러왔습니다.');
      }
    } catch (e) {
      if (generation === loadGeneration.current) setError(messageOf(e));
    } finally {
      if (generation === loadGeneration.current) {
        guard.current = false;
        setBusy(false);
      }
    }
  }
  async function save() {
    if (!base || guard.current || !dirty) return;
    guard.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const value = await core.agents.saveSettings({ sendMode: mode, revision: base.revision });
      setBase(value);
      setLatest(value);
      setMode(value.sendMode);
      setNotice('기본 전송 방식을 저장했습니다. 새로 접수하는 메시지부터 적용합니다.');
    } catch (e) {
      setError(messageOf(e));
    } finally {
      guard.current = false;
      setBusy(false);
    }
  }
  return {
    base,
    mode,
    setMode: (value: AgentSettings['sendMode']) => {
      setMode(value);
      setNotice('');
    },
    error,
    notice,
    busy,
    dirty,
    conflict: !!base && !!latest && latest.revision !== base.revision,
    reload,
    save,
    cancel: () => {
      if (latest && !guard.current) {
        setBase(latest);
        setMode(latest.sendMode);
        setError('');
        setNotice('변경을 취소했습니다.');
      }
    },
  };
}
export type SharedSettings = ReturnType<typeof useSharedSettings>;
const statusFailures: Record<NonNullable<DaemonStatus['failure']>['code'], string> = {
  connection_failed: '연결할 수 없습니다. 전용 Daemon이 실행 중인지 확인해 주세요.',
  authentication_required: '이 Daemon은 인증이 필요합니다.',
  authentication_failed: 'Daemon 인증에 실패했습니다.',
  timeout: '응답을 기다리는 시간이 초과됐습니다. 다시 확인해 주세요.',
  target_mismatch: '응답한 서버가 설정된 전용 Daemon과 다릅니다.',
  unsupported_version: '현재 지원하는 Paseo 버전과 다릅니다.',
  invalid_response: 'Daemon의 응답을 확인할 수 없습니다.',
  request_failed: 'Daemon이 상태 조회 요청을 처리하지 못했습니다.',
  cleanup_failed: '조회 연결을 정리하지 못했습니다.',
  unknown: '상태를 확인하지 못했습니다. 잠시 후 다시 확인해 주세요.',
};
export function SettingsView({
  core,
  endpoint,
  section,
  onSection,
  onReturn,
  theme,
  setTheme,
  panels,
  shared,
}: {
  core: WorknaruCore;
  endpoint: string;
  section: SettingsSection;
  onSection: (section: SettingsSection) => void;
  onReturn: () => void;
  theme: Theme;
  setTheme: (theme: Theme) => void;
  panels: ReturnType<typeof usePanelLayout>;
  shared: SharedSettings;
}) {
  const [status, setStatus] = useState<DaemonStatus | null>(null);
  const [connectionError, setConnectionError] = useState('');
  const [checking, setChecking] = useState(false);
  const checkGuard = useRef(false);
  const expandList = useRef<HTMLButtonElement>(null);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  async function check() {
    if (checkGuard.current) return;
    checkGuard.current = true;
    setChecking(true);
    setStatus(null);
    setConnectionError('');
    try {
      const value = await core.getDaemonStatus();
      if (alive.current) setStatus(value);
    } catch {
      if (alive.current) setConnectionError('연결 상태를 확인하지 못했습니다. 다시 시도해 주세요.');
    } finally {
      checkGuard.current = false;
      if (alive.current) setChecking(false);
    }
  }
  const categories = (
    <nav className={styles.settingsCategories} aria-label="설정 섹션">
      {(['appearance', 'behavior', 'connection'] as const).map((value) => (
        <Button
          key={value}
          variant={section === value ? 'secondary' : 'ghost'}
          aria-current={section === value ? 'page' : undefined}
          onClick={() => onSection(value)}
        >
          {{ appearance: '화면', behavior: 'Agent 동작', connection: '연결' }[value]}
          {value === 'behavior' && shared.dirty && <Badge tone="warning">미저장</Badge>}
        </Button>
      ))}
    </nav>
  );
  return (
    <PanelGroup className={styles.settingsLayout}>
      <div className={styles.settingsSidebar}>
        <ResizablePanel
          label="설정 목록 너비"
          side="start"
          width={panels.layout.sidebarWidth}
          onWidthChange={(sidebarWidth) =>
            panels.setLayout((value) => ({ ...value, sidebarWidth }))
          }
          collapsed={panels.layout.sidebarCollapsed}
        >
          <aside className={styles.contextSidebar}>
            <h2>설정</h2>
            {categories}
            <Button
              variant="ghost"
              onClick={() => {
                panels.setLayout((value) => ({ ...value, sidebarCollapsed: true }));
                requestAnimationFrame(() => expandList.current?.focus());
              }}
            >
              설정 목록 접기
            </Button>
          </aside>
        </ResizablePanel>
      </div>
      <section className={styles.settingsMain} aria-label="환경설정">
        <header className={styles.viewHeading}>
          <Inline>
            <Button variant="ghost" onClick={onReturn}>
              작업으로 돌아가기
            </Button>
            <h1>설정</h1>
          </Inline>
          {shared.dirty && <Badge tone="warning">저장하지 않은 변경</Badge>}
        </header>
        <div className={styles.compactCategories} data-collapsed={panels.layout.sidebarCollapsed}>
          {panels.layout.sidebarCollapsed && (
            <Button
              ref={expandList}
              variant="ghost"
              size="small"
              className={styles.desktopOnly}
              onClick={() => panels.setLayout((value) => ({ ...value, sidebarCollapsed: false }))}
            >
              설정 목록 펼치기
            </Button>
          )}
          {categories}
        </div>
        <div className={styles.settingsContent}>
          {section === 'appearance' && (
            <Stack>
              <h2>화면</h2>
              <p>
                현재 브라우저에 저장하고 바로 적용합니다. 다른 기기와 CLI에는 영향을 주지 않습니다.
              </p>
              <Select
                label="화면 테마"
                value={theme}
                onChange={(event) => setTheme(event.target.value as Theme)}
              >
                <option value="system">시스템 설정</option>
                <option value="light">밝게</option>
                <option value="dark">어둡게</option>
              </Select>
              <section className={styles.settingGroup}>
                <h3>패널 배치</h3>
                <p>
                  목록과 상세 패널의 너비·접힘을 이 브라우저에 기억합니다. 구분선을 드래그하거나
                  Tab으로 선택한 뒤 방향키로 조절하세요.
                </p>
                <Button variant="secondary" onClick={panels.reset}>
                  배치 초기화
                </Button>
                {panels.storageError && <Alert tone="warning">{panels.storageError}</Alert>}
              </section>
            </Stack>
          )}
          {section === 'behavior' && (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void shared.save();
              }}
            >
              <Stack>
                <h2>Agent 동작</h2>
                <p>
                  연결된 실행 환경의 CLI와 Web이 함께 사용하는 설정입니다. 저장한 뒤 새로 접수하는
                  메시지부터 적용하며, 이미 접수한 메시지의 방식은 바꾸지 않습니다.
                </p>
                {shared.base ? (
                  <Select
                    label="기본 전송 방식"
                    value={shared.mode}
                    disabled={shared.busy}
                    onChange={(event) =>
                      shared.setMode(event.target.value as AgentSettings['sendMode'])
                    }
                  >
                    <option value="queue">대기열에 추가</option>
                    <option value="steer">진행 중인 작업에 추가 지시</option>
                  </Select>
                ) : (
                  !shared.error && <Loading />
                )}
                <p>
                  대기열은 현재 작업이 성공하면 순서대로 실행됩니다. 추가 지시를 적용할 수 없으면
                  진행 중인 작업을 중단하고 새 요청을 시작할 수 있습니다.
                </p>
                {shared.conflict && (
                  <Alert tone="warning">
                    다른 화면에서 설정이 변경됐습니다. 편집 내용은 유지했습니다. 최신 설정을 다시
                    불러오면 현재 편집 내용을 대체합니다.
                  </Alert>
                )}
                {shared.error && <Alert tone="error">{shared.error}</Alert>}
                {(shared.error || shared.conflict) && (
                  <Button
                    variant="secondary"
                    disabled={shared.busy}
                    onClick={() => void shared.reload()}
                  >
                    최신 설정 다시 불러오기
                  </Button>
                )}
                {shared.notice && <Alert tone="success">{shared.notice}</Alert>}
                <Inline>
                  <Button type="submit" disabled={!shared.dirty || shared.busy}>
                    {shared.busy ? '저장 중…' : '저장'}
                  </Button>
                  <Button
                    variant="secondary"
                    disabled={!shared.dirty || shared.busy}
                    onClick={shared.cancel}
                  >
                    변경 취소
                  </Button>
                </Inline>
                <p className={styles.muted}>
                  저장하지 않고 이동해도 수정 내용은 이 탭 안에 남습니다. 새로고침·탭 종료 후에는
                  유지되지 않습니다.
                </p>
              </Stack>
            </form>
          )}
          {section === 'connection' && (
            <Stack>
              <h2>연결</h2>
              <p>
                Agent를 실행하는 서버의 진단 정보입니다. 조회 실패만으로 서버가 종료됐다고 판단하지
                않습니다.
              </p>
              {checking ? (
                <Loading>Daemon의 응답을 기다리고 있습니다…</Loading>
              ) : status ? (
                <Alert tone={status.outcome === 'available' ? 'success' : 'error'}>
                  {status.outcome === 'available'
                    ? '전용 Daemon이 정상적으로 응답했습니다.'
                    : statusFailures[status.failure.code]}
                </Alert>
              ) : (
                <p>상태 확인을 눌러 연결을 확인해 주세요.</p>
              )}
              {connectionError && <Alert tone="error">{connectionError}</Alert>}
              <dl className={styles.connection}>
                <dt>접속 주소</dt>
                <dd>{endpoint}</dd>
                <dt>서버 ID</dt>
                <dd id="server-id">{status?.server?.id ?? '—'}</dd>
                <dt>Paseo 버전</dt>
                <dd>{status?.server?.version ?? '—'}</dd>
                <dt>확인 시각</dt>
                <dd>{status ? new Date(status.checkedAt).toLocaleTimeString('ko-KR') : '—'}</dd>
              </dl>
              <Button disabled={checking} onClick={() => void check()}>
                상태 확인
              </Button>
            </Stack>
          )}
        </div>
      </section>
    </PanelGroup>
  );
}
