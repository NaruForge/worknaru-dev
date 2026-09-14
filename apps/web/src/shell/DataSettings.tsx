import { useEffect, useRef, useState } from 'react';
import { Alert, Badge, Button, ConfirmDialog, Inline, Loading, Stack } from '@worknaru/ui';
import {
  DataManagementError,
  type DataClient,
  type DataSnapshot,
  type ResetPreview,
} from './dataClient.js';
import styles from './shell.module.css';

export function DataSettings({
  client,
  active,
  onResetting,
}: {
  client?: DataClient | undefined;
  active: boolean;
  onResetting?: (resetting: boolean) => void;
}) {
  const [snapshot, setSnapshot] = useState<DataSnapshot | null>(null);
  const [preview, setPreview] = useState<ResetPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [resetId, setResetId] = useState<string | null>(null);
  const [waiting, setWaiting] = useState(false);
  const [checking, setChecking] = useState(false);
  useEffect(() => {
    onResetting?.(!!resetId);
  }, [resetId, onResetting]);
  const guard = useRef(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  async function perform(action: () => Promise<void>) {
    if (guard.current) return;
    guard.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await action();
    } catch (value) {
      if (alive.current)
        setError(
          value instanceof Error
            ? value.message
            : '요청을 완료하지 못했습니다. 다시 확인해 주세요.',
        );
    } finally {
      guard.current = false;
      if (alive.current) setBusy(false);
    }
  }
  useEffect(() => {
    if (!active || !client || snapshot || resetId) return;
    let canceled = false;
    setBusy(true);
    setError('');
    void client
      .snapshot()
      .then((value) => {
        if (!canceled) setSnapshot(value);
      })
      .catch(() => {
        if (!canceled)
          setError(
            '저장 위치를 조회하지 못했습니다. 관리형 dev start 환경과 연결 상태를 확인해 주세요.',
          );
      })
      .finally(() => {
        if (!canceled) setBusy(false);
      });
    return () => {
      canceled = true;
    };
  }, [active, client, snapshot, resetId]);
  useEffect(() => {
    if (!resetId || !waiting || !client) return;
    let canceled = false;
    let timer: ReturnType<typeof setTimeout>;
    const deadline = Date.now() + 120000;
    async function poll() {
      const ready = await client!.restarted(resetId!);
      if (canceled) return;
      if (ready) {
        client!.reload();
        return;
      }
      if (Date.now() >= deadline) {
        setWaiting(false);
        setError(
          '재시작 완료를 확인하지 못했습니다. 초기화가 실패했거나 아직 진행 중일 수 있습니다. 같은 초기화를 다시 요청하지 말고 실행 상태를 확인해 주세요.',
        );
      } else timer = setTimeout(() => void poll(), 1500);
    }
    void poll();
    return () => {
      canceled = true;
      clearTimeout(timer);
    };
  }, [client, resetId, waiting]);
  async function reset() {
    if (!client || !preview?.token || guard.current) return;
    const token = preview.token;
    const id = crypto.randomUUID();
    setPreview(null);
    await perform(async () => {
      // Even a lost acknowledgement may have stopped the Daemon. Never auto-resubmit.
      setResetId(id);
      setWaiting(true);
      try {
        await client.reset(token, id);
      } catch (value) {
        if (value instanceof DataManagementError) {
          setResetId(null);
          setWaiting(false);
          throw value;
        }
        if (alive.current)
          setNotice('요청 응답이 끊겼습니다. 같은 요청의 재시작 완료 여부를 확인하고 있습니다.');
      }
    });
  }
  return (
    <Stack>
      <h2>데이터 관리</h2>
      <p>현재 실행 환경의 저장 위치와 초기화 범위를 확인합니다.</p>
      {!client && (
        <Alert tone="warning">
          이 연결에서는 데이터 관리를 사용할 수 없습니다. Agent 설정을 마친 관리형 dev start
          환경에서 접속해 주세요.
        </Alert>
      )}
      {error && <Alert tone="error">{error}</Alert>}
      {notice && <Alert tone="neutral">{notice}</Alert>}
      {resetId ? (
        <Stack>
          {waiting ? (
            <Loading>
              실행 환경을 종료하고 데이터를 초기화한 뒤 다시 시작하고 있습니다. 준비되면 화면을 새로
              불러옵니다…
            </Loading>
          ) : (
            <Button
              disabled={checking}
              onClick={() => {
                setChecking(true);
                void client
                  ?.restarted(resetId)
                  .then((ready) => {
                    if (ready) client.reload();
                    else
                      setError(
                        '아직 이 요청의 완료를 확인하지 못했습니다. 실행 PC에서 doctor로 확인해 주세요.',
                      );
                  })
                  .finally(() => setChecking(false));
              }}
            >
              재시작 결과 다시 확인
            </Button>
          )}
          <p>
            확인 중에는 이 탭을 유지해 주세요. 실패한 경우 실행 PC의 제품 폴더에서 같은 데이터
            루트를 지정하고 진단합니다.
          </p>
          <code className={styles.dataPath}>pnpm exec worknaru doctor</code>
          <p>
            진단 결과에 따라 dev stop → dev reset --dry-run → dev reset --yes → agent setup → dev
            start 순서로 복구할 수 있습니다.
          </p>
          {snapshot && <code className={styles.dataPath}>{snapshot.dataRoot}</code>}
        </Stack>
      ) : (
        client && (
          <>
            <Inline>
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() =>
                  void perform(async () => {
                    const value = await client.snapshot();
                    if (alive.current) {
                      setSnapshot(value);
                      setPreview(null);
                    }
                  })
                }
              >
                저장 위치 새로고침
              </Button>
            </Inline>
            {busy && !snapshot && <Loading>저장 위치를 확인하고 있습니다…</Loading>}
            {snapshot && (
              <>
                <dl className={styles.connection}>
                  <dt>실행 PC</dt>
                  <dd>{snapshot.host}</dd>
                  <dt>데이터 루트</dt>
                  <dd>{snapshot.dataRoot}</dd>
                  <dt>설정 출처</dt>
                  <dd>
                    {snapshot.source === 'default'
                      ? '기본값 (%LOCALAPPDATA%\\Worknaru-Dev)'
                      : 'WORKNARU_DATA_DIR'}
                  </dd>
                </dl>
                <p className={styles.muted}>
                  열기는 실행 PC의 탐색기를 엽니다. 다른 기기에서 접속했다면 폴더 창은 실행 PC에
                  나타납니다. 파일은 해당 파일의 상위 폴더를 엽니다.
                </p>
                {snapshot.projectsError && <Alert tone="warning">{snapshot.projectsError}</Alert>}
                {([true, false] as const).map((resettable) => (
                  <section key={String(resettable)} className={styles.dataGroup}>
                    <h3>
                      {resettable
                        ? '전용 실행 데이터 · 초기화 대상'
                        : '별도 저장 영역 · 초기화 시 보존'}
                    </h3>
                    {snapshot.items
                      .filter((item) => item.reset === resettable)
                      .map((item) => (
                        <article key={item.id} className={styles.dataRow}>
                          <div className={styles.dataDetails}>
                            <Inline>
                              <h4>{item.label}</h4>
                              <Badge tone={item.state === 'present' ? 'neutral' : 'warning'}>
                                {
                                  {
                                    present: '있음',
                                    missing: '아직 없음',
                                    unavailable: '확인 불가',
                                  }[item.state]
                                }
                              </Badge>
                            </Inline>
                            <code className={styles.dataPath}>{item.path}</code>
                            <p className={styles.muted}>
                              {item.manager} · {item.description}
                            </p>
                          </div>
                          <Button
                            variant="secondary"
                            size="small"
                            aria-label={`${item.label} 폴더 열기`}
                            disabled={busy || !item.canOpen}
                            onClick={() =>
                              void perform(async () => {
                                await client.open(item.id);
                                if (alive.current)
                                  setNotice(
                                    `${snapshot.host}의 탐색기에 폴더 열기를 요청했습니다.`,
                                  );
                              })
                            }
                          >
                            열기
                          </Button>
                        </article>
                      ))}
                  </section>
                ))}
                <section className={styles.dataGroup}>
                  <h3>브라우저 저장 상태</h3>
                  <p>
                    테마·패널 배치는 이 사이트의 Local Storage에 저장됩니다. 초안·대화 캐시·읽던
                    위치·미저장 설정은 현재 탭 메모리에 있습니다. 파일 탐색기로 열 수 없습니다.
                  </p>
                  <p>초기화 후 새 환경을 불러오면 이전 화면 선호와 임시 작업 상태를 정리합니다.</p>
                </section>
                <section className={styles.dataGroup}>
                  <h3>전용 데이터 전체 초기화</h3>
                  <p>
                    전용 설정·서버 ID·인증 키·Agent 등록·대기열·로그·관리 worktree·임시 파일을
                    삭제합니다. 실행 중인 Agent 작업도 종료합니다. 새 환경은 빈 상태로 다시
                    시작합니다.
                  </p>
                  <p>
                    외부 작업 프로젝트·제품 소스·개인 Paseo·Provider 로그인과 자체 기록은
                    보존합니다. 삭제한 전용 데이터는 되돌릴 수 없습니다.
                  </p>
                  <Button
                    variant="danger"
                    disabled={busy}
                    onClick={() =>
                      void perform(async () => {
                        const value = await client.preview();
                        if (alive.current) setPreview(value);
                      })
                    }
                  >
                    초기화 대상 확인
                  </Button>
                  {preview?.blockers.map((blocker) => (
                    <Alert key={blocker.code} tone="error">
                      {blocker.message}
                    </Alert>
                  ))}
                </section>
              </>
            )}
          </>
        )
      )}
      <ConfirmDialog
        open={active && !!preview?.token}
        onOpenChange={(open) => {
          if (!open) setPreview(null);
        }}
        title="전용 데이터를 초기화할까요?"
        description="실행 환경 종료 → 전용 데이터 삭제 → 새 환경 시작을 수행합니다. 모든 Agent 작업과 이 탭의 초안·미저장 설정이 사라집니다."
        confirmLabel="삭제하고 다시 시작"
        onConfirm={() => void reset()}
        busy={busy}
      >
        <p>삭제 대상 루트</p>
        <code className={styles.dataPath}>{preview?.dataRoot}</code>
        <div className={styles.resetItems}>
          <ul>
            {preview?.items.map((item) => (
              <li key={item}>
                <code className={styles.dataPath}>{item}</code>
              </li>
            ))}
          </ul>
        </div>
        <p>
          위 목록은 조회 시점의 항목입니다. 실행 전 다시 검사하며 루트 안에 이후 생성된 전용
          데이터도 삭제합니다.
        </p>
        <p>보존: 외부 작업 프로젝트, 제품 소스, 개인 Paseo·Provider 로그인과 자체 기록.</p>
      </ConfirmDialog>
    </Stack>
  );
}
