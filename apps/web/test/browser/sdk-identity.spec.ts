import { expect, test } from '@playwright/test';
import { createFixture } from '../../src/testing/fixture.js';

test('the production SDK blocks Workspace creation with a stale server ID', async ({ page }) => {
  let serverId = 'workspace-before-reset';
  const fixture = createFixture('empty');
  const sent: string[] = [];
  await page.route('**/connection.json', (route) =>
    route.fulfill({ json: { targetId: 'worknaru-dev', expectedServerId: serverId } }),
  );
  await page.routeWebSocket('**/ws', (socket) => {
    const identity = serverId;
    socket.onMessage(async (bytes) => {
      const envelope = JSON.parse(String(bytes));
      const send = (message: unknown) => socket.send(JSON.stringify({ type: 'session', message }));
      if (envelope.type === 'hello')
        send({
          type: 'status',
          payload: { status: 'server_info', serverId: identity, version: '0.8.0' },
        });
      else if (envelope.type === 'session') {
        const request = envelope.message;
        const { operation, input } = request.input;
        sent.push(`${identity}:${request.method}:${operation}`);
        const data =
          request.method === 'workspace.execute'
            ? await fixture.core.workspace[operation as keyof typeof fixture.core.workspace](
                input as never,
              )
            : await fixture.core.agents[operation as keyof typeof fixture.core.agents](
                input as never,
              );
        send({
          type: 'plugin.rpc.invoke.response',
          payload: { requestId: request.requestId, output: { ok: true, data } },
        });
      }
    });
  });
  await page.goto('/iframe.html?id=verification-connection--identity&viewMode=story');
  await page.getByRole('button', { name: 'Workspace', exact: true }).click();
  await page.getByRole('button', { name: 'Workspace 만들기', exact: true }).click();
  await page.getByLabel('Workspace 이름').fill('이전 환경의 입력');
  serverId = 'workspace-after-reset';
  const url = page.url();
  await page.getByRole('button', { name: '만들기', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('새로고침');
  await expect(page.getByLabel('Workspace 이름')).toHaveValue('이전 환경의 입력');
  expect(page.url()).toBe(url);
  expect(sent.filter((value) => value.startsWith('workspace-after-reset:'))).toEqual([]);
});

test('the production SDK blocks stale sends until a manual identity refresh', async ({ page }) => {
  // Playwright gives this test its own context/localStorage. Only the server wire
  // is fixed; the story runs the real App/bootstrap/Core/Adapter/DaemonClient.
  type Phase = 'normal' | 'stale' | 'fresh';
  let phase: Phase = 'normal';
  let serverId = 'sdk-server-old';
  let fixture = createFixture('empty');
  const rpc: Record<Phase, string[]> = { normal: [], stale: [], fresh: [] };
  const handshakes: Record<Phase, number> = { normal: 0, stale: 0, fresh: 0 };
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/connection.json', (route) =>
    route.fulfill({
      json: { targetId: 'worknaru-dev', expectedServerId: serverId },
    }),
  );
  await page.routeWebSocket('**/ws', (socket) => {
    const connectedPhase = phase;
    const identity = serverId;
    socket.onMessage(async (bytes) => {
      const envelope = JSON.parse(String(bytes));
      const send = (message: unknown) => socket.send(JSON.stringify({ type: 'session', message }));
      if (envelope.type === 'hello') {
        handshakes[connectedPhase]++;
        send({
          type: 'status',
          payload: { status: 'server_info', serverId: identity, version: '0.8.0' },
        });
      } else if (envelope.type === 'session') {
        const request = envelope.message;
        expect(request.type).toBe('plugin.rpc.invoke.request');
        expect(request.pluginId).toBe('worknaru-agent-service');
        expect(request.method).toBe('agents.execute');
        const operation = request.input.operation as keyof typeof fixture.core.agents;
        rpc[connectedPhase].push(operation);
        const data = await fixture.core.agents[operation](request.input.input as never);
        send({
          type: 'plugin.rpc.invoke.response',
          payload: { requestId: request.requestId, output: { ok: true, data } },
        });
      }
    });
  });
  await page.goto('/iframe.html?id=verification-connection--identity&viewMode=story');
  await page.getByRole('button', { name: '새 Agent', exact: true }).click();
  await page.getByLabel('이름', { exact: true }).fill('SDK identity fixture');
  await page.getByLabel('작업 폴더', { exact: true }).fill('C:\\Fixture');
  await page.getByRole('button', { name: '만들기', exact: true }).click();
  const message = page.getByLabel('메시지', { exact: true });
  await message.fill('정상 서버 전송');
  await page.getByRole('button', { name: '보내기', exact: true }).click();
  await expect(
    page.getByText('요청을 확인했습니다: 정상 서버 전송', { exact: true }),
  ).toBeVisible();
  expect(rpc.normal.filter((op) => op === 'create')).toHaveLength(1);
  expect(rpc.normal.filter((op) => op === 'send')).toHaveLength(1);
  await page.getByRole('button', { name: '설정', exact: true }).click();
  await page.getByLabel('화면 테마').selectOption('dark');
  await page.getByRole('button', { name: '작업으로 돌아가기' }).click();
  await message.fill('새 환경으로 보내면 안 되는 초안');
  await page.evaluate(() =>
    localStorage.setItem(
      'worknaru.ui.server.sdk-server-old.layout.v1',
      JSON.stringify({
        sidebarWidth: 410,
        detailsWidth: 430,
        sidebarCollapsed: true,
        detailsOpen: true,
      }),
    ),
  );
  const priorUrl = page.url();
  // Stop interval polling so the error and new handshake below belong to the
  // clicked Send, then advance polling explicitly to check automatic retry.
  await page.clock.install();
  await page.clock.pauseAt(new Date());
  phase = 'stale';
  serverId = 'sdk-server-new';
  fixture = createFixture('empty');
  const send = page.getByRole('button', { name: '보내기', exact: true });
  await send.click();
  await expect(page.getByRole('alert').filter({ hasText: '새로고침' }).first()).toBeVisible();
  await expect(send).toBeEnabled();
  expect(handshakes.stale).toBeGreaterThan(0);
  await page.clock.runFor(3100);
  expect(rpc.stale).toEqual([]);
  expect(page.url()).toBe(priorUrl);
  await expect(message).toHaveValue('새 환경으로 보내면 안 되는 초안');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  phase = 'fresh';
  await page.reload();
  await expect(page).toHaveURL(/#\/agents\?list=active$/);
  await expect(page.getByRole('button', { name: '새 Agent', exact: true })).toBeVisible();
  await expect(page.getByLabel('메시지', { exact: true })).toHaveCount(0);
  expect(
    await page.evaluate(() =>
      Object.keys(localStorage).filter((key) =>
        key.startsWith('worknaru.ui.server.sdk-server-old.'),
      ),
    ),
  ).toEqual([]);
  expect(
    await page.evaluate(() =>
      JSON.parse(localStorage.getItem('worknaru.ui.server.sdk-server-new.layout.v1')!),
    ),
  ).toEqual({
    sidebarWidth: null,
    detailsWidth: null,
    sidebarCollapsed: false,
    detailsOpen: false,
  });
  await page.getByRole('button', { name: '설정', exact: true }).click();
  await expect(page.getByLabel('화면 테마')).toHaveValue('system');
  expect(rpc.fresh).toContain('list');
  expect(rpc.fresh.filter((op) => op === 'create' || op === 'send')).toEqual([]);
  expect(errors).toEqual([]);
});
