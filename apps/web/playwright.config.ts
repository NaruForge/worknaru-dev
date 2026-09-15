import { defineConfig } from '@playwright/test';

if (process.platform !== 'win32') throw new Error('UI verification requires Windows.');

export default defineConfig({
  testDir: './test/browser',
  fullyParallel: true,
  workers: process.env.CI ? 2 : 4,
  // The normal regression command must compare committed screenshot baselines.
  // Only the explicitly named functional command opts out through Playwright's CLI.
  ignoreSnapshots: false,
  updateSnapshots: 'none',
  use: {
    baseURL: 'http://127.0.0.1:6006',
    browserName: 'chromium',
    locale: 'ko-KR',
    timezoneId: 'Asia/Seoul',
    reducedMotion: 'reduce',
    trace: 'retain-on-failure',
  },
  expect: { timeout: 10000, toHaveScreenshot: { maxDiffPixelRatio: 0.001 } },
  timeout: 30000,
  reporter: [['list'], ['html', { open: 'never' }]],
  webServer: {
    command: 'node test/storybook-server.mjs',
    url: 'http://127.0.0.1:6006',
    reuseExistingServer: false,
  },
});
