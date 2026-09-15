// No Provider messages: exercise the existing Web RPC and owned runner against isolated data.
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
const project = path.join(directory, 'project'); await mkdir(project);
await writeFile(path.join(project, 'keep.txt'), 'External project survives.');
const env = { ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^WORKNARU_/i.test(key))), WORKNARU_DATA_DIR: data };
const verification = verificationEnvironment(env);
const exec = promisify(execFile);
const cli = async (...args) => {
  const value = await exec(process.execPath, [path.join(root, 'apps/cli/bin/worknaru.mjs'), ...args, '--json'],
    { cwd: root, env, windowsHide: true, timeout: 180000, maxBuffer: 4 * 1024 * 1024 });
  return JSON.parse(value.stdout);
};
let browser;
try {
  await verification.setup(); await verification.start();
  assert.equal((await cli('doctor')).ok, true);
  browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  const dialogs = []; page.on('dialog', async dialog => { dialogs.push(dialog.type()); await dialog.accept(); });
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
  await page.getByRole('button', { name: 'Agent 동작', exact: true }).click();
  await page.getByLabel('기본 전송 방식').selectOption('steer');
  await page.getByRole('button', { name: '데이터 관리', exact: true }).click();
  for (let cycle = 0; cycle < 2; cycle++) {
    await writeFile(path.join(data, 'old-fixture.txt'), 'Delete only this owned fixture.');
    const priorId = (await readFile(path.join(data, 'server-id'), 'utf8')).trim();
    await page.getByRole('button', { name: '초기화 대상 확인' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByText(path.join(data, 'old-fixture.txt'), { exact: true })).toBeVisible();
    await page.getByRole('button', { name: '취소', exact: true }).click();
    assert.equal((await readFile(path.join(data, 'server-id'), 'utf8')).trim(), priorId);
    await page.getByRole('button', { name: '초기화 대상 확인' }).click();
    await page.getByRole('button', { name: '삭제하고 다시 시작' }).click();
    await expect(page.getByRole('button', { name: '새 Agent', exact: true })).toBeVisible({ timeout: 120000 });
    const nextId = (await readFile(path.join(data, 'server-id'), 'utf8')).trim();
    assert.notEqual(nextId, priorId);
    await assert.rejects(stat(path.join(data, 'old-fixture.txt')), { code: 'ENOENT' });
    assert.equal(await readFile(path.join(project, 'keep.txt'), 'utf8'), 'External project survives.');
    assert.equal((await cli('status')).state, 'running');
    assert.deepEqual(await cli('agent', 'list'), []);
    await page.getByRole('button', { name: '설정', exact: true }).click();
    await page.getByRole('button', { name: '데이터 관리', exact: true }).click();
    await expect(page.getByRole('button', { name: '전용 데이터 루트 폴더 열기' })).toBeEnabled();
  }
  assert.deepEqual(errors, []);
  assert.deepEqual(dialogs, [], 'Confirmed reset must not raise a second beforeunload confirmation');
  assert.equal(verification.builds, 1);
  console.log(JSON.stringify({ ok: true, builds: verification.builds, cycles: 2, providerMessages: 0, screenshots: directory }));
} finally {
  await browser?.close();
  try { await cli('dev', 'stop'); } catch (error) { console.error('Cleanup needs inspection:', error.stdout ?? error.message); }
}
