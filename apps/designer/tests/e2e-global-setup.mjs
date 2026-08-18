import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertFreshBuild, bundleInputDirs } from '../../../tools/gate-hook/src/e2e-staleness.mjs';

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
const repoRoot = path.resolve(app, '..', '..');

export default function globalSetup() {
  assertFreshBuild({
    label: '@cg/designer',
    distDir: path.join(app, 'dist'),
    /*
      What the bundle is built FROM — the app's own sources AND every workspace
      package it depends on, resolved TRANSITIVELY from the dependency graph
      (`bundleInputDirs`).

      Not a hand-kept list of packages: the next package added is exactly the one
      nobody remembers to add, and the guard would go quiet where it is newest.
      `tests/` is deliberately absent at every level — a spec is loaded from source
      by Playwright, never bundled, so editing one does not make a build stale.
    */
    inputDirs: bundleInputDirs({ appDir: app, repoRoot }),
  });
}
