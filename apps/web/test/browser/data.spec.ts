import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

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
      if (process.platform === 'linux')
        await expect(page).toHaveScreenshot(`data-${width}-${theme}.png`);
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
