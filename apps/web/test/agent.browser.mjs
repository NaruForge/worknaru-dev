// Run with playwright-cli run-code --filename=apps/web/test/agent.browser.mjs
// Requires the owned daemon + Agent setup and Codex login. Incurs Provider usage.
async (page) => {
  const name = `Browser check ${Date.now()}`;
  await page.goto('http://127.0.0.1:6868/');
  await page.getByRole('button', { name: '설정', exact: true }).click();
  await page.getByRole('button', { name: 'Agent 동작', exact: true }).click();
  const mode = page.getByLabel('기본 전송 방식', { exact: true });
  await mode.waitFor();
  if ((await mode.inputValue()) !== 'queue') {
    await mode.selectOption('queue');
    await page.getByRole('button', { name: '저장', exact: true }).click();
    await page
      .getByText('기본 전송 방식을 저장했습니다. 새로 접수하는 메시지부터 적용합니다.')
      .waitFor();
  }
  await page.getByRole('button', { name: '작업으로 돌아가기', exact: true }).click();
  await page.getByRole('button', { name: '새 Agent', exact: true }).click();
  await page.getByLabel('이름', { exact: true }).fill(name);
  await page.getByRole('button', { name: '만들기', exact: true }).click();
  await page.getByRole('heading', { name, exact: true }).waitFor();
  const message = page.getByLabel('메시지', { exact: true });
  await message.fill('한글 조합');
  await message.dispatchEvent('keydown', { key: 'Enter', isComposing: true, keyCode: 229 });
  if ((await message.inputValue()) !== '한글 조합') throw Error('IME Enter submitted the message');
  await message.press('Shift+Enter');
  if (!(await message.inputValue()).includes('\n'))
    throw Error('Shift+Enter did not insert a newline');
  await message.fill('Remember MAPLE as our test word. Reply only MAPLE-17. Do not use tools.');
  await message.press('Enter');
  await page
    .getByLabel('대화 기록', { exact: true })
    .locator('article')
    .filter({ hasText: 'MAPLE-17' })
    .waitFor({ timeout: 60000 });
  await message.fill(
    'What test word did I tell you? Reply only that word followed by FOLLOWUP. Do not use tools.',
  );
  await message.press('Enter');
  await page
    .getByLabel('대화 기록', { exact: true })
    .locator('article')
    .filter({ hasText: 'MAPLE FOLLOWUP' })
    .waitFor({ timeout: 60000 });
  await page.reload();
  await page.getByRole('heading', { name, exact: true }).waitFor();
  await page
    .getByLabel('대화 기록', { exact: true })
    .locator('article')
    .filter({ hasText: 'MAPLE FOLLOWUP' })
    .waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth))
    throw Error('Page overflows a narrow viewport');
  if (
    await page
      .getByLabel('Agent 작업 영역', { exact: true })
      .evaluate((element) => element.getBoundingClientRect().right > innerWidth)
  )
    throw Error('Conversation is clipped on a narrow viewport');
  await page.screenshot({ path: '.local/agent-browser-mobile.png', fullPage: true });
  // A streamed reply can appear before the durable request settles. Confirm the
  // execution state before taking an archive preview that must remain current.
  await page
    .getByLabel('메시지 실행 상태', { exact: true })
    .waitFor({ state: 'hidden', timeout: 60000 });
  await page.getByRole('button', { name: 'Agent 목록으로', exact: true }).click();
  await page
    .getByRole('group', { name, exact: true })
    .getByRole('button', { name: 'Agent 보관', exact: true })
    .click();
  await page.getByRole('button', { name: '확인하고 보관', exact: true }).click();
  await page.getByRole('dialog', { name: 'Agent 보관' }).waitFor({ state: 'hidden' });
  await message.waitFor({ state: 'hidden' });
  await page.getByRole('button', { name: '보관함', exact: true }).click();
  await page.getByRole('button').filter({ hasText: name }).waitFor();
  await page.getByRole('button').filter({ hasText: name }).click();
  await page
    .getByLabel('대화 기록', { exact: true })
    .locator('article')
    .filter({ hasText: 'MAPLE FOLLOWUP' })
    .waitFor();
  return {
    name,
    archived: true,
    historyRetained: (await page.getByLabel('대화 기록', { exact: true }).innerText()).includes(
      'MAPLE FOLLOWUP',
    ),
    mobileOverflow: false,
    imeAndFollowup: true,
  };
};
