import { afterEach, expect, it, vi } from 'vitest';
import { createDataClient, DataManagementError } from './dataClient.js';

const state = vi.hoisted(() => ({ serverId: 'original', invoke: vi.fn() }));
vi.mock('@getpaseo/client/internal/daemon-client', () => ({
  DaemonClient: class {
    async connect() {}
    getLastServerInfoMessage() {
      return { serverId: state.serverId, version: '0.8.0' };
    }
    invokePluginRpc(...args: unknown[]) {
      return state.invoke(...args);
    }
    async close() {}
  },
}));
afterEach(() => {
  state.serverId = 'original';
  state.invoke.mockReset();
  vi.unstubAllGlobals();
});
it('does not dispatch a management request to a replacement daemon', async () => {
  state.serverId = 'different';
  await expect(
    createDataClient('ws://localhost/ws', 'original').reset('token', 'id'),
  ).rejects.toBeInstanceOf(DataManagementError);
  expect(state.invoke).not.toHaveBeenCalled();
});
it('distinguishes an explicit rejection from an uncertain relay result', async () => {
  const client = createDataClient('ws://localhost/ws', 'original');
  state.invoke.mockResolvedValue({
    ok: false,
    error: { code: 'preview_expired', message: 'Expired' },
  });
  await expect(client.reset('token', 'id')).rejects.toBeInstanceOf(DataManagementError);
  state.invoke.mockResolvedValue({
    ok: false,
    error: { code: 'management_unavailable', message: 'Timeout' },
  });
  const error = await client.reset('token', 'id').then(
    () => null,
    (error) => error,
  );
  expect(error).toBeInstanceOf(Error);
  expect(error).not.toBeInstanceOf(DataManagementError);
});
it('only confirms the matching completed request on a new server identity', async () => {
  const client = createDataClient('ws://localhost/ws', 'original');
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  for (const [completedResetId, expectedServerId, expected] of [
    ['different', 'new', false],
    ['requested', 'original', false],
    ['requested', 'new', true],
  ] as const) {
    fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ targetId: 'worknaru-dev', completedResetId, expectedServerId }),
    });
    expect(await client.restarted('requested')).toBe(expected);
  }
  fetch.mockRejectedValue(Error('offline'));
  expect(await client.restarted('requested')).toBe(false);
});
