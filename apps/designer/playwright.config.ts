import { existsSync } from 'node:fs';

import { chromium, defineConfig, devices } from '@playwright/test';

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

/**
 * Which browser binary Chromium runs against.
 *
 * - Explicit `PW_CHANNEL` always wins (e.g. `PW_CHANNEL=msedge`).
 * - CI runs the pinned, bundled Chromium — never auto-switch to a system browser,
 *   so the gate stays on the exact version `playwright install` pinned.
 * - Locally we AUTO-fall-back to system Chrome (`channel: 'chrome'`) when the bundled
 *   Chromium isn't installed. Playwright's browser CDN is geo-blocked from some
 *   locations (HTTP 403 "this service is not available in your location"), so the
 *   bundled download can't run there; this lets `pnpm test:e2e` work out of the box
 *   without anyone exporting `PW_CHANNEL` each time. See CLAUDE.md "E2E coverage".
 */
function resolveChannel(): string | undefined {
  if (process.env.PW_CHANNEL) return process.env.PW_CHANNEL;
  if (process.env.CI) return undefined;
  try {
    if (existsSync(chromium.executablePath())) return undefined;
  } catch {
    // executablePath() throws when no Chromium is registered → fall back below.
  }
  return 'chrome';
}

const channel = resolveChannel();

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
  // `channel` is resolved above: unset in CI (pinned bundled Chromium) and when the
  // bundled browser is present locally; falls back to system Chrome locally when it
  // isn't (geo-blocked CDN). Override with `PW_CHANNEL=chrome|msedge`.
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], channel },
    },
  ],
  webServer: {
    command: `pnpm exec vite preview --port ${String(PORT)} --strictPort`,
    url: `http://127.0.0.1:${String(PORT)}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
