import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertFreshBuild } from '../../../tools/gate-hook/src/e2e-staleness.mjs';

/**
 * P-036 — refuse an E2E run against a stale build.
 *
 * Wired as Playwright's `globalSetup` rather than into the package script, so it
 * catches EVERY entry point: `pnpm test:e2e` (turbo, which already builds),
 * `pnpm --filter @cg/designer test:e2e` (which does NOT), and a hand-typed
 * `pnpm exec playwright test`. They all end in this runner.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const app = path.resolve(here, '..');

export default function globalSetup() {
  assertFreshBuild({
    label: '@cg/designer',
    distDir: path.join(app, 'dist'),
    // What the bundle is built FROM. `tests/` is deliberately absent: a spec is
    // loaded from source by Playwright, never bundled, so editing one does not
    // make the build stale.
    inputDirs: [
      path.join(app, 'src'),
      path.join(app, 'index.html'),
      path.join(app, 'vite.config.ts'),
    ],
  });
}
