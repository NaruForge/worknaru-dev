import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

async function open(page: Page, hash = '') {
  await page.goto(`/iframe.html?id=product-agents--continuity&viewMode=story${hash}`);
  if (!hash) await page.getByRole('button', { name: /주간 업무 정리/ }).click();
}
const settings = (page: Page) =>
  page
    .getByRole('navigation', { name: '앱 탐색', exact: true })
    .getByRole('button', { name: /^설정/ })
    .click();

test('icon navigation exposes names, hover titles and unsaved settings without duplicate shortcuts', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page);
  const rail = page.getByRole('complementary', { name: '앱 탐색 영역' });
  const nav = page.getByRole('navigation', { name: '앱 탐색', exact: true });
  expect(await rail.innerText()).toBe('');
  expect((await rail.boundingBox())!.width).toBe(64);
  await expect(page.getByRole('button', { name: '전송 설정', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '전송 방식 변경' })).toHaveCount(0);
  await expect(page.getByText('전송 방식: 대기열', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '보관', exact: true })).toBeVisible();
  for (const label of ['Agent', '설정']) {
    const button = nav.getByRole('button', { name: label, exact: true });
    await button.hover();
    await expect(button).toHaveAttribute('title', label);
    expect(await button.innerText()).toBe('');
    expect((await button.locator('svg').boundingBox())!.width).toBe(16);
  }
  await nav.getByRole('button', { name: '설정', exact: true }).focus();
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'Agent 동작', exact: true }).click();
  await page.getByLabel('기본 전송 방식').selectOption('steer');
  await page.getByRole('button', { name: '작업으로 돌아가기' }).click();
  await expect(nav.getByRole('button', { name: '설정 (미저장)', exact: true })).toHaveAttribute(
    'title',
    '설정 (미저장)',
  );
  await settings(page);
  await expect(page.getByText('저장하지 않은 변경', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '변경 취소' }).click();
  await expect(nav.getByRole('button', { name: '설정', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  );
});

for (const width of [390, 1440])
  test(`list archive preserves the selected Agent, draft and reading position ${width}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await open(page);
    const history = page.getByLabel('대화 기록', { exact: true });
    await history.evaluate((element) => {
      element.scrollTop = 200;
    });
    await page.getByLabel('메시지', { exact: true }).fill('진행 중인 작업');
    if (width < 768) await page.getByRole('button', { name: 'Agent 목록으로' }).click();
    const url = page.url();
    const opener = page
      .getByRole('group', { name: '고객 미팅 준비', exact: true })
      .getByRole('button', { name: 'Agent 보관' });
    await expect(opener).toHaveAccessibleDescription('고객 미팅 준비');
    await opener.click();
    const dialog = page.getByRole('dialog', { name: 'Agent 보관' });
    await expect(dialog.getByText('고객 미팅 준비', { exact: false })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(opener).toBeFocused();
    await opener.click();
    await dialog.getByRole('button', { name: '확인하고 보관' }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole('group', { name: '고객 미팅 준비', exact: true })).toHaveCount(0);
    await expect(page.getByRole('navigation', { name: 'Agent 선택' })).toBeFocused();
    expect(page.url()).toBe(url);
    if (width < 768) await page.getByRole('button', { name: /주간 업무 정리/ }).click();
    await expect(page.getByLabel('메시지', { exact: true })).toHaveValue('진행 중인 작업');
    expect(await history.evaluate((element) => element.scrollTop)).toBe(200);
    if (width < 768) await page.getByRole('button', { name: 'Agent 목록으로' }).click();
    await page.getByRole('button', { name: '보관함', exact: true }).click();
    await expect(page.getByRole('group', { name: '고객 미팅 준비', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Agent 보관', exact: true })).toHaveCount(0);
  });

test('an Agent can be archived from the list before selecting a conversation', async ({ page }) => {
  await page.goto('/iframe.html?id=product-agents--conversation&viewMode=story');
  await page.getByRole('button', { name: 'Agent 보관', exact: true }).click();
  await page.getByRole('button', { name: '확인하고 보관' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByText('아직 Agent가 없습니다.', { exact: true })).toBeVisible();
  await expect(
    page.getByText('Agent를 보관했습니다: 주간 업무 정리.', { exact: false }),
  ).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Agent 선택' })).toBeFocused();
});

test.describe('touch controls', () => {
  test.use({ hasTouch: true });
  test('icon-only navigation and list archive keep the shared touch target', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/iframe.html?id=product-agents--conversation&viewMode=story');
    for (const button of [
      page
        .getByRole('navigation', { name: '앱 탐색', exact: true })
        .getByRole('button', { name: 'Agent', exact: true }),
      page.getByRole('button', { name: '설정', exact: true }),
      page.getByRole('button', { name: 'Agent 보관', exact: true }),
    ]) {
      await expect(button).toBeVisible();
      const box = (await button.boundingBox())!;
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  });
});
test('hidden Agent dialogs do not obstruct settings after navigation or resize', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page);
  await page.getByRole('button', { name: 'Agent 상세 정보', exact: true }).click();
  await settings(page);
  await page.setViewportSize({ width: 1000, height: 900 });
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByLabel('화면 테마').selectOption('dark');
  await page.getByRole('button', { name: '작업으로 돌아가기' }).click();
  await expect(page.getByRole('dialog', { name: 'Agent 상세 정보' })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '새 Agent', exact: true }).click();
  await page.getByLabel('이름', { exact: true }).fill('유지할 생성 입력');
  await page.goBack();
  await expect(page.getByLabel('화면 테마')).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.goForward();
  await expect(page.getByRole('dialog', { name: '새 Agent 만들기' })).toBeVisible();
  await expect(page.getByLabel('이름', { exact: true })).toHaveValue('유지할 생성 입력');
});
for (const width of [390, 1440])
  test(`long Agent list scrolls independently and keeps its place ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/iframe.html?id=product-agents--many&viewMode=story');
    const list = page.getByRole('navigation', { name: 'Agent 선택' });
    await page.getByRole('button', { name: /주간 업무 정리/ }).waitFor();
    await list.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    const position = await list.evaluate((element) => element.scrollTop);
    expect(position).toBeGreaterThan(0);
    await expect(list.getByRole('button', { name: /^작업 40 / })).toBeInViewport({ ratio: 1 });
    await expect(
      page
        .getByRole('group', { name: '작업 40', exact: true })
        .getByRole('button', { name: 'Agent 보관' }),
    ).toBeInViewport({
      ratio: 1,
    });
    await settings(page);
    await page.getByRole('button', { name: '작업으로 돌아가기' }).click();
    expect(await list.evaluate((element) => element.scrollTop)).toBe(position);
    await list.evaluate((element) => {
      element.scrollTop = 0;
    });
    await list.getByRole('button', { name: /주간 업무 정리/ }).click();
    await page.getByRole('button', { name: 'Agent 상세 정보', exact: true }).click();
    if (width === 1440) {
      const details = page.getByRole('complementary', { name: 'Agent 상세 정보' });
      await details.evaluate((element) => {
        element.scrollTop = element.scrollHeight;
      });
      await expect(details.getByText('sample-agent', { exact: true })).toBeInViewport({ ratio: 1 });
    } else {
      await expect(page.getByRole('dialog', { name: 'Agent 상세 정보' })).toBeVisible();
      await page.keyboard.press('Escape');
    }
  });
