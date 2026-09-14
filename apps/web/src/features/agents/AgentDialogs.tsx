import { useEffect, useRef, useState } from 'react';
import type { Agent, AgentOptions, ArchivePreview, WorknaruCore } from '@worknaru/core';
import {
  Alert,
  Button,
  ConfirmDialog,
  Dialog,
  Inline,
  Loading,
  Select,
  Stack,
  TextField,
} from '@worknaru/ui';
import { messageOf } from './agentState.js';

export function CreateAgentDialog({
  open,
  core,
  onClose,
  onCreated,
  focusAfterCreate,
}: {
  open: boolean;
  core: WorknaruCore;
  onClose: () => void;
  onCreated: (agent: Agent) => void;
  focusAfterCreate: () => HTMLElement | null;
}) {
  const created = useRef(false);
  const [id] = useState(() => crypto.randomUUID());
  const [options, setOptions] = useState<AgentOptions | null>(null);
  const [name, setName] = useState('새 Agent');
  const [cwd, setCwd] = useState('');
  const [model, setModel] = useState('');
  const [paths, setPaths] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const guard = useRef(false);
  useEffect(() => {
    let stopped = false;
    setOptions(null);
    setModel('');
    setPaths([]);
    setError('');
    if (!cwd.trim()) return;
    const timer = setTimeout(() => {
      void core.agents
        .directories({ query: cwd })
        .then((value) => {
          if (!stopped) setPaths(value.paths);
        })
        .catch(() => {});
      void core.agents
        .options({ cwd })
        .then((value) => {
          if (stopped) return;
          setOptions(value);
          setModel(value.models.find((item) => item.default)?.id ?? value.models[0]?.id ?? '');
          if (!value.available)
            setError('Codex 모델을 불러올 수 없습니다. 로그인 상태를 확인해 주세요.');
        })
        .catch((error) => {
          if (!stopped) setError(messageOf(error));
        });
    }, 350);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [core, cwd]);
  return (
    <Dialog
      open={open}
      onOpenChange={onClose}
      title="새 Agent 만들기"
      description="Agent는 선택한 폴더에서 작업을 돕는 AI입니다. 이름, 작업 폴더와 모델을 선택하세요."
      busy={busy}
      returnFocus={() => (created.current ? focusAfterCreate() : null)}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (guard.current || !options?.available) return;
          guard.current = true;
          setBusy(true);
          setError('');
          void core.agents
            .create({ id, name, cwd, model })
            .then((agent) => {
              created.current = true;
              onCreated(agent);
            })
            .catch((e) => setError(messageOf(e)))
            .finally(() => {
              guard.current = false;
              setBusy(false);
            });
        }}
      >
        <Stack>
          <TextField
            label="이름"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
            maxLength={120}
            disabled={busy}
          />
          <TextField
            label="작업 폴더"
            hint="Daemon이 실행되는 컴퓨터의 폴더입니다. 경로를 직접 입력할 수도 있습니다."
            value={cwd}
            onChange={(event) => {
              setOptions(null);
              setModel('');
              setCwd(event.target.value);
            }}
            list="directory-suggestions"
            autoComplete="off"
            required
            disabled={busy}
          />
          <datalist id="directory-suggestions">
            {paths.map((path) => (
              <option key={path} value={path} />
            ))}
          </datalist>
          <Select
            label="모델"
            value={model}
            onChange={(event) => setModel(event.target.value)}
            disabled={busy || !options}
            required
          >
            {options ? (
              options.models.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))
            ) : (
              <option value="">
                {cwd ? '모델 불러오는 중…' : '작업 폴더를 먼저 입력해 주세요'}
              </option>
            )}
          </Select>
          {error && <Alert tone="error">{error}</Alert>}
          <Inline align="end">
            <Button variant="secondary" disabled={busy} onClick={onClose}>
              취소
            </Button>
            <Button type="submit" disabled={busy || !options?.available || !model}>
              {busy ? '만드는 중…' : '만들기'}
            </Button>
          </Inline>
        </Stack>
      </form>
    </Dialog>
  );
}

export function ArchiveAgentDialog({
  open,
  core,
  agent,
  onClose,
  onBusy,
  onArchived,
  focusAfterArchive,
}: {
  open: boolean;
  core: WorknaruCore;
  agent: Agent;
  onClose: () => void;
  onBusy: (value: boolean) => void;
  onArchived: () => void;
  focusAfterArchive: () => HTMLElement | null;
}) {
  const archived = useRef(false);
  const [preview, setPreview] = useState<ArchivePreview | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const guard = useRef(false);
  useEffect(() => {
    let stopped = false;
    setPreview(null);
    setError('');
    void core.agents
      .archivePreview({ agent: agent.id })
      .then((value) => {
        if (!stopped) setPreview(value);
      })
      .catch((e) => {
        if (!stopped) setError(messageOf(e));
      });
    return () => {
      stopped = true;
    };
  }, [core, agent.id, revision]);
  async function archive() {
    if (!preview || guard.current) return;
    guard.current = true;
    setBusy(true);
    onBusy(true);
    setError('');
    try {
      const result = await core.agents.archive({ token: preview.token });
      if (result.failed.length) {
        setError(
          `일부 Agent의 보관을 확인하지 못했습니다: ${result.failed.join(', ')}. 대상을 다시 확인해 주세요.`,
        );
        setPreview(null);
      } else {
        archived.current = true;
        onArchived();
      }
    } catch (e) {
      setError(messageOf(e));
      setPreview(null);
    } finally {
      guard.current = false;
      setBusy(false);
      onBusy(false);
    }
  }
  return (
    <Dialog
      open={open}
      onOpenChange={onClose}
      title="Agent 보관"
      description="진행 중인 작업을 중단하고 대기 메시지를 취소합니다. 대화 기록과 작업 폴더의 파일은 남습니다."
      busy={busy}
      returnFocus={() => (archived.current ? focusAfterArchive() : null)}
    >
      <Stack>
        {preview ? (
          <>
            <ul>
              {preview.agents.map((item) => (
                <li key={item.id}>
                  {item.name} ·{' '}
                  {item.turnId
                    ? '진행 중인 작업 중단'
                    : item.archivedAt
                      ? '이미 보관됨'
                      : '보관 예정'}
                </li>
              ))}
            </ul>
            <p>취소할 대기 메시지: {preview.queued.length}개</p>
          </>
        ) : (
          !error && <Loading>보관 대상을 확인하고 있습니다…</Loading>
        )}
        {error && (
          <>
            <Alert tone="error">{error}</Alert>
            <Button variant="secondary" onClick={() => setRevision((value) => value + 1)}>
              보관 대상 다시 확인
            </Button>
          </>
        )}
        <Inline align="end">
          <Button variant="secondary" disabled={busy} onClick={onClose}>
            취소
          </Button>
          <Button variant="danger" disabled={!preview || busy} onClick={() => void archive()}>
            {busy ? '보관 중…' : '확인하고 보관'}
          </Button>
        </Inline>
      </Stack>
    </Dialog>
  );
}

export function DiscardDialog({
  open,
  busy,
  error,
  onClose,
  onConfirm,
}: {
  open: boolean;
  busy: boolean;
  error: string;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onClose}
      title="실행 포기"
      description="대화와 작업 파일을 확인하셨나요? 이 요청을 취소 처리합니다. 재전송하거나 완료로 간주하지 않습니다."
      busy={busy}
      confirmLabel="기록 확인 후 실행 포기"
      onConfirm={onConfirm}
    >
      {error && <Alert tone="error">{error}</Alert>}
    </ConfirmDialog>
  );
}
