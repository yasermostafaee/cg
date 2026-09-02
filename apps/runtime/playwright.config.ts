import { existsSync } from 'node:fs';

import { chromium, defineConfig, devices } from '@playwright/test';

/**
 * Runtime E2E (R-001). The Runtime's first Playwright harness. Runs the SAME
 * shipped build via `vite preview` (matches turbo `test:e2e`
 * `dependsOn: ['build']` and the CI build→e2e order), Chromium, headless. The
 * app boots in test mode because the fixture sets `window.CG_E2E` before app JS
 * — see `tests/e2e/fixtures/runtime.ts`.
 *
 * Local: `pnpm test:e2e` (turbo builds first) starts a FRESH preview of that build;
 * export `PW_REUSE_SERVER=1` to keep one running for fast iteration. Mirrors the
 * Designer config.
 */
const PORT = 4174;

/**
 * Which browser binary Chromium runs against.
 *
 * - Explicit `PW_CHANNEL` always wins (e.g. `PW_CHANNEL=msedge`).
 * - CI runs the pinned, bundled Chromium — never auto-switch to a system
 *   browser, so the gate stays on the exact version `playwright install` pinned.
 * - Locally we AUTO-fall-back to system Chrome (`channel: 'chrome'`) when the
 *   bundled Chromium isn't installed (Playwright's browser CDN is geo-blocked
 *   from some locations, HTTP 403). See CLAUDE.md "E2E coverage".
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
 * How many Playwright workers this suite may run — P-034. Mirrors the Designer config:
 * CI stays at 1, an isolated run keeps Playwright's default, and a turbo-orchestrated
 * run takes the bound `tools/gate-hook/src/bounded-turbo-cli.mjs` exports. See that
 * file's `resolveE2eWorkers` for the arithmetic — a bare `turbo run test:e2e` used to
 * start both apps' suites at full width at once, and every test it broke was an
 * animate-within-N-milliseconds assertion.
 */
function resolveWorkers(): number | undefined {
  if (process.env.CI) return 1;
  const bounded = Number(process.env.CG_E2E_WORKERS);
  return Number.isInteger(bounded) && bounded >= 1 ? bounded : undefined;
}

/**
 * 🔴 `P-038` — THE SUITE MUST OUTLIVE ITS OWN OVERRUN LONG ENOUGH TO REPORT IT.
 *
 * Without this, a Runtime suite that overruns is killed by the CI job's
 * `timeout-minutes: 20` (`.github/workflows/pr.yml`), and turbo — which buffers a task's
 * output until the task COMPLETES — never flushes a line of it. A RED suite and a SLOW
 * suite then produce byte-identical evidence: job conclusion `cancelled`, zero runtime
 * output, and nothing to tell them apart. Measured three times (runs 33632277519
 * attempts 1 and 2, and 33637419829): 12 minutes of silence, then `The operation was
 * canceled`. Eleven genuinely failing specs rode two pushes looking exactly like flake.
 *
 * A `globalTimeout` BELOW the job cap makes Playwright itself end the run: it exits 1
 * with a summary, so the job concludes `failure` and names what failed. The cap stops
 * being the thing that decides.
 *
 * ⚠ **THE TWO SUITES SHARE ONE JOB, so their budgets must SUM under the cap.** CI runs
 * them SERIALLY (`bounded-turbo-cli` computes 1 concurrent task on the 4-vCPU runner), so
 * the arithmetic is 20 min cap − ~1.6 min setup − ~1 min build = ~17.4 min for both.
 * Designer takes 11 of it, this suite 5, leaving ~1.4 min of margin. Measured green
 * times are 6.3 min (designer) and 1.8 min (runtime), and each budget must also cover
 * this config's own 120 s `webServer` boot — so 5 min here is ~30 % headroom over a
 * realistic worst case of 2 min boot + 1.8 min tests. **Raise one and you must lower the
 * other**, or the cap fires first and the evidence goes back to being unreadable.
 */
const CI_GLOBAL_TIMEOUT_MS = 5 * 60_000;

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
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], channel },
    },
  ],
  webServer: {
    command: `pnpm exec vite preview --port ${String(PORT)} --strictPort`,
    url: `http://127.0.0.1:${String(PORT)}`,
    // B-073 — never adopt an orphaned server serving a stale `dist/` (see the Designer
    // config for the full rationale). Fresh preview by default; `--strictPort` fails loudly
    // on an occupied port. PW_REUSE_SERVER=1 opts back into reuse for fast iteration.
    reuseExistingServer: process.env.PW_REUSE_SERVER === '1',
    timeout: 120_000,
  },
});
