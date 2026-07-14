import { describe, expect, it } from 'vitest';
import { ESLint } from 'eslint';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

/**
 * B-071 — `pnpm turbo run lint build` runs `@cg/designer`'s `build` and `lint`
 * CONCURRENTLY. While loading its config, Vite writes a transient
 * `vite.config.ts.timestamp-<hash>.mjs` next to the config and deletes it moments
 * later. ESLint's traversal could enumerate that file and then fail to read it (already
 * gone) → `ENOENT`, aborting the lint task. The source was never at fault: it is a pure
 * filesystem race between two concurrent turbo tasks.
 *
 * The fix is a GLOBAL ignore (a config object whose only key is `ignores`, so it applies
 * during traversal rather than being scoped to matched files). This asserts the BEHAVIOR
 * via ESLint's own resolver — `isPathIgnored` lints nothing, so it stays fast — instead
 * of shelling out to a full `eslint .` run.
 */

// The app root (apps/designer), where eslint.config.mjs lives.
const cwd = resolve(dirname(fileURLToPath(import.meta.url)), '..');

describe('B-071 — ESLint ignores Vite’s transient vite.config timestamp file', () => {
  it("does not glob Vite's transient vite.config.ts.timestamp-*.mjs", async () => {
    const eslint = new ESLint({ cwd });
    expect(await eslint.isPathIgnored('vite.config.ts.timestamp-1699999999999-abc.mjs')).toBe(true);
    // A second, differently-hashed instance — the pattern is a glob, not one literal name.
    expect(
      await eslint.isPathIgnored('vite.config.ts.timestamp-1752499200000-0.deadbeef.mjs'),
    ).toBe(true);
  });

  it('still lints real source files (the ignore is narrow, not a blanket)', async () => {
    const eslint = new ESLint({ cwd });
    expect(await eslint.isPathIgnored('src/renderer/main.tsx')).toBe(false);
    expect(await eslint.isPathIgnored('vite.config.ts')).toBe(false);
  });
});
