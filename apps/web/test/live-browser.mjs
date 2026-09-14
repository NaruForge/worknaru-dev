// Opt-in real Provider verification. Creates and stops its own managed instance.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { chromium, expect } from '@playwright/test';
import { root } from '../../../packages/dev-environment/paths.mjs';
import { portOpen } from '../../cli/local-support.mjs';
if (process.platform !== 'win32') throw Error('Real managed UI verification requires Windows.');
assert.equal(await portOpen(), false, 'The managed development port must be free.');
const parent = path.join(root, '.local/ui-browser');
await mkdir(parent, { recursive: true });
const folder = await mkdtemp(path.join(parent, 'run-'));
const project = path.join(folder, 'project');
await mkdir(project);
const env = {
  ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^WORKNARU_/i.test(key))),
  WORKNARU_DATA_DIR: path.join(folder, 'data'),
};
const exec = promisify(execFile);
const cli = async (...args) => {
  const result = await exec(
    process.execPath,
    [path.join(root, 'apps/cli/bin/worknaru.mjs'), ...args, '--json'],
    { cwd: root, env, windowsHide: true, timeout: 180000, maxBuffer: 4 * 1024 * 1024 },
  );
  return JSON.parse(result.stdout);
};
let started = false;
let browser;
try {
  const doctor = await cli('doctor');
  assert.equal(doctor.ok, true);
  await cli('agent', 'setup');
  await cli('dev', 'start');
  started = true;
  browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const source = await readFile(new URL('./agent.browser.mjs', import.meta.url), 'utf8');
  const flow = new Function(`return (${source.trim().replace(/;$/, '')}\n)`)();
  const result = await flow(page);
  assert.equal(result.historyRetained, true);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('http://127.0.0.1:6868/');
  const agent = await cli('agent', 'create', '--name', 'CLI와 Web 교차 확인', '--cwd', project);
  await page.getByRole('button', { name: /CLI와 Web 교차 확인/ }).click({ timeout: 15000 });
  await cli(
    'agent',
    'send',
    agent.id,
    'Remember RIVER as our test word. Reply only RIVER. Do not use tools.',
    '--id',
    'ui-cross-first',
    '--no-wait',
  );
  await cli('agent', 'wait', agent.id, '--request', 'ui-cross-first', '--wait-timeout', '90');
  await expect(
    page
      .getByLabel('대화 기록')
      .locator('article')
      .filter({ hasText: /^AgentRIVER/ }),
  ).toBeVisible({ timeout: 15000 });
  await page
    .getByLabel('메시지', { exact: true })
    .fill('Reply with our test word followed by FOLLOWUP. Do not use tools.');
  await page.getByRole('button', { name: '보내기', exact: true }).click();
  await expect(
    page
      .getByLabel('대화 기록')
      .locator('article')
      .filter({ hasText: /RIVER.*FOLLOWUP/s }),
  ).toBeVisible({ timeout: 90000 });
  assert.match(
    JSON.stringify(await cli('agent', 'history', agent.id, '--all')),
    /RIVER.*FOLLOWUP/s,
  );
  await page.screenshot({ path: path.join(folder, 'desktop.png') });
  const message = page.getByLabel('메시지', { exact: true });
  await message.fill('설정 왕복 후 이어 쓸 초안');
  await page.getByRole('button', { name: '설정', exact: true }).click();
  await page.getByLabel('화면 테마').selectOption('dark');
  await page.getByRole('button', { name: 'Agent 동작', exact: true }).click();
  await page.getByLabel('기본 전송 방식').selectOption('steer');
  await cli('settings', 'set', 'send-mode', 'steer');
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
  await page.getByLabel('기본 전송 방식').selectOption('queue');
  await page.getByRole('button', { name: '저장', exact: true }).click();
  await expect(page.getByText('기본 전송 방식을 저장했습니다.', { exact: false })).toBeVisible();
  assert.equal((await cli('settings', 'get', 'send-mode')).sendMode, 'queue');
  await page.getByRole('button', { name: '연결', exact: true }).click();
  await page.getByRole('button', { name: '상태 확인', exact: true }).click();
  await expect(page.getByText('전용 Daemon이 정상적으로 응답했습니다.')).toBeVisible();
  await cli('dev', 'stop');
  started = false;
  await page.getByRole('button', { name: '상태 확인', exact: true }).click();
  await expect(page.getByRole('region', { name: '환경설정' }).getByRole('alert')).toBeVisible({
    timeout: 15000,
  });
  await cli('dev', 'start');
  started = true;
  await page.getByRole('button', { name: '상태 확인', exact: true }).click();
  await expect(page.getByText('전용 Daemon이 정상적으로 응답했습니다.')).toBeVisible({
    timeout: 15000,
  });
  await page.getByRole('button', { name: '작업으로 돌아가기' }).click();
  await expect(message).toHaveValue('설정 왕복 후 이어 쓸 초안');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await cli('agent', 'archive', agent.id, '--yes');
  await expect(page.getByLabel('메시지', { exact: true })).toHaveCount(0, { timeout: 15000 });
  assert.deepEqual(errors, []);
  const evidence = {
    ...result,
    cliWebCrossover: true,
    reconnection: true,
    settingsContextRetained: true,
    sharedSettingsConflict: true,
    pageErrors: errors,
    folder: path.relative(root, folder),
  };
  await writeFile(path.join(folder, 'result.json'), JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify(evidence));
} catch (error) {
  const page = browser?.contexts()[0]?.pages()[0];
  if (page) {
    await writeFile(path.join(folder, 'failure.txt'), await page.locator('body').innerText());
    await page.screenshot({ path: path.join(folder, 'failure.png') });
  }
  throw error;
} finally {
  await browser?.close();
  if (started) await cli('dev', 'stop');
}
