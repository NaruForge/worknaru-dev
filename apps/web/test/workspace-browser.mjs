// One real CLI/Web crossing, including normal restart. No Provider execution.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { chromium, expect } from '@playwright/test';
import { root } from '../../../packages/dev-environment/paths.mjs';
import { testDirectory } from '../../../packages/dev-environment/testing.mjs';
import { portOpen } from '../../cli/local-support.mjs';
import { verificationEnvironment } from '../../cli/test/verification-environment.mjs';

assert.equal(process.platform, 'win32', 'Workspace browser verification requires Windows.');
assert.equal(
  await portOpen(),
  false,
  'Stop the owned managed environment before isolated verification.',
);
const directory = await testDirectory('workspace-browser');
const env = {
  ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^WORKNARU_/i.test(key))),
  WORKNARU_DATA_DIR: path.join(directory, 'data'),
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
let evidence;
const rpc = [];
const errors = [];
try {
  await verification.setup();
  await verification.start();
  const workspace = await cli('workspace', 'create', '--name', 'CLI 업무 공간');
  const project = await cli(
    'project',
    'create',
    '--workspace',
    workspace.id,
    '--name',
    'CLI 교차 확인',
  );
  browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, locale: 'ko-KR' });
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('websocket', (socket) =>
    socket.on('framesent', ({ payload }) => {
      const envelope = JSON.parse(String(payload));
      if (envelope.type === 'session' && envelope.message.type === 'plugin.rpc.invoke.request') {
        rpc.push(`${envelope.message.method}:${envelope.message.input.operation}`);
      }
    }),
  );
  await page.goto('http://127.0.0.1:6868/');
  await page.getByRole('button', { name: 'Workspace', exact: true }).click();
  await page.getByLabel('Workspace 선택').selectOption(workspace.id);
  await page.getByRole('button', { name: new RegExp(project.name) }).click();
  const detail = page.getByRole('region', { name: '업무 공간 상세' });
  await expect(detail.getByText(project.id, { exact: true })).toBeVisible();
  await expect(detail.getByText(project.createdAt, { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Workspace 만들기', exact: true }).click();
  await page.getByLabel('Workspace 이름').fill('Web 업무 공간');
  await page.getByRole('button', { name: '만들기', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Web 업무 공간' })).toBeVisible();
  const webWorkspaceId = new URL(page.url()).hash.match(/workspace=([^&]+)/)[1];
  await page.getByRole('button', { name: 'Project 만들기', exact: true }).click();
  await page.getByLabel('Project 이름').fill('Web 교차 확인');
  await page.getByRole('button', { name: '만들기', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Web 교차 확인' })).toBeVisible();
  const selectedUrl = page.url();
  const webProjectId = new URL(selectedUrl).hash.match(/project=([^&]+)/)[1];
  const webWorkspace = await cli('workspace', 'show', webWorkspaceId);
  const webProject = await cli('project', 'show', webProjectId);
  assert.equal(webWorkspace.name, 'Web 업무 공간');
  assert.equal(webProject.name, 'Web 교차 확인');
  assert.equal(webProject.workspaceId, webWorkspace.id);
  assert.deepEqual(await cli('workspace', 'list'), [workspace, webWorkspace]);
  assert.deepEqual(await cli('project', 'list', '--workspace', workspace.id), [project]);
  assert.deepEqual(await cli('project', 'list', '--workspace', webWorkspace.id), [webProject]);
  await page.screenshot({ path: path.join(directory, 'workspace-desktop.png') });
  const cliRun = await cli(
    'module',
    'run',
    'text-stats',
    '--text',
    'CLI 기록',
    '--request-id',
    randomUUID(),
    '--standalone',
  );
  await page.getByRole('button', { name: 'Module', exact: true }).click();
  await page.getByRole('button', { name: new RegExp(cliRun.id) }).click();
  await expect(
    page.getByRole('region', { name: '실행 결과' }).getByText('6', { exact: true }),
  ).toBeVisible();
  const moduleRuns = [];
  for (const [target, flags] of [
    ['standalone', ['--standalone']],
    [`workspace:${webWorkspace.id}`, ['--workspace', webWorkspace.id]],
    [`project:${webProject.id}`, ['--project', webProject.id]],
  ]) {
    await page.getByLabel('실행 대상').selectOption(target);
    await page.getByLabel('분석할 텍스트').fill('한글😀\n둘');
    const previousUrl = page.url();
    await page.getByRole('button', { name: '실행', exact: true }).click();
    await expect.poll(() => page.url()).not.toBe(previousUrl);
    await expect(page.getByText('글자 수', { exact: true })).toBeVisible();
    const runId = new URL(page.url()).hash.match(/run=([^&]+)/)[1];
    const run = await cli('run', 'show', runId);
    assert.equal(run.status, 'succeeded');
    assert.deepEqual(run.result, { characters: 5, lines: 2 });
    assert.equal(run.input.text, '한글😀\n둘');
    assert.ok((await cli('run', 'list', ...flags)).some((item) => item.id === run.id));
    moduleRuns.push(run);
  }
  const moduleUrl = page.url();
  await page.screenshot({ path: path.join(directory, 'module-desktop.png') });
  await cli('dev', 'stop');
  await verification.start();
  assert.deepEqual(await cli('workspace', 'show', workspace.id), workspace);
  assert.deepEqual(await cli('project', 'show', project.id), project);
  assert.deepEqual(await cli('workspace', 'show', webWorkspace.id), webWorkspace);
  assert.deepEqual(await cli('project', 'show', webProject.id), webProject);
  await page.reload();
  await expect(page.getByText('글자 수', { exact: true })).toBeVisible();
  assert.equal(page.url(), moduleUrl);
  for (const run of moduleRuns) assert.deepEqual(await cli('run', 'show', run.id), run);
  await page.goto(selectedUrl);
  await expect(detail.getByText(webProject.id, { exact: true })).toBeVisible();
  await expect(detail.getByText(webProject.createdAt, { exact: true })).toBeVisible();
  assert.equal(page.url(), selectedUrl);
  assert.deepEqual(await cli('agent', 'list'), []);
  assert.equal(
    rpc.some((value) => /^agents\.execute:(create|options|send|permission)$/.test(value)),
    false,
  );
  assert.deepEqual(errors, []);
  assert.equal(verification.builds, 1);
  evidence = {
    cliToWeb: true,
    webToCli: true,
    restartPreservesEntitiesAndSelection: true,
    moduleCliWebThreeContextsAndRestart: true,
    commands,
    observedRpc: [...new Set(rpc)],
    screenshots: directory,
  };
} catch (error) {
  const page = browser?.contexts()[0]?.pages()[0];
  if (page) {
    await writeFile(path.join(directory, 'failure.txt'), await page.locator('body').innerText());
    await page.screenshot({ path: path.join(directory, 'failure.png') });
  }
  throw error;
} finally {
  await browser?.close();
  assert.equal((await cli('dev', 'stop')).state, 'stopped');
}
await writeFile(path.join(directory, 'result.json'), JSON.stringify(evidence, null, 2));
console.log(JSON.stringify(evidence));
