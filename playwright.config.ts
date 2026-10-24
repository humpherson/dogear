import { defineConfig, devices } from '@playwright/test';
const path = process.env.TEST_BASE_PATH || '/dogear/';
export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  timeout: 60000,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: `http://127.0.0.1:4173${path}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    {
      name: 'mobile',
      use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium' },
    },
  ],
  webServer: {
    command: 'node scripts/preview-test.mjs',
    url: `http://127.0.0.1:4173${path}`,
    reuseExistingServer: false,
    timeout: 180000,
  },
});
