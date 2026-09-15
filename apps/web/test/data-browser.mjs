// Real Web/SDK/controller lifecycle, with no model lookup or Provider Agent creation.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { chromium, expect } from '@playwright/test';
import { root } from '../../../packages/dev-environment/paths.mjs';
import { testDirectory } from '../../../packages/dev-environment/testing.mjs';
import { portOpen } from '../../cli/local-support.mjs';
import { verificationEnvironment } from '../../cli/test/verification-environment.mjs';

assert.equal(process.platform, 'win32');
assert.equal(await portOpen(), false, 'Stop the managed environment before this isolated test.');
const directory = await testDirectory('data-browser');
const data = path.join(directory, 'data');
const project = path.join(directory, 'project');
await mkdir(project);
await writeFile(path.join(project, 'keep.txt'), 'External project survives.');
const env = {
  ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^WORKNARU_/i.test(key))),
  WORKNARU_DATA_DIR: data,
};
const verification = verificationEnvironment(env);
const exec = promisify(execFile);
const commands = [];
const cli = async (...args) => {
  commands.push(args);
  const value = await exec(
    process.execPath,
    [path.join(root, 'apps/cli/bin/worknaru.mjs'), ...args, '--json'],
    { cwd: root, env, windowsHide: true, timeout: 180000, maxBuffer: 4 * 1024 * 1024 },
  );
  return JSON.parse(value.stdout);
};
let browser;
const rpc = [];
const frames = [];
const errors = [];
const dialogs = [];
const lifecycle = [];
const observe = (page) => {
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('dialog', async (dialog) => {
    dialogs.push(dialog.type());
    await dialog.accept();
  });
  page.on('websocket', (socket) =>
    socket.on('framesent', ({ payload }) => {
      const envelope = JSON.parse(String(payload));
      if (envelope.type !== 'session') return;
      frames.push(envelope.message.type);
      if (envelope.message.type === 'plugin.rpc.invoke.request') {
        const { pluginId, method, input } = envelope.message;
        rpc.push({ pluginId, method, ...input });
      }
    }),
  );
};
const captureLifecycle = async (label) => {
  const log = await readFile(path.join(data, 'daemon.log'), 'utf8');
  await writeFile(path.join(directory, `daemon-${label}.log`), log);
  // Supporting log evidence, not a claim that log absence proves no processes.
  const launches = log.split(/\r?\n/).filter((line) => /provider\.[a-z-]+\.spawn/.test(line));
  assert.deepEqual(launches, []);
  const active = await cli('agent', 'list');
  const archived = await cli('agent', 'list', '--archived');
  assert.deepEqual(active, []);
  assert.deepEqual(archived, []);
  lifecycle.push({
    label,
    active: active.length,
    archived: archived.length,
    loggedProviderLaunches: launches.length,
  });
};
try {
  await verification.setup();
  await verification.start();
  assert.equal((await cli('doctor')).ok, true);
  browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  observe(page);
  await captureLifecycle('initial');
  await page.goto('http://127.0.0.1:6868/');
  await page.getByRole('button', { name: '설정', exact: true }).click();
  await page.getByRole('button', { name: '데이터 관리', exact: true }).click();
  await expect(page.getByRole('heading', { name: '데이터 관리', exact: true })).toBeVisible();
  await expect(page.getByText(data, { exact: true }).first()).toBeVisible({ timeout: 15000 });
  await expect(page.getByText('WORKNARU_DATA_DIR', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '전용 데이터 루트 폴더 열기' })).toBeEnabled();
  await page.screenshot({ path: path.join(directory, 'data-desktop.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: path.join(directory, 'data-mobile.png') });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole('button', { name: '화면', exact: true }).click();
  await page.getByLabel('화면 테마').selectOption('dark');
  // Change the real panel control so in-memory and stored preferences agree.
  const separator = page.getByRole('separator').first();
  await separator.focus();
  await page.keyboard.press('ArrowRight');
  const oldId = (await readFile(path.join(data, 'server-id'), 'utf8')).trim();
  const oldPrefix = 'worknaru.ui.server.' + encodeURIComponent(oldId);
  const oldLayout = await page.evaluate(
    (prefix) => localStorage.getItem(prefix + '.layout.v1'),
    oldPrefix,
  );
  assert.notEqual(JSON.parse(oldLayout).sidebarWidth, null);
  await page.getByRole('button', { name: 'Agent 동작', exact: true }).click();
  await expect(page.getByLabel('기본 전송 방식')).toHaveValue('queue');
  await page.getByLabel('기본 전송 방식').selectOption('steer');
  await cli('settings', 'set', 'send-mode', 'queue');
  await expect(
    page.getByText('다른 화면에서 설정이 변경됐습니다. 편집 내용은 유지했습니다.', {
      exact: false,
    }),
  ).toBeVisible({ timeout: 15000 });
  await page.getByRole('button', { name: '저장', exact: true }).click();
  await expect(
    page.getByText('설정이 변경됐습니다. 다시 불러와 주세요.', { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: '최신 설정 다시 불러오기' }).click();
  await expect(page.getByText('최신 설정을 불러왔습니다.')).toBeVisible();
  await page.getByLabel('기본 전송 방식').selectOption('steer');
  await page.getByRole('button', { name: '저장', exact: true }).click();
  await expect(page.getByText('기본 전송 방식을 저장했습니다.', { exact: false })).toBeVisible();
  assert.equal((await cli('settings', 'get', 'send-mode')).sendMode, 'steer');
  await page.getByRole('button', { name: '연결', exact: true }).click();
  await page.getByRole('button', { name: '상태 확인', exact: true }).click();
  await expect(page.getByText('전용 Daemon이 정상적으로 응답했습니다.')).toBeVisible();
  await cli('dev', 'stop');
  await page.getByRole('button', { name: '상태 확인', exact: true }).click();
  await expect(page.getByRole('region', { name: '환경설정' }).getByRole('alert')).toBeVisible({
    timeout: 15000,
  });
  await verification.start();
  assert.equal((await readFile(path.join(data, 'server-id'), 'utf8')).trim(), oldId);
  assert.equal((await cli('settings', 'get', 'send-mode')).sendMode, 'steer');
  await page.getByRole('button', { name: '상태 확인', exact: true }).click();
  await expect(page.getByText('전용 Daemon이 정상적으로 응답했습니다.')).toBeVisible({
    timeout: 15000,
  });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  assert.equal(
    await page.evaluate((prefix) => localStorage.getItem(prefix + '.layout.v1'), oldPrefix),
    oldLayout,
  );
  // The other tab keeps its old Core/expectedServerId after the requesting tab resets.
  const stale = await page.context().newPage();
  observe(stale);
  await stale.goto('http://127.0.0.1:6868/');
  await stale.getByRole('button', { name: '설정', exact: true }).click();
  await stale.getByRole('button', { name: 'Agent 동작', exact: true }).click();
  await expect(stale.getByLabel('기본 전송 방식')).toHaveValue('steer');
  await stale.getByLabel('기본 전송 방식').selectOption('queue');
  const staleUrl = stale.url();
  await page.getByRole('button', { name: '데이터 관리', exact: true }).click();
  for (let cycle = 0; cycle < 2; cycle++) {
    await writeFile(path.join(data, 'old-fixture.txt'), 'Delete only this owned fixture.');
    await captureLifecycle(`before-reset-${cycle}`);
    const priorId = (await readFile(path.join(data, 'server-id'), 'utf8')).trim();
    await page.getByRole('button', { name: '초기화 대상 확인' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByText(path.join(data, 'old-fixture.txt'), { exact: true })).toBeVisible();
    await page.getByRole('button', { name: '취소', exact: true }).click();
    assert.equal((await readFile(path.join(data, 'server-id'), 'utf8')).trim(), priorId);
    await page.getByRole('button', { name: '초기화 대상 확인' }).click();
    await page.getByRole('button', { name: '삭제하고 다시 시작' }).click();
    await expect(page.getByRole('button', { name: '새 Agent', exact: true })).toBeVisible({
      timeout: 120000,
    });
    const nextId = (await readFile(path.join(data, 'server-id'), 'utf8')).trim();
    assert.notEqual(nextId, priorId);
    const reset = rpc
      .filter((call) => call.method === 'development.data' && call.operation === 'reset')
      .at(-1);
    assert.ok(reset?.input.id);
    const connection = await (
      await page.request.get('http://127.0.0.1:6868/connection.json')
    ).json();
    assert.equal(connection.completedResetId, reset.input.id);
    assert.equal(connection.expectedServerId, nextId);
    await assert.rejects(stat(path.join(data, 'old-fixture.txt')), { code: 'ENOENT' });
    assert.equal(
      await readFile(path.join(project, 'keep.txt'), 'utf8'),
      'External project survives.',
    );
    assert.equal((await cli('status')).state, 'running');
    assert.deepEqual(await cli('agent', 'list'), []);
    assert.equal((await cli('settings', 'get', 'send-mode')).sendMode, 'queue');
    if (cycle === 0) {
      assert.equal(stale.url(), staleUrl);
      const before = rpc.filter((call) => call.operation === 'saveSettings').length;
      await stale.getByRole('button', { name: '저장', exact: true }).click();
      await expect(stale.getByRole('alert').filter({ hasText: '새로고침' }).first()).toBeVisible();
      await expect(stale.getByRole('button', { name: '저장', exact: true })).toBeEnabled();
      assert.equal(rpc.filter((call) => call.operation === 'saveSettings').length, before);
      assert.deepEqual(await cli('settings', 'get', 'send-mode'), {
        sendMode: 'queue',
        revision: 0,
      });
      await stale.close();
    }
    const priorPrefix = 'worknaru.ui.server.' + encodeURIComponent(priorId);
    assert.deepEqual(
      await page.evaluate(
        (prefix) => Object.keys(localStorage).filter((key) => key.startsWith(prefix + '.')),
        priorPrefix,
      ),
      [],
    );
    assert.deepEqual(
      await page.evaluate(
        (id) =>
          JSON.parse(
            localStorage.getItem('worknaru.ui.server.' + encodeURIComponent(id) + '.layout.v1'),
          ),
        nextId,
      ),
      {
        sidebarWidth: null,
        detailsWidth: null,
        sidebarCollapsed: false,
        detailsOpen: false,
      },
    );
    await page.getByRole('button', { name: '설정', exact: true }).click();
    await page.getByRole('button', { name: '화면', exact: true }).click();
    await expect(page.getByLabel('화면 테마')).toHaveValue('system');
    await page.getByRole('button', { name: '데이터 관리', exact: true }).click();
    await expect(page.getByRole('button', { name: '전용 데이터 루트 폴더 열기' })).toBeEnabled();
  }
  assert.deepEqual(errors, []);
  assert.deepEqual(
    dialogs,
    [],
    'Confirmed reset must not raise a second beforeunload confirmation',
  );
  assert.equal(verification.builds, 1);
  await captureLifecycle('final');
  assert.ok(
    frames.every((type) =>
      ['plugin.rpc.invoke.request', 'daemon.get_status.request'].includes(type),
    ),
    JSON.stringify(frames),
  );
  assert.ok(
    rpc.every(
      (call) =>
        call.pluginId === 'worknaru-agent-service' &&
        ((call.method === 'agents.execute' &&
          ['health', 'list', 'settings', 'saveSettings'].includes(call.operation)) ||
          (call.method === 'development.data' &&
            ['snapshot', 'preview', 'reset'].includes(call.operation))),
    ),
    JSON.stringify(rpc),
  );
  assert.ok(
    commands.every(
      (args) =>
        ['doctor', 'status', 'settings'].includes(args[0]) ||
        (args[0] === 'agent' && args[1] === 'list') ||
        (args[0] === 'dev' && args[1] === 'stop'),
    ),
  );
  const evidence = {
    ok: true,
    builds: verification.builds,
    cycles: 2,
    sharedSettingsConflict: true,
    restartPersistence: true,
    staleTabSaveBlocked: true,
    newInstancePreferencesReset: true,
    commands,
    observedRpc: rpc,
    lifecycle,
    screenshots: directory,
  };
  await writeFile(path.join(directory, 'result.json'), JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify(evidence));
} catch (error) {
  const page = browser?.contexts()[0]?.pages()[0];
  if (page) {
    await writeFile(path.join(directory, 'failure.txt'), await page.locator('body').innerText());
    await page.screenshot({ path: path.join(directory, 'failure.png') });
  }
  throw error;
} finally {
  await browser?.close();
  try {
    await cli('dev', 'stop');
  } catch (error) {
    console.error('Cleanup needs inspection:', error.stdout ?? error.message);
  }
}
