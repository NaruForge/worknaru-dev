// Run with playwright-cli run-code --filename=apps/web/test/agent.browser.mjs
// Requires the owned daemon + Agent setup and Codex login. Incurs Provider usage.
async page => {
  const name = `Browser check ${Date.now()}`;
  await page.goto('http://127.0.0.1:6868/');
  await page.getByRole('button', { name: '새 Agent', exact: true }).click();
  await page.getByLabel('이름', { exact: true }).fill(name);
  await page.getByRole('button', { name: '만들기', exact: true }).click();
  await page.getByRole('heading', { name, exact: true }).waitFor();
  const message = page.getByLabel('메시지', { exact: true });
  await message.fill('한글 조합');
  await message.dispatchEvent('keydown', { key: 'Enter', isComposing: true, keyCode: 229 });
  if (await message.inputValue() !== '한글 조합') throw Error('IME Enter submitted the message');
  await message.press('Shift+Enter');
  if (!(await message.inputValue()).includes('\n')) throw Error('Shift+Enter did not insert a newline');
  await message.fill('Remember MAPLE as our test word. Reply only MAPLE-17. Do not use tools.'); await message.press('Enter');
  await page.locator('#history .agent-message').filter({ hasText: 'MAPLE-17' }).waitFor({ timeout: 60000 });
  await message.fill('What test word did I tell you? Reply only that word followed by FOLLOWUP. Do not use tools.'); await message.press('Enter');
  await page.locator('#history .agent-message').filter({ hasText: 'MAPLE FOLLOWUP' }).waitFor({ timeout: 60000 });
  await page.reload(); await page.getByRole('heading', { name, exact: true }).waitFor();
  await page.locator('#history .agent-message').filter({ hasText: 'MAPLE FOLLOWUP' }).waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw Error('Page overflows a narrow viewport');
  if (await page.locator('.conversation').evaluate(element => element.getBoundingClientRect().right > innerWidth)) throw Error('Conversation is clipped on a narrow viewport');
  await page.screenshot({ path: '.local/agent-browser-mobile.png', fullPage: true });
  await page.getByRole('button', { name: '보관', exact: true }).click();
  await page.getByRole('button', { name: '확인하고 보관', exact: true }).click();
  await page.getByRole('dialog', { name: 'Agent 보관' }).waitFor({ state: 'hidden' });
  await page.waitForFunction(() => document.getElementById('message').disabled);
  await page.getByLabel('보관함 보기').check();
  await page.getByRole('button').filter({ hasText: name }).waitFor();
  return { name, archived: true, historyRetained: (await page.locator('#history').innerText()).includes('MAPLE FOLLOWUP'), mobileOverflow: false, imeAndFollowup: true };
}
