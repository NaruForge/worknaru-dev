import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { Button, Dialog, IconButton, TextField } from '@worknaru/ui';
import { mergeHistory } from '../features/agents/agentState.js';

it('default actions do not accidentally submit a surrounding form', () => {
  const submit = vi.fn((event) => event.preventDefault());
  render(
    <form onSubmit={submit}>
      <Button>보조 작업</Button>
      <Button type="submit">저장</Button>
      <IconButton icon="info" label="도움말" />
    </form>,
  );
  fireEvent.click(screen.getByRole('button', { name: '보조 작업' }));
  fireEvent.click(screen.getByRole('button', { name: '도움말' }));
  expect(submit).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: '저장' }));
  expect(submit).toHaveBeenCalledTimes(1);
});
it('field labels, hints and errors refer to the same input', () => {
  render(<TextField label="이름" hint="표시할 이름" error="이름을 입력하세요" />);
  const input = screen.getByLabelText('이름');
  expect(input.getAttribute('aria-invalid')).toBe('true');
  const descriptions = input
    .getAttribute('aria-describedby')!
    .split(' ')
    .map((id) => document.getElementById(id)?.textContent);
  expect(descriptions).toEqual(['표시할 이름', '이름을 입력하세요']);
});
it('a busy dialog cannot be closed by its close control or Escape', () => {
  const change = vi.fn();
  render(
    <Dialog
      open
      busy
      onOpenChange={change}
      title="처리 확인"
      description="완료될 때까지 기다려 주세요."
    >
      <p>처리 중</p>
    </Dialog>,
  );
  fireEvent.click(screen.getByRole('button', { name: '창 닫기' }));
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(change).not.toHaveBeenCalled();
});
it('history merges older pages without joining different epochs or missing sequence gaps', () => {
  const entry = (seq: number) => ({
    seq,
    turnId: 'turn',
    type: 'assistant_message',
    text: String(seq),
    messageId: null,
  });
  const previous = { epoch: 'one', cursor: 'older', entries: [entry(3), entry(4)] };
  expect(
    mergeHistory(
      previous,
      { epoch: 'one', cursor: null, entries: [entry(1), entry(2)] },
      true,
    ).entries.map((value) => value.seq),
  ).toEqual([1, 2, 3, 4]);
  expect(
    mergeHistory(previous, { epoch: 'two', cursor: null, entries: [entry(1)] }).entries.map(
      (value) => value.seq,
    ),
  ).toEqual([1]);
  expect(
    mergeHistory(previous, { epoch: 'one', cursor: 'gap', entries: [entry(9)] }).entries.map(
      (value) => value.seq,
    ),
  ).toEqual([9]);
});