test('older reading position, draft and focus survive Settings and A → B → A', async ({ page }) => {
  await open(page);
  const history = page.getByLabel('대화 기록', { exact: true });
  await page.getByRole('button', { name: '이전 대화 불러오기' }).click();
  await expect(page.locator('[data-entry-seq="81"]')).toHaveCount(1);
  await history.evaluate((element) => {
    element.scrollTop = 200;
  });
  await page.getByLabel('메시지', { exact: true }).fill('작업 맥락을 유지합니다');
  await settings(page);
  await page.getByLabel('화면 테마').selectOption('dark');
  await page.getByRole('button', { name: '작업으로 돌아가기' }).click();
  await expect(page.getByLabel('메시지', { exact: true })).toBeFocused();
  expect(await history.evaluate((element) => element.scrollTop)).toBe(200);
  await page.getByRole('button', { name: /고객 미팅 준비/ }).click();
  await page.getByRole('button', { name: /주간 업무 정리/ }).click();
  await expect(page.getByLabel('메시지', { exact: true })).toHaveValue('작업 맥락을 유지합니다');
  expect(await history.evaluate((element) => element.scrollTop)).toBe(200);
  await page.waitForTimeout(1700);
  expect(await history.evaluate((element) => element.scrollTop)).toBe(200);
});
test('browser history, legacy links, settings reload and invalid routes stay in the app', async ({
  page,
}) => {
  await open(page, '#sample-agent');
  await expect(page.getByLabel('메시지', { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/#\/agents\?list=active&agent=sample-agent$/);
  await settings(page);
  await expect(page).toHaveURL(/#\/settings\/appearance$/);
  await page.goBack();
  await expect(page.getByLabel('메시지', { exact: true })).toBeVisible();
  await page.goForward();
  await expect(page.getByLabel('화면 테마')).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('화면 테마')).toBeVisible();
  await open(page, '#/no-such-view');
  await expect(
    page.getByText('사용할 수 없는 주소 또는 Agent입니다.', { exact: false }),
  ).toBeVisible();
  await open(page, '#/agents?list=active&agent=missing');
  await expect(
    page.getByText('사용할 수 없는 주소 또는 Agent입니다.', { exact: false }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: /주간 업무 정리/ })).toBeVisible();
});
test('panel mouse and keyboard sizing persists, collapses, resets and adapts to mobile', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page);
  const split = page.getByRole('separator', { name: 'Agent 목록 너비', exact: true });
  await expect(split).toHaveAttribute('aria-valuenow', '260');
  const box = (await split.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + 50);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 40, box.y + 50);
  await page.mouse.up();
  await expect(split).toHaveAttribute('aria-valuenow', '300');
  await split.focus();
  await page.keyboard.press('ArrowRight');
  await expect(split).toHaveAttribute('aria-valuenow', '316');
  await page.getByRole('button', { name: 'Agent 상세 정보', exact: true }).click();
  const inspector = page.getByRole('separator', { name: '상세 패널 너비', exact: true });
  await inspector.focus();
  await page.keyboard.press('End');
  await expect(inspector).toHaveAttribute('aria-valuenow', '400');
  await page.getByRole('button', { name: '목록 접기', exact: true }).click();
  await expect(page.getByRole('button', { name: '목록 펼치기' })).toBeFocused();
  await page.reload();
  await expect(page.getByRole('button', { name: '목록 펼치기' })).toBeVisible();
  await page.getByRole('button', { name: '목록 펼치기' }).click();
  await expect(split).toHaveAttribute('aria-valuenow', '316');
  await expect(inspector).toHaveAttribute('aria-valuenow', '400');
  await page.setViewportSize({ width: 390, height: 844 });
  // The open desktop inspector becomes a keyboard-dismissable sheet.
  await expect(page.getByRole('dialog', { name: 'Agent 상세 정보' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'Agent 목록으로' }).click();
  await page.getByRole('button', { name: /주간 업무 정리/ }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await settings(page);
  await page.getByRole('button', { name: '배치 초기화' }).click();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole('button', { name: '작업으로 돌아가기' }).click();
  await expect(split).toHaveAttribute('aria-valuenow', '260');
  await expect(inspector).toHaveCount(0);
});
test('unsaved settings remain local to the tab and commit only on Save', async ({ page }) => {
  await open(page);
  await settings(page);
  await page.getByRole('button', { name: 'Agent 동작', exact: true }).click();
  await page.getByLabel('기본 전송 방식').selectOption('steer');
  await page.getByRole('button', { name: '작업으로 돌아가기' }).click();
  await expect(page.getByText('전송 방식: 대기열', { exact: true })).toBeVisible();
  await settings(page);
  await expect(page.getByLabel('기본 전송 방식')).toHaveValue('steer');
  await page.getByRole('button', { name: '저장', exact: true }).click();
  await expect(page.getByText('기본 전송 방식을 저장했습니다.', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: '작업으로 돌아가기' }).click();
  await expect(page.getByText('전송 방식: 추가 지시', { exact: true })).toBeVisible();
});
for (const width of [390, 768, 1440])
  for (const colorScheme of ['light', 'dark'] as const) {
    test(`settings sections and accessibility ${width} ${colorScheme}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ colorScheme });
      await open(page, '#/settings/appearance');
      await expect(page.getByLabel('화면 테마')).toBeVisible();
      for (const label of ['화면', 'Agent 동작', '연결']) {
        await page
          .getByRole('navigation', { name: '설정 섹션' })
          .filter({ visible: true })
          .getByRole('button', { name: label, exact: true })
          .click();
        expect(
          (
            await new AxeBuilder({ page })
              .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
              .analyze()
          ).violations,
        ).toEqual([]);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true,
        );
      }
      await page.getByRole('button', { name: '상태 확인', exact: true }).click();
      await expect(page.getByText('전용 Daemon이 정상적으로 응답했습니다.')).toBeVisible();
      if (process.platform === 'linux')
        await expect(page).toHaveScreenshot(`settings-${width}-${colorScheme}.png`);
    });
  }
test('malformed and unavailable local preferences preserve a usable layout', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      'worknaru.ui.layout.v1',
      '{"sidebarWidth":999999,"detailsWidth":"invalid"}',
    );
  });
  await open(page);
  await expect(
    page.getByRole('separator', { name: 'Agent 목록 너비', exact: true }),
  ).toHaveAttribute('aria-valuenow', '400');
  await page.evaluate(() => {
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === 'worknaru.ui.layout.v1') throw Error('denied');
      set.call(this, key, value);
    };
  });
  await settings(page);
  await page.getByRole('button', { name: '배치 초기화' }).click();
  await expect(
    page.getByText('브라우저에 배치를 저장할 수 없습니다.', { exact: false }),
  ).toBeVisible();
});
test('200 percent content zoom retains access to navigation and sending', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await open(page);
  await page.evaluate(() => {
    document.documentElement.style.zoom = '2';
  });
  await page.getByLabel('메시지', { exact: true }).fill('확대된 화면에서 작성');
  await expect(page.getByRole('button', { name: '보내기', exact: true })).toBeInViewport({
    ratio: 1,
  });
  await settings(page);
  await expect(page.getByLabel('화면 테마')).toBeInViewport({ ratio: 1 });
});
