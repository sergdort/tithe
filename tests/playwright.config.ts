import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './pwa',
  use: {
    ...devices['iPhone 13'],
    baseURL: 'http://127.0.0.1:5173',
  },
  webServer: {
    command: 'pnpm --filter @tithe/pwa dev --host 127.0.0.1 --port 5173',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: true,
  },
});
