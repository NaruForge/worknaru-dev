import { useEffect, useState } from 'react';
import { brand } from '@worknaru/branding';
import type { DaemonStatus, WorknaruCore } from '@worknaru/core';
import {
  Alert,
  Badge,
  Button,
  Dialog,
  EmptyState,
  Inline,
  Link,
  Loading,
  Menu,
  Stack,
} from '@worknaru/ui';
import { loadCore } from '../bootstrap.js';
import { AgentScreen } from '../features/agents/AgentScreen.js';
import { useTheme } from './theme.js';
import styles from './shell.module.css';

const failures: Record<NonNullable<DaemonStatus['failure']>['code'], string> = {
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
export function App({
  core: suppliedCore,
  endpoint: suppliedEndpoint = '견본 환경',
}: {
  core?: WorknaruCore;
  endpoint?: string;
}) {
  const [connection, setConnection] = useState<{
    core: WorknaruCore;
    endpoint: string;
  } | null>(() => (suppliedCore ? { core: suppliedCore, endpoint: suppliedEndpoint } : null));
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [connectionOpen, setConnectionOpen] = useState(false);
  const [status, setStatus] = useState<DaemonStatus | null>(null);
  const [checking, setChecking] = useState(false);
  const { theme, setTheme } = useTheme();
  useEffect(() => {
    if (suppliedCore) return;
    let stopped = false;
    setError('');
    void loadCore()
      .then((value) => {
        if (!stopped) setConnection(value);
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
  async function check() {
    if (!connection || checking) return;
    setChecking(true);
    setStatus(null);
    try {
      setStatus(await connection.core.getDaemonStatus());
    } catch {
      setError('연결 상태를 확인하지 못했습니다. 다시 시도해 주세요.');
    } finally {
      setChecking(false);
    }
  }
  const links = (
    <Inline>
      {Object.entries(brand.links).map(([key, href]) => (
        <Link key={key} href={href}>
          {({ home: '홈페이지', docs: '문서', support: '지원' } as Record<string, string>)[key]}
        </Link>
      ))}
    </Inline>
  );
  return (
    <div className={styles.app}>
      <header className={styles.header}>
        <Inline>
          {brand.logo && <img className={styles.logo} src={`./${brand.logo}`} alt="" />}
          <strong>{brand.displayName}</strong>
          <Badge>개발 환경</Badge>
        </Inline>
        <Inline>
          <Menu
            label={`화면: ${theme === 'system' ? '시스템' : theme === 'light' ? '밝게' : '어둡게'}`}
            items={[
              { label: '시스템 설정', onSelect: () => setTheme('system') },
              { label: '밝게', onSelect: () => setTheme('light') },
              { label: '어둡게', onSelect: () => setTheme('dark') },
            ]}
          />
          <Button variant="ghost" onClick={() => setConnectionOpen(true)}>
            연결 확인
          </Button>
        </Inline>
      </header>
      {connection ? (
        <AgentScreen core={connection.core} footer={links} />
      ) : error ? (
        <main className={styles.start}>
          <EmptyState
            title="연결을 준비해 주세요"
            action={<Button onClick={() => setAttempt((value) => value + 1)}>다시 연결</Button>}
          >
            {error}
          </EmptyState>
        </main>
      ) : (
        <main className={styles.start}>
          <Loading>접속 정보를 준비하고 있습니다…</Loading>
        </main>
      )}
      <Dialog
        open={connectionOpen}
        onOpenChange={setConnectionOpen}
        title="Daemon 연결 확인"
        description="Agent를 실행하는 서버의 연결 상태를 확인합니다."
      >
        <Stack>
          {checking ? (
            <Loading>Daemon의 응답을 기다리고 있습니다…</Loading>
          ) : status ? (
            <Alert tone={status.outcome === 'available' ? 'success' : 'error'}>
              {status.outcome === 'available'
                ? '전용 Daemon이 정상적으로 응답했습니다.'
                : failures[status.failure.code]}
            </Alert>
          ) : (
            <p>상태 확인을 눌러 연결을 확인해 주세요.</p>
          )}
          {error && <Alert tone="error">{error}</Alert>}
          <dl className={styles.connection}>
            <dt>접속 주소</dt>
            <dd>{connection?.endpoint ?? '—'}</dd>
            <dt>서버 ID</dt>
            <dd id="server-id">{status?.server?.id ?? '—'}</dd>
            <dt>Paseo 버전</dt>
            <dd>{status?.server?.version ?? '—'}</dd>
            <dt>확인 시각</dt>
            <dd>{status ? new Date(status.checkedAt).toLocaleTimeString('ko-KR') : '—'}</dd>
          </dl>
          <Button disabled={!connection || checking} onClick={() => void check()}>
            상태 확인
          </Button>
        </Stack>
      </Dialog>
    </div>
  );
}
