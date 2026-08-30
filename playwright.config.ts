import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  // Assumes `pnpm dev` (plus docker compose) is already running locally,
  // matching how every other verification in this project has been run —
  // no webServer auto-start, to avoid a second server racing migrations.
});
