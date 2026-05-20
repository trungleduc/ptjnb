import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  timeout: 30 * 1000,
  reporter: [['html', { open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:4477/lab',
    trace: 'off',
    video: 'retain-on-failure'
  },
  expect: {
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.01
    }
  },
  webServer: {
    command: 'jlpm run dev',
    url: 'http://127.0.0.1:4477/lab',
    reuseExistingServer: true,
    timeout: 120 * 1000
  }
});
