import { testDirectory } from '../../../packages/dev-environment/testing.mjs';
// Opt-in real Provider verification. Creates and stops its own managed instance.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { chromium, expect } from '@playwright/test';
import { root } from '../../../packages/dev-environment/paths.mjs';
import { portOpen } from '../../cli/local-support.mjs';
import { verificationEnvironment } from '../../cli/test/verification-environment.mjs';
import { agentRecord, systemAgentEvidence } from './system-agent-evidence.mjs';
if (process.platform !== 'win32') throw Error('Real managed UI verification requires Windows.');
assert.equal(await portOpen(), false, 'The managed development port must be free.');
const parent = await testDirectory('ui-browser');
await mkdir(parent, { recursive: true });
const folder = await mkdtemp(path.join(parent, 'run-'));
const project = path.join(folder, 'project');
await mkdir(project);
const env = {
  ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^WORKNARU_/i.test(key))),
  WORKNARU_DATA_DIR: path.join(folder, 'data'),
};
const exec = promisify(execFile);
const verification = verificationEnvironment(env);
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
  await verification.setup();
  await verification.start();
  started = true;
  assert.equal((await cli('doctor')).ok, true);
  browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const source = await readFile(new URL('./agent.browser.mjs', import.meta.url), 'utf8');
  const flow = new Function(`return (${source.trim().replace(/;$/, '')}\n)`)();
  const result = await flow(page, project, path.join(folder, 'web-agent.png'));
  assert.equal(result.historyRetained, true);
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
  await page
    .getByLabel('메시지 실행 상태', { exact: true })
    .waitFor({ state: 'hidden', timeout: 60000 });
  await cli('agent', 'archive', agent.id, '--yes');
  await expect(page.getByLabel('메시지', { exact: true })).toHaveCount(0, { timeout: 15000 });
  // A fresh app-level session receives only the user's question, with no product description.
  await page.goto('http://127.0.0.1:6868/');
  await page.getByRole('button', { name: 'System Agent 열기', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'System Agent', exact: true })).toBeVisible({ timeout: 30000 });
  const system = (await cli('agent', 'list')).find(value => value.role === 'system');
  assert.ok(system); assert.notEqual(system.id, agent.id);
  assert.equal(system.cwd, path.join(env.WORKNARU_DATA_DIR, 'system-agent'));
  assert.equal((await cli('workspace', 'list')).length, 0);
  const question = 'WorkNaru가 무엇이고, 너는 여기서 어떤 역할을 하니?';
  await page.getByLabel('메시지', { exact: true }).fill(question);
  await page.getByRole('button', { name: '보내기', exact: true }).click();
  const reply = page.getByLabel('대화 기록').locator('article').filter({ hasText: /^Agent/ });
  await expect(reply.first()).toBeVisible({ timeout: 90000 });
  await page.getByLabel('메시지 실행 상태', { exact: true }).waitFor({ state: 'hidden', timeout: 90000 });
  const answer = (await cli('agent', 'history', system.id, '--all')).entries.filter(value => value.type === 'assistant_message').map(value => value.text).join('');
  assert.match(answer, /WorkNaru/i); assert.match(answer, /System Agent|시스템\s*에이전트/i);
  assert.match(answer, /업무/); assert.match(answer, /아직|현재|지금/);
  await page.getByRole('button', { name: 'System Agent 열기', exact: true }).click();
  assert.equal((await cli('agent', 'list')).filter(value => value.role === 'system').length, 1);
  const developerHistory = await cli('agent', 'history', agent.id, '--all');
  await cli('dev', 'stop'); started = false;
  const systemEvidence = await systemAgentEvidence(env.WORKNARU_DATA_DIR, system, agent, question);
  await verification.start(); started = true;
  await page.reload();
  await page.getByRole('button', { name: 'System Agent 열기', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'System Agent', exact: true })).toBeVisible();
  assert.equal((await cli('agent', 'list')).find(value => value.role === 'system').id, system.id);
  assert.equal((await agentRecord(env.WORKNARU_DATA_DIR, system.id)).persistence.sessionId, systemEvidence.providerSessionId);
  assert.deepEqual((await cli('agent', 'history', agent.id, '--all')).entries, developerHistory.entries);
  await expect(page.getByLabel('대화 기록').getByText(question, { exact: true })).toBeVisible();
  await page.screenshot({ path: path.join(folder, 'system-agent.png') });
  assert.deepEqual(errors, []);
  assert.equal(verification.builds, 1, 'One verified build covers setup and all restarts.');
  const evidence = {
    systemAgent: { ...systemEvidence, answer, reusedAfterRestart: true },
    builds: verification.builds,
    ...result,
    cliWebCrossover: true,
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
