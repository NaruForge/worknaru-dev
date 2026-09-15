import type { DataClient } from './dataClient.js';
import { useEffect, useRef, useState } from 'react';
import { brand } from '@worknaru/branding';
import type { WorknaruCore } from '@worknaru/core';
import {
  Alert,
  Button,
  Dialog,
  EmptyState,
  Icon,
  IconButton,
  Inline,
  Link,
  Loading,
  Stack,
} from '@worknaru/ui';
import { loadCore } from '../bootstrap.js';
import { AgentScreen } from '../features/agents/AgentScreen.js';
import { WorkspaceScreen } from '../features/workspaces/WorkspaceScreen.js';
import { useAgentSession } from '../features/agents/useAgentSession.js';
import { useTheme } from './theme.js';
import {
  initialAgentView,
  initialWorkspaceView,
  useNavigation,
  type SettingsSection,
  type AgentView,
  type WorkspaceView,
} from './navigation.js';
import { usePanelLayout } from './layout.js';
import { SettingsView, useSharedSettings } from './SettingsView.js';
import styles from './shell.module.css';

const coreIds = new WeakMap<WorknaruCore, number>();
let nextCoreId = 0;
function suppliedIdentity(core: WorknaruCore) {
  if (!coreIds.has(core)) coreIds.set(core, ++nextCoreId);
  return `injected-${coreIds.get(core)}`;
}
function ConnectedApp({
  core,
  endpoint,
  dataClient,
  storagePrefix = 'worknaru.ui',
}: {
  core: WorknaruCore;
  dataClient?: DataClient | undefined;
  endpoint: string;
  storagePrefix?: string;
}) {
  const navigation = useNavigation();
  const ui = useAgentSession(core, navigation.agentView);
  const panels = usePanelLayout(storagePrefix);
  const { theme, setTheme } = useTheme(storagePrefix);
  const [resetting, setResetting] = useState(false);
  const shared = useSharedSettings(core, ui.settings, resetting);
  const [help, setHelp] = useState(false);
  const [routeNotice, setRouteNotice] = useState('');
  const lastFocus = useRef<{ agents: HTMLElement | null; workspaces: HTMLElement | null }>({
    agents: null,
    workspaces: null,
  });
  const lastSection = useRef<SettingsSection>('appearance');
  const active = !resetting && navigation.view.kind === 'agents';
  const workspaceActive = !resetting && navigation.view.kind === 'workspaces';
  const settingsActive = resetting || navigation.view.kind === 'settings';
  if (navigation.view.kind === 'settings') lastSection.current = navigation.view.section;
  useEffect(() => {
    if (navigation.view.kind === 'invalid' || (navigation.view.kind === 'agents' && ui.missing)) {
      if (navigation.view.kind === 'invalid' && navigation.view.feature === 'workspaces') {
        setRouteNotice('사용할 수 없는 업무 공간 주소입니다. 목록에서 다시 선택해 주세요.');
        navigation.navigate(initialWorkspaceView, true);
        return;
      }
      setRouteNotice('사용할 수 없는 주소 또는 Agent입니다. 목록에서 작업을 선택해 주세요.');
      navigation.navigate(initialAgentView, true);
    }
  }, [navigation.view, navigation.navigate, ui.missing]);
  useEffect(() => {
    if (navigation.view.kind !== 'legacy') return;
    let stopped = false;
    void core.agents
      .show({ agent: navigation.view.agentId })
      .then((agent) => {
        if (!stopped) {
          ui.remember(agent);
          navigation.navigate(
            {
              kind: 'agents',
              agentId: agent.id,
              archived: !!agent.archivedAt,
              pane: 'conversation',
            },
            true,
          );
        }
      })
      .catch(() => {
        if (!stopped) {
          setRouteNotice('링크의 Agent를 찾을 수 없습니다. 목록에서 작업을 선택해 주세요.');
          navigation.navigate(initialAgentView, true);
        }
      });
    return () => {
      stopped = true;
    };
  }, [core, navigation.view, navigation.navigate]);
  useEffect(() => {
    const view = navigation.view;
    if (
      view.kind === 'agents' &&
      ui.selected?.id === view.agentId &&
      !!ui.selected.archivedAt !== view.archived
    )
      navigation.navigate({ ...view, archived: !!ui.selected.archivedAt }, true);
  }, [navigation.view, navigation.navigate, ui.selected]);
  const openSettings = (section = lastSection.current) =>
    navigation.navigate({ kind: 'settings', section });
  const returnToWork = (view: AgentView | WorkspaceView) => {
    navigation.navigate(view);
    requestAnimationFrame(() => {
      const target = lastFocus.current[view.kind];
      if (target?.isConnected && target.getClientRects().length && !target.matches(':disabled'))
        target.focus({ preventScroll: true });
      else
        document
          .querySelector<HTMLElement>(
            view.kind === 'workspaces'
              ? '[aria-label="Workspace 탐색"] select'
              : '[aria-label="대화 기록"], [aria-label="Agent 선택"] button',
          )
          ?.focus({ preventScroll: true });
    });
  };
  return (
    <div className={styles.app}>
      <aside className={styles.appRail} aria-label="앱 탐색 영역">
        <div className={styles.brand} title={`${brand.displayName} · 개발 환경`}>
          {brand.logo ? (
            <img className={styles.logo} src={`./${brand.logo}`} alt={brand.displayName} />
          ) : (
            <span role="img" aria-label={brand.displayName}>
              <Icon name="message" />
            </span>
          )}
        </div>
        <nav aria-label="앱 탐색" className={styles.appNavigation}>
          <IconButton
            icon="message"
            label="Agent"
            disabled={resetting}
            variant={active ? 'secondary' : 'ghost'}
            aria-current={active ? 'page' : undefined}
            onClick={() => returnToWork(navigation.agentView)}
          />
          <IconButton
            icon="workspace"
            label="Workspace"
            disabled={resetting}
            variant={workspaceActive ? 'secondary' : 'ghost'}
            aria-current={workspaceActive ? 'page' : undefined}
            onClick={() => returnToWork(navigation.workspaceView)}
          />
          <div className={styles.settingsNavigation}>
            <IconButton
              icon="settings"
              disabled={resetting}
              label={shared.dirty ? '설정 (미저장)' : '설정'}
              variant={settingsActive ? 'secondary' : 'ghost'}
              aria-current={settingsActive ? 'page' : undefined}
              onClick={() => openSettings()}
            />
            {shared.dirty && (
              <span className={styles.unsavedIndicator} aria-hidden="true">
                <Icon name="info" />
              </span>
            )}
          </div>
        </nav>
        <div className={styles.railFooter}>
          <span role="img" aria-label="개발 환경" title="개발 환경">
            <Icon name="info" />
          </span>
          {Object.keys(brand.links).length > 0 && (
            <IconButton icon="more" label="도움말" onClick={() => setHelp(true)} />
          )}
        </div>
      </aside>
      <main className={styles.workArea}>
        {ui.readError && active && (
          <Alert tone="error">
            {ui.readError}
            <Inline>
              <Button variant="secondary" size="small" onClick={() => void ui.refresh()}>
                다시 연결
              </Button>
              <Button variant="ghost" size="small" onClick={() => openSettings('connection')}>
                연결 확인
              </Button>
            </Inline>
          </Alert>
        )}
        {routeNotice && (
          <Alert tone="warning">
            {routeNotice}
            <Button variant="ghost" size="small" onClick={() => setRouteNotice('')}>
              안내 닫기
            </Button>
          </Alert>
        )}
        <div
          className={styles.featureView}
          hidden={!active}
          onFocusCapture={(event) => {
            lastFocus.current.agents = event.target as HTMLElement;
          }}
        >
          <AgentScreen
            core={core}
            ui={ui}
            active={active}
            view={navigation.agentView}
            onNavigate={navigation.navigate}
            panels={panels}
          />
        </div>
        <div
          className={styles.featureView}
          hidden={!workspaceActive}
          onFocusCapture={(event) => {
            lastFocus.current.workspaces = event.target as HTMLElement;
          }}
        >
          <WorkspaceScreen
            core={core}
            active={workspaceActive}
            view={navigation.workspaceView}
            onNavigate={navigation.navigate}
            panels={panels}
          />
        </div>
        <div className={styles.featureView} hidden={!settingsActive}>
          <SettingsView
            core={core}
            dataClient={dataClient}
            active={settingsActive}
            resetting={resetting}
            onResetting={setResetting}
            endpoint={endpoint}
            section={
              resetting
                ? 'data'
                : navigation.view.kind === 'settings'
                  ? navigation.view.section
                  : lastSection.current
            }
            onSection={openSettings}
            onReturn={() => returnToWork(navigation.workView)}
            theme={theme}
            setTheme={setTheme}
            panels={panels}
            shared={shared}
          />
        </div>
      </main>
      <Dialog
        open={help}
        onOpenChange={setHelp}
        title="도움말"
        description={`${brand.displayName} 안내와 지원 링크입니다.`}
      >
        <Stack>
          {Object.entries(brand.links).map(([key, href]) => (
            <Link key={key} href={href}>
              {({ home: '홈페이지', docs: '문서', support: '지원' } as Record<string, string>)[key]}
            </Link>
          ))}
        </Stack>
      </Dialog>
    </div>
  );
}
export function App({
  core: suppliedCore,
  dataClient: suppliedDataClient,
  endpoint: suppliedEndpoint = '견본 환경',
}: {
  core?: WorknaruCore;
  dataClient?: DataClient | undefined;
  endpoint?: string;
}) {
  const [loaded, setLoaded] = useState<Awaited<ReturnType<typeof loadCore>> | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (suppliedCore) return;
    let stopped = false;
    setError('');
    void loadCore()
      .then((value) => {
        if (!stopped) setLoaded(value);
      })
      .catch(() => {
        if (!stopped)
          setError(
            '접속 설정을 불러오지 못했습니다. 개발 환경을 시작한 뒤 표시된 Web 주소로 접속해 주세요.',
          );
      });
    return () => {
      stopped = true;
    };
  }, [suppliedCore, attempt]);
  const connection = suppliedCore
    ? {
        core: suppliedCore,
        dataClient: suppliedDataClient,
        endpoint: suppliedEndpoint,
        storagePrefix: 'worknaru.ui',
        identity: `${suppliedEndpoint}:${suppliedIdentity(suppliedCore)}`,
      }
    : loaded;
  if (connection)
    return (
      <ConnectedApp
        key={connection.identity}
        core={connection.core}
        endpoint={connection.endpoint}
        dataClient={connection.dataClient}
        storagePrefix={connection.storagePrefix}
      />
    );
  return (
    <main className={styles.start}>
      {error ? (
        <EmptyState
          title="연결을 준비해 주세요"
          action={<Button onClick={() => setAttempt((value) => value + 1)}>다시 연결</Button>}
        >
          {error}
        </EmptyState>
      ) : (
        <Loading>접속 정보를 준비하고 있습니다…</Loading>
      )}
    </main>
  );
}
