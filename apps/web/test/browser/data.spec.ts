import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('reset recovery stays visible through browser history and hash navigation', async ({
  page,
}) => {
  await page.goto('/iframe.html?id=product-shell--data-storage&viewMode=story');
  await page.getByRole('button', { name: '초기화 대상 확인' }).click();
  await page.clock.install();
  await page.getByRole('button', { name: '삭제하고 다시 시작' }).click();
  const heading = page.getByRole('heading', { name: '데이터 관리', exact: true });
  await expect(page.getByText('준비되면 화면을 새로 불러옵니다…', { exact: false })).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/#\/settings\/appearance$/);
  await expect(heading).toBeVisible();
  await page.goBack();
  await expect(heading).toBeVisible();
  await page.clock.fastForward(121000);
  const check = page.getByRole('button', { name: '재시작 결과 다시 확인' });
  await expect(check).toBeVisible();
  await page.evaluate(() => {
    location.hash = '#/agents?list=active';
  });
  await expect(check).toBeVisible();
  await check.click();
  await expect(
    page.getByText('아직 이 요청의 완료를 확인하지 못했습니다.', { exact: false }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: '초기화 대상 확인' })).toHaveCount(0);
});

for (const width of [390, 768, 1440])
  for (const theme of ['light', 'dark']) {
    test(`data storage and confirmation keyboard/accessibility ${width} ${theme}`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto('/iframe.html?id=product-shell--data-storage&viewMode=story');
      await page.getByRole('heading', { name: '데이터 관리', exact: true }).waitFor();
      await page.evaluate((theme) => (document.documentElement.dataset.theme = theme), theme);
      const open = page.getByRole('button', { name: '메시지·대기열 DB 폴더 열기' });
      await open.focus();
      await page.keyboard.press('Enter');
      await expect(
        page.getByText('DEVELOPMENT-PC의 탐색기에 폴더 열기를 요청했습니다.'),
      ).toBeVisible();
      await expect(page.getByRole('button', { name: '임시 파일 폴더 열기' })).toBeDisabled();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      await expect.soft(page).toHaveScreenshot(`data-${width}-${theme}.png`);
      const reset = page.getByRole('button', { name: '초기화 대상 확인' });
      await reset.focus();
      await page.keyboard.press('Enter');
      await expect(page.getByRole('dialog')).toBeVisible();
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      await page.keyboard.press('Escape');
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await expect(reset).toBeFocused();
      await page.getByRole('button', { name: '작업으로 돌아가기' }).click();
      await page.getByRole('button', { name: '설정', exact: true }).click();
      await expect(page.getByRole('heading', { name: '데이터 관리', exact: true })).toBeVisible();
    });
  }
