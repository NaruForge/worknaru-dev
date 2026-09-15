import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { sampleWorkspace, sampleProject } from '../../src/testing/workspaceFixture.js';

test('mobile Workspace navigation preserves selection through list, history and reload', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/iframe.html?id=product-workspaces--ready&viewMode=story');
  const select = page.getByLabel('Workspace 선택');
  await expect(select.locator('option', { hasText: sampleWorkspace.name })).toHaveCount(1);
  await select.selectOption(sampleWorkspace.id);
  await expect(page.getByRole('heading', { name: sampleWorkspace.name })).toBeFocused();
  await page.getByRole('button', { name: '목록으로', exact: true }).click();
  await expect(select).toBeFocused();
  await expect(page).toHaveURL(/workspace=.*&pane=list$/);
  const project = page.getByRole('button', { name: new RegExp(sampleProject.name) });
  await project.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: sampleProject.name })).toBeFocused();
  await page.getByRole('button', { name: '목록으로', exact: true }).click();
  await expect(project).toHaveAttribute('aria-current', 'page');
  await page.goBack();
  await expect(page.getByRole('heading', { name: sampleProject.name })).toBeVisible();
  await page.goForward();
  await expect(project).toBeVisible();
  await page.reload();
  await expect(project).toHaveAttribute('aria-current', 'page');
  await expect(select).toHaveValue(sampleWorkspace.id);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('Workspace dialog supports keyboard focus, cancellation and creation', async ({ page }) => {
  await page.goto('/iframe.html?id=product-workspaces--ready&viewMode=story');
  const create = page.getByRole('button', { name: 'Workspace 만들기', exact: true });
  await create.focus();
  await page.keyboard.press('Enter');
  const input = page.getByLabel('Workspace 이름');
  await expect(input).toBeFocused();
  await input.fill('새 업무 공간');
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.keyboard.press('Escape');
  await expect(create).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(input).toHaveValue('새 업무 공간');
  await input.press('Enter');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: '새 업무 공간' })).toBeFocused();
});

for (const [width, theme] of [
  [390, 'dark'],
  [768, 'light'],
  [1440, 'dark'],
] as const) {
  test(`Workspace layout ${width} ${theme}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript((value) => localStorage.setItem('worknaru.ui.theme', value), theme);
    await page.goto('/iframe.html?id=product-workspaces--ready&viewMode=story');
    await page.getByLabel('Workspace 선택').selectOption(sampleWorkspace.id);
    await expect(page.getByRole('heading', { name: sampleWorkspace.name })).toBeVisible();
    if (width === 390) await page.getByRole('button', { name: '목록으로', exact: true }).click();
    await expect(page.getByRole('button', { name: new RegExp(sampleProject.name) })).toBeVisible();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await expect.soft(page).toHaveScreenshot(`workspace-${width}-${theme}.png`);
  });
}
