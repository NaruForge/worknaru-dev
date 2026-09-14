import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { DataSettings } from './DataSettings.js';
import { DataManagementError } from './dataClient.js';
import { createDataFixture } from '../testing/dataFixture.js';

it('loads storage, disables missing paths and only opens the selected known item', async () => {
  const client = createDataFixture();
  const open = vi.spyOn(client, 'open');
  render(<DataSettings client={client} active />);
  const button = await screen.findByRole('button', { name: '메시지·대기열 DB 폴더 열기' });
  await waitFor(() => expect(button.hasAttribute('disabled')).toBe(false));
  fireEvent.click(button);
  await waitFor(() => expect(open).toHaveBeenCalledWith('db'));
  expect(screen.getByRole('button', { name: '임시 파일 폴더 열기' }).hasAttribute('disabled')).toBe(
    true,
  );
});
it('does not reset on preview/cancel and submits once after explicit confirmation', async () => {
  const client = createDataFixture();
  const reset = vi.spyOn(client, 'reset');
  const rendered = render(<DataSettings client={client} active />);
  fireEvent.click(await screen.findByRole('button', { name: '초기화 대상 확인' }));
  await screen.findByRole('dialog');
  expect(reset).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: '취소' }));
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(reset).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: '초기화 대상 확인' }));
  const confirm = await screen.findByRole('button', { name: '삭제하고 다시 시작' });
  fireEvent.click(confirm);
  fireEvent.click(confirm);
  await waitFor(() => expect(reset).toHaveBeenCalledTimes(1));
  expect(reset.mock.calls[0]?.[0]).toBe('fixture-preview');
  rendered.unmount();
});
it('keeps rejected preview usable and does not mistake a rejection for restarting', async () => {
  const client = createDataFixture();
  vi.spyOn(client, 'reset').mockRejectedValue(new DataManagementError('미리보기가 만료됐습니다.'));
  render(<DataSettings client={client} active />);
  fireEvent.click(await screen.findByRole('button', { name: '초기화 대상 확인' }));
  fireEvent.click(await screen.findByRole('button', { name: '삭제하고 다시 시작' }));
  await screen.findByText('미리보기가 만료됐습니다.');
  expect(screen.getByRole('button', { name: '초기화 대상 확인' })).toBeTruthy();
});
it('never retries a reset when its acknowledgement is lost', async () => {
  const client = createDataFixture();
  const reset = vi.spyOn(client, 'reset').mockRejectedValue(Error('Disconnected'));
  const restarted = vi.spyOn(client, 'restarted');
  const rendered = render(<DataSettings client={client} active />);
  fireEvent.click(await screen.findByRole('button', { name: '초기화 대상 확인' }));
  fireEvent.click(await screen.findByRole('button', { name: '삭제하고 다시 시작' }));
  await screen.findByText(
    '요청 응답이 끊겼습니다. 같은 요청의 재시작 완료 여부를 확인하고 있습니다.',
  );
  await waitFor(() => expect(restarted).toHaveBeenCalled());
  expect(reset).toHaveBeenCalledTimes(1);
  rendered.unmount();
});
it('reports blockers without offering confirmation', async () => {
  render(<DataSettings client={createDataFixture('blocked')} active />);
  fireEvent.click(await screen.findByRole('button', { name: '초기화 대상 확인' }));
  await screen.findByText('다른 작업이 진행 중입니다. 작업이 끝난 뒤 다시 확인해 주세요.');
  expect(screen.queryByRole('dialog')).toBeNull();
});
