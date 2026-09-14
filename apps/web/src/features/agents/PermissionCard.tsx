import { useRef, useState } from 'react';
import type { Permission, WorknaruCore } from '@worknaru/core';
import { Alert, Button, Inline, Stack, TextField } from '@worknaru/ui';
import { messageOf } from './useAgents.js';
import styles from './agents.module.css';

export function PermissionCard({
  core,
  agentId,
  permission,
  onResponded,
}: {
  core: WorknaruCore;
  agentId: string;
  permission: Permission;
  onResponded: () => void;
}) {
  const form = useRef<HTMLFormElement>(null);
  const guard = useRef(false);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const questions = Array.isArray(permission.input.questions)
    ? (permission.input.questions as Record<string, unknown>[])
    : [];
  const actions = permission.actions.length
    ? permission.actions
    : [
        { id: '', label: '거부', behavior: 'deny' as const },
        {
          id: '',
          label: questions.length ? '답변 전송' : '이번 요청 승인',
          behavior: 'allow' as const,
        },
      ];
  return (
    <form ref={form} className={styles.permission} onSubmit={(event) => event.preventDefault()}>
      <Stack>
        <div>
          <h3>{permission.title || '응답이 필요합니다'}</h3>
          <p>{permission.description}</p>
        </div>
        {!questions.length && !!Object.keys(permission.input).length && (
          <pre>{JSON.stringify(permission.input, null, 2)}</pre>
        )}
        {questions.map((question, index) => {
          const id = `question-${permission.id}-${index}`;
          const header = String(question.header ?? '');
          return (
            <div key={id}>
              <TextField
                id={id}
                label={String(question.question ?? question.header ?? '답변')}
                value={answers[header] ?? ''}
                onChange={(event) => setAnswers({ ...answers, [header]: event.target.value })}
                required
                disabled={busy}
                list={`${id}-options`}
                hint={
                  question.multiSelect
                    ? '여러 답은 쉼표로 구분하거나 직접 입력하세요.'
                    : '추천 답변을 선택하거나 직접 입력하세요.'
                }
              />
              <datalist id={`${id}-options`}>
                {Array.isArray(question.options) &&
                  (question.options as Record<string, unknown>[]).map((option, i) => (
                    <option key={i} value={String(option.label)} />
                  ))}
              </datalist>
            </div>
          );
        })}
        {error && <Alert tone="error">{error}</Alert>}
        <Inline>
          {actions.map((action) => (
            <Button
              key={action.id || action.behavior}
              variant={action.behavior === 'deny' ? 'secondary' : 'primary'}
              disabled={busy}
              onClick={() => {
                if (
                  guard.current ||
                  (action.behavior === 'allow' && !form.current?.reportValidity())
                )
                  return;
                guard.current = true;
                setBusy(true);
                setError('');
                void core.agents
                  .permission({
                    agent: agentId,
                    id: permission.id,
                    behavior: action.behavior,
                    ...(action.id ? { actionId: action.id } : {}),
                    ...(questions.length && action.behavior === 'allow'
                      ? { answers: { answers } }
                      : {}),
                  })
                  .then(onResponded)
                  .catch((e) => setError(messageOf(e)))
                  .finally(() => {
                    guard.current = false;
                    setBusy(false);
                  });
              }}
            >
              {action.label}
            </Button>
          ))}
        </Inline>
      </Stack>
    </form>
  );
}
