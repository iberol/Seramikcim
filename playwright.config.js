// playwright.config.js — Seramikcim e2e smoke testleri
// Chromium only (Phase E onaylanan kapsam). Dev server zaten 5173 portunda
// çalışıyorsa reuseExistingServer ile yeniden başlatmaz.
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,    // dev server tek instance
  retries: 1,
  workers: 1,
  reporter: process.env.CI ? 'github' : 'list',
  timeout: 30000,
  expect: { timeout: 5000 },
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    headless: true,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run dev:vite',
    port: 5173,
    reuseExistingServer: true,
    timeout: 120000,
  },
});
