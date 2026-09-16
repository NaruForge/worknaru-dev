import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { sampleRun } from '../../src/testing/moduleFixture.js';
import { sampleProject } from '../../src/testing/workspaceFixture.js';

test('Module keyboard execution, lost response recovery and context history', async ({ page }) => {
  await page.goto('/iframe.html?id=product-modules--lost-response&viewMode=story');
  await page.getByLabel('분석할 텍스트').fill('한글😀\n둘');
  const execute = page.getByRole('button', { name: '실행', exact: true });
  await execute.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByText(/접수 여부를 확인하지 못했습니다/)).toBeVisible();
  await page.getByRole('button', { name: '설정', exact: true }).click();
  await page.getByRole('button', { name: '작업으로 돌아가기' }).click();
  await expect(page.getByLabel('분석할 텍스트')).toHaveValue('한글😀\n둘');
  await page.getByRole('button', { name: '같은 요청으로 다시 확인' }).click();
  await expect(page.getByText('글자 수', { exact: true })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Run 선택' }).getByRole('button')).toHaveCount(
    2,
  );
  await page.getByLabel('실행 대상').selectOption(`project:${sampleProject.id}`);
  await expect(page.getByText('아직 실행 기록이 없습니다')).toBeVisible();
  await page.goBack();
  await expect(page.getByText('글자 수', { exact: true })).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});
for (const [width, theme] of [
  [390, 'light'],
  [768, 'dark'],
  [1440, 'light'],
] as const) {
  test(`Module layout ${width} ${theme}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript((value) => localStorage.setItem('worknaru.ui.theme', value), theme);
    await page.goto('/iframe.html?id=product-modules--ready&viewMode=story');
    const previous = page.getByRole('button', { name: new RegExp(sampleRun.id) });
    await previous.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { name: '실행 결과', exact: true })).toBeFocused();
    await expect(page.getByText('글자 수', { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByText('글자 수', { exact: true })).toBeVisible();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await expect.soft(page).toHaveScreenshot(`module-${width}-${theme}.png`);
  });
}
