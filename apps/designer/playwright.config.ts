import { existsSync } from 'node:fs';

import { chromium, defineConfig, devices } from '@playwright/test';

/**
 * Designer E2E (P-005). Runs the SAME shipped build via `vite preview` (matches
 * turbo `test:e2e` `dependsOn: ['build']` and the CI build→e2e order), Chromium,
 * headless. The app boots in test mode (no native dialogs) because the fixture sets
 * `window.CG_E2E` before app JS — see `tests/e2e/fixtures/designer.ts`.
 *
 * Local: `pnpm test:e2e` (turbo builds first) starts a FRESH preview of that build;
 * export `PW_REUSE_SERVER=1` to keep one running for fast iteration. CI: a separate
 * `e2e` job builds, caches the browser, then runs this.
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

/**
 * How many Playwright workers this suite may run — P-034.
 *
 * CI stays at 1 (unchanged, and it wins outright). Locally the number comes from
 * `CG_E2E_WORKERS`, which `tools/gate-hook/src/bounded-turbo-cli.mjs` computes so that
 * `turboTaskConcurrency × workersPerSuite` fits the box; the arithmetic and its
 * invariant live there, with unit tests, and this file only reads the answer.
 *
 * Unset means an ISOLATED run — `pnpm --filter @cg/designer test:e2e`, or a hand-typed
 * `playwright test` — which is not contended and keeps Playwright's own default. That
 * is the same reasoning as the vitest half: the hazard is the PRODUCT of two fan-outs,
 * so capping a single-suite run would cost time and buy nothing.
 */
function resolveWorkers(): number | undefined {
  if (process.env.CI) return 1;
  const bounded = Number(process.env.CG_E2E_WORKERS);
  return Number.isInteger(bounded) && bounded >= 1 ? bounded : undefined;
}

/**
 * 🔴 `P-038` — the CI budget for THIS suite. The reasoning, the measurements and the
 * shared-cap arithmetic live once, in `apps/runtime/playwright.config.ts`; this is the
 * other half of the SAME sum and is meaningless read alone.
 *
 * 11 min here + 5 min there = 16 min, against ~17.4 min of usable room inside the job's
 * `timeout-minutes: 20`. This suite measures 6.3 min green and must also cover its own
 * 120 s `webServer` boot, so 11 min is ~30 % headroom over a realistic worst case.
 * **Raise this and you must lower the runtime budget by the same amount.**
 */
const CI_GLOBAL_TIMEOUT_MS = 11 * 60_000;

export default defineConfig({
  globalTimeout: process.env.CI ? CI_GLOBAL_TIMEOUT_MS : undefined,
  // P-036 — refuse to run against a stale build. See tools/gate-hook/src/e2e-staleness.mjs.
  globalSetup: './tests/e2e-global-setup.mjs',
  testDir: './tests/e2e',
  testMatch: '**/*.spec.ts',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: resolveWorkers(),
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
    // B-073 — do NOT silently adopt whatever is already on PORT. `reuseExistingServer`
    // used to be on for every local run, so an ORPHANED `vite preview` left over from an
    // EARLIER build kept serving a stale `dist/` — the suite then tested old code and the
    // same commit passed or failed depending on which server happened to be listening
    // (the "identical runs, different results" flake). Default to a fresh preview of the
    // build turbo just produced; `--strictPort` makes an occupied port a LOUD failure
    // instead of a silent stale serve. Opt back in with PW_REUSE_SERVER=1 for fast
    // iteration when you know the running server matches your build.
    reuseExistingServer: process.env.PW_REUSE_SERVER === '1',
    timeout: 120_000,
  },
});
