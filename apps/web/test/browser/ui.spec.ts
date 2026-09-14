import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
async function story(page: Page, name: string) {
  await page.goto(`/iframe.html?id=product-agents--${name}&viewMode=story`);
  await expect(page.getByRole('button', { name: '새 Agent', exact: true })).toBeVisible();
}
async function select(page: Page) {
  await page.getByRole('button', { name: /주간 업무 정리/ }).click();
  await expect(page.getByLabel('메시지', { exact: true })).toBeVisible();
}

for (const width of [390, 1440]) {
  test(`incoming permission and queue follow the bottom, archive restores focus ${width}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    await story(page, 'long');
    await select(page);
    const history = page.getByLabel('대화 기록', { exact: true });
    await expect(page.getByText('대화 50', { exact: false })).toBeVisible();
    await history.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    await page.evaluate(() => window.dispatchEvent(new Event('worknaru:fixture-permission')));
    await expect(page.getByRole('button', { name: '이번 요청 승인' })).toBeInViewport({ ratio: 1 });
    await page.evaluate(() => window.dispatchEvent(new Event('worknaru:fixture-queue')));
    await expect(page.getByRole('button', { name: '취소', exact: true })).toBeInViewport({
      ratio: 1,
    });
    await history.evaluate((element) => {
      element.scrollTop = 200;
      // Deliver incoming data before the browser's queued scroll event.
      window.dispatchEvent(new Event('worknaru:fixture-permission'));
    });
    await expect(page.getByRole('button', { name: '이번 요청 승인' })).toHaveCount(2);
    expect(await history.evaluate((element) => element.scrollTop)).toBe(200);
    await page.getByRole('button', { name: '보관', exact: true }).click();
    await page.getByRole('button', { name: '확인하고 보관' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(history).toBeFocused();
  });
}

for (const width of [390, 768, 1440])
  for (const colorScheme of ['light', 'dark'] as const) {
    test(`conversation, dialogs and accessibility ${width} ${colorScheme}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ colorScheme });
      await story(page, 'conversation');
      await select(page);
      await expect(page.getByText('이번 주에는 Agent 생성', { exact: false })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      expect(
        (
          await new AxeBuilder({ page })
            .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
            .analyze()
        ).violations,
      ).toEqual([]);
      if (process.platform === 'linux')
        await expect(page).toHaveScreenshot(`conversation-${width}-${colorScheme}.png`, {
          animations: 'disabled',
        });
      await page.getByRole('button', { name: 'Agent 상세 정보', exact: true }).click();
      await expect(page.getByText('C:\\Projects\\my-work', { exact: true })).toBeVisible();
      if (width < 1280) {
        await expect(page.getByRole('dialog')).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(
          page.getByRole('button', { name: 'Agent 상세 정보', exact: true }),
        ).toBeFocused();
      }
      await page.getByRole('button', { name: '보관', exact: true }).click();
      await expect(page.getByRole('dialog')).toBeVisible();
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      if (process.platform === 'linux')
        await expect(page).toHaveScreenshot(`archive-${width}-${colorScheme}.png`, {
          animations: 'disabled',
        });
    });
  }
test('a person can create, converse, follow up and archive', async ({ page }) => {
  await story(page, 'empty');
  await page.getByRole('button', { name: '새 Agent', exact: true }).click();
  await page.getByLabel('이름', { exact: true }).fill('새로운 업무');
  await page.getByRole('button', { name: '만들기', exact: true }).click();
  await expect(page.getByLabel('메시지', { exact: true })).toBeFocused();
  await page.getByLabel('메시지', { exact: true }).fill('첫 번째 요청');
  await page.getByRole('button', { name: '보내기', exact: true }).click();
  await expect(page.getByText('요청을 확인했습니다: 첫 번째 요청', { exact: true })).toBeVisible();
  await page.getByLabel('메시지', { exact: true }).fill('이어서 정리해 주세요');
  await page.keyboard.press('Enter');
  await expect(
    page.getByText('요청을 확인했습니다: 이어서 정리해 주세요', {
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole('button', { name: '보관', exact: true }).click();
  await page.getByRole('button', { name: '확인하고 보관' }).click();
  await expect(page.getByLabel('메시지', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '보관함', exact: true }).click();
  await page.getByRole('button', { name: /새로운 업무/ }).click();
  await expect(page.getByText('요청을 확인했습니다: 첫 번째 요청', { exact: true })).toBeVisible();
});
test('mobile navigation keeps the draft; polling keeps focus', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await story(page, 'conversation');
  await select(page);
  await page.getByLabel('메시지', { exact: true }).fill('한글 초안');
  await page.getByRole('button', { name: 'Agent 목록으로' }).click();
  await select(page);
  await expect(page.getByLabel('메시지', { exact: true })).toHaveValue('한글 초안');
  await page.getByLabel('메시지', { exact: true }).focus();
  await page.waitForTimeout(1700);
  await expect(page.getByLabel('메시지', { exact: true })).toBeFocused();
  await page
    .getByLabel('메시지', { exact: true })
    .dispatchEvent('keydown', { key: 'Enter', isComposing: true });
  await expect(page.getByLabel('메시지', { exact: true })).toHaveValue('한글 초안');
  await page.keyboard.press('End');
  await page.keyboard.press('Shift+Enter');
  await expect(page.getByLabel('메시지', { exact: true })).toHaveValue('한글 초안\n');
});
test('permission and uncertain recovery require explicit actions', async ({ page }) => {
  await story(page, 'permission');
  await select(page);
  await expect(page.getByRole('button', { name: '이번 요청 승인' })).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.getByRole('button', { name: '거부', exact: true }).click();
  await expect(page.getByRole('button', { name: '이번 요청 승인' })).toHaveCount(0);
  await story(page, 'uncertain');
  await select(page);
  await page.getByRole('button', { name: '기록 확인 후 실행 포기' }).click();
  await page.getByRole('dialog').getByRole('button', { name: '기록 확인 후 실행 포기' }).click();
  await page.getByRole('button', { name: '남은 대기열 재개' }).click();
  await expect(page.getByText('자동 실행이 멈췄습니다.', { exact: false })).toHaveCount(0);
});
test('reading position survives refresh and content does not execute HTML', async ({ page }) => {
  await story(page, 'long');
  await select(page);
  const history = page.getByLabel('대화 기록');
  await history.evaluate((element) => {
    element.scrollTop = 200;
  });
  await page.waitForTimeout(1700);
  expect(await history.evaluate((element) => element.scrollTop)).toBe(200);
  await page.getByLabel('메시지', { exact: true }).fill('<img src=x onerror="alert(1)">');
  await page.getByRole('button', { name: '보내기', exact: true }).click();
  // App branding and status icons may expose an image role. Only user content
  // must stay plain text; do not count unrelated navigation graphics here.
  await expect(history.locator('img')).toHaveCount(0);
  await expect(history.getByText('<img src=x onerror="alert(1)">', { exact: true })).toBeVisible();
});
test('empty, loading and disconnected screens remain readable on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const name of ['empty', 'loading', 'error']) {
    await story(page, name);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    if (name === 'error')
      await expect(page.getByRole('button', { name: '다시 연결' })).toBeVisible();
  }
});
