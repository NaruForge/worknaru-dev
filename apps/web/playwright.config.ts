import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./test/browser",
  fullyParallel: true,
  workers: process.env.CI ? 2 : 4,
  use: {
    baseURL: "http://127.0.0.1:6006",
    browserName: "chromium",
    locale: "ko-KR",
    timezoneId: "Asia/Seoul",
    reducedMotion: "reduce",
    trace: "retain-on-failure",
  },
  expect: { timeout: 10000, toHaveScreenshot: { maxDiffPixelRatio: 0.001 } },
  timeout: 30000,
  reporter: [["list"], ["html", { open: "never" }]],
  webServer: {
    command: "node test/storybook-server.mjs",
    url: "http://127.0.0.1:6006",
    reuseExistingServer: false,
  },
});
