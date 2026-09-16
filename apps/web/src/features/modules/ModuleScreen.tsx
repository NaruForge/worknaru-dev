import { useRef } from 'react';
import type { ModuleRun, ModuleTarget, WorknaruCore } from '@worknaru/core';
import {
  Alert,
  Badge,
  Button,
  EmptyState,
  Inline,
  Loading,
  Select,
  Stack,
  TextArea,
} from '@worknaru/ui';
import { initialModuleView, type ModuleView } from '../../shell/navigation.js';
import { targetKey, useModuleSession } from './useModuleSession.js';
import styles from './modules.module.css';

export const runStatus = {
  accepted: '접수됨',
  running: '실행 중',
  succeeded: '완료',
  failed: '실패',
  uncertain: '결과 미확정',
};
function RunDetail({ run }: { run: ModuleRun }) {
  return (
    <Stack>
      <Inline role="status">
        <Badge
          tone={
            run.status === 'succeeded' ? 'success' : run.status === 'failed' ? 'error' : 'neutral'
          }
        >
          {runStatus[run.status]}
        </Badge>
        <span>
          {run.moduleId} · {run.moduleVersion}
        </span>
      </Inline>
      {run.status === 'succeeded' && run.moduleId === 'text-stats' && (
        <dl className={styles.result}>
          <div>
            <dt>글자 수</dt>
            <dd>{String(run.result?.characters ?? '—')}</dd>
          </div>
          <div>
            <dt>줄 수</dt>
            <dd>{String(run.result?.lines ?? '—')}</dd>
          </div>
        </dl>
      )}
      {run.status === 'failed' && (
        <Alert tone="error">실행에 실패했습니다. 입력을 확인한 뒤 새로 실행할 수 있습니다.</Alert>
      )}
      {run.status === 'uncertain' && (
        <Alert tone="warning">
          실행이 중단되어 결과를 확정할 수 없습니다. 이 기록은 자동으로 다시 실행되지 않습니다.
        </Alert>
      )}
      {['accepted', 'running'].includes(run.status) && <Loading>실행 결과를 확인하는 중…</Loading>}
      <details>
        <summary>입력과 실행 정보</summary>
        <Stack>
          <pre className={styles.input}>
            {typeof run.input.text === 'string'
              ? run.input.text
              : JSON.stringify(run.input, null, 2)}
          </pre>
          <dl className={styles.metadata}>
            <dt>Run ID</dt>
            <dd>{run.id}</dd>
            <dt>생성 시각</dt>
            <dd>
              <time dateTime={run.createdAt}>{run.createdAt}</time>
            </dd>
          </dl>
        </Stack>
      </details>
    </Stack>
  );
}
export function ModuleScreen({
  core,
  active,
  view,
  onNavigate,
}: {
  core: WorknaruCore;
  active: boolean;
  view: ModuleView;
  onNavigate: (view: ModuleView) => void;
}) {
  const ui = useModuleSession(core, active, view, onNavigate);
  const resultHeading = useRef<HTMLHeadingElement>(null);
  const selected = ui.data?.selected;
  const available = ui.data?.modules.find(
    (module) => module.id === 'text-stats' && module.contexts.includes(view.target.type),
  );
  const choices = ui.choices;
  function select(value: string) {
    const [kind, id] = value.split(':');
    const target: ModuleTarget =
      kind === 'workspace'
        ? { type: 'workspace', workspaceId: id! }
        : kind === 'project'
          ? { type: 'project', projectId: id! }
          : { type: 'standalone' };
    onNavigate({ ...initialModuleView, target });
  }
  const targetExists =
    view.target.type === 'standalone' ||
    (view.target.type === 'workspace'
      ? choices?.workspaces.some(
          (item) => item.id === (view.target as { workspaceId: string }).workspaceId,
        )
      : choices?.projects.some(
          (item) => item.id === (view.target as { projectId: string }).projectId,
        ));
  return (
    <section className={styles.screen} aria-label="Module 작업">
      <header className={styles.heading}>
        <h1 tabIndex={-1}>Module</h1>
        <p>텍스트를 실행하고 기록을 다시 확인하세요.</p>
      </header>
      <div className={styles.content}>
        <Select
          label="실행 대상"
          value={targetKey(view.target)}
          onChange={(event) => select(event.target.value)}
        >
          <option value="standalone">독립 실행</option>
          {!targetExists && <option value={targetKey(view.target)}>선택한 대상 확인 필요</option>}
          {choices?.workspaces.map((workspace) => (
            <optgroup key={workspace.id} label={workspace.name}>
              <option value={`workspace:${workspace.id}`}>
                Workspace · {workspace.name} · {workspace.id}
              </option>
              {choices.projects
                .filter((project) => project.workspaceId === workspace.id)
                .map((project) => (
                  <option key={project.id} value={`project:${project.id}`}>
                    Project · {project.name} · {project.id}
                  </option>
                ))}
            </optgroup>
          ))}
        </Select>
        {ui.error && (
          <Alert tone="error">
            {ui.error}
            <Inline>
              <Button variant="secondary" onClick={ui.refresh}>
                다시 불러오기
              </Button>
              {view.runId && (
                <Button variant="ghost" onClick={() => onNavigate({ ...view, runId: null })}>
                  기록 선택 해제
                </Button>
              )}
            </Inline>
          </Alert>
        )}
        <div className={styles.columns}>
          <section aria-label="텍스트 통계 실행">
            <Stack>
              <h2>텍스트 통계</h2>
              <p className={styles.muted}>
                줄바꿈을 포함한 글자 수와 줄 수를 계산합니다. 빈 입력은 0글자·0줄입니다.
              </p>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  if (available || ui.draft.request) void ui.execute();
                }}
              >
                <Stack>
                  <TextArea
                    label="분석할 텍스트"
                    rows={8}
                    value={ui.draft.text}
                    disabled={!!ui.draft.request}
                    onChange={(event) => ui.setText(event.target.value)}
                    hint="최대 100,000 UTF-16 단위. 글자 수는 Unicode 코드 포인트 기준입니다."
                    error={ui.draft.text.length > 100000 ? '입력 길이를 줄여 주세요.' : ''}
                  />
                  {ui.draft.error && <Alert tone="error">{ui.draft.error}</Alert>}
                  {ui.draft.request && !ui.draft.busy && (
                    <Alert tone="warning">
                      접수 여부를 확인하지 못했습니다. 입력을 유지했습니다. 같은 요청으로 다시
                      확인하면 중복 실행을 막을 수 있습니다.
                    </Alert>
                  )}
                  <Inline>
                    <Button
                      type="submit"
                      disabled={
                        ui.draft.busy ||
                        ui.draft.text.length > 100000 ||
                        (!available && !ui.draft.request)
                      }
                    >
                      {ui.draft.busy
                        ? '응답 확인 중…'
                        : ui.draft.request
                          ? '같은 요청으로 다시 확인'
                          : '실행'}
                    </Button>
                  </Inline>
                  {!ui.loading && !ui.error && !available && (
                    <Alert>이 대상에서 텍스트 통계를 사용할 수 없습니다.</Alert>
                  )}
                </Stack>
              </form>
              <section aria-label="실행 결과">
                <Stack>
                  <h2 ref={resultHeading} tabIndex={-1}>
                    실행 결과
                  </h2>
                  {ui.loading ? (
                    <Loading>기록을 불러오는 중…</Loading>
                  ) : selected ? (
                    <RunDetail run={selected} />
                  ) : (
                    <p className={styles.muted}>
                      실행하거나 이전 기록을 선택하면 결과가 표시됩니다.
                    </p>
                  )}
                </Stack>
              </section>
            </Stack>
          </section>
          <section aria-label="이전 실행">
            <Stack>
              <Inline align="between">
                <h2>이전 실행</h2>
                <Button size="small" variant="ghost" disabled={ui.loading} onClick={ui.refresh}>
                  기록 새로고침
                </Button>
              </Inline>
              {ui.loading && <Loading>실행 기록을 불러오는 중…</Loading>}
              {!ui.loading && !ui.error && !ui.data?.runs.length && (
                <EmptyState title="아직 실행 기록이 없습니다">
                  선택한 대상에서 첫 Module을 실행해 보세요.
                </EmptyState>
              )}
              <nav aria-label="Run 선택" className={styles.runs}>
                {ui.data?.runs
                  .slice()
                  .reverse()
                  .map((run) => (
                    <Button
                      key={run.id}
                      variant={view.runId === run.id ? 'secondary' : 'ghost'}
                      className={styles.run}
                      aria-current={view.runId === run.id ? 'page' : undefined}
                      onClick={() => {
                        onNavigate({ ...view, runId: run.id });
                        requestAnimationFrame(() => resultHeading.current?.focus());
                      }}
                    >
                      <span>
                        {run.moduleId} · {runStatus[run.status]}
                      </span>
                      <small>{run.createdAt}</small>
                      <small>{run.id}</small>
                    </Button>
                  ))}
              </nav>
            </Stack>
          </section>
        </div>
      </div>
    </section>
  );
}
