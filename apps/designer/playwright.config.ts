import { defineConfig, devices } from '@playwright/test';

/**
 * Designer E2E (P-005). Runs the SAME shipped build via `vite preview` (matches
 * turbo `test:e2e` `dependsOn: ['build']` and the CI build→e2e order), Chromium,
 * headless. The app boots in test mode (no native dialogs) because the fixture sets
 * `window.CG_E2E` before app JS — see `tests/e2e/fixtures/designer.ts`.
 *
 * Local: `pnpm test:e2e` (turbo builds first); `reuseExistingServer` lets you keep a
 * `vite preview` running for fast iteration. CI: a separate `e2e` job builds, caches
 * the browser, then runs this.
 */
const PORT = 4321;

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/*.spec.ts',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  timeout: 30_000,
  expect: { timeout: 7_000 },
  use: {
    baseURL: `http://127.0.0.1:${String(PORT)}`,
    headless: true,
    trace: 'on-first-retry',
    video: 'off',
  },
  // CI installs the bundled Chromium (`playwright install --with-deps chromium`),
  // so `channel` is unset there. Locally, set `PW_CHANNEL=chrome` (or `msedge`) to
  // run against a system browser without downloading the bundled one.
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], channel: process.env.PW_CHANNEL || undefined },
    },
  ],
  webServer: {
    command: `pnpm exec vite preview --port ${String(PORT)} --strictPort`,
    url: `http://127.0.0.1:${String(PORT)}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
