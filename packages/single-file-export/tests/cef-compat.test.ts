import { describe, expect, it } from 'vitest';
import { CEF_BANNED_BUILTINS, CEF_CHROMIUM_BASELINE } from '@cg/eslint-config';
import { cgJs, cgJsIife } from '../src/generated/cg-runtime-bundles.js';

/**
 * B-066 — the served bundle must run on CasparCG's CEF (baseline Chromium
 * ${CEF_CHROMIUM_BASELINE} = CasparCG 2.3 LTS), not a modern browser.
 * esbuild `target` lowers SYNTAX only; newer BUILT-IN METHODS (replaceAll
 * et al.) pass straight through a correctly-targeted bundle — which is
 * exactly how the live "replaceAll is not a function" boot abort shipped.
 *
 * This scans the EXACT emitted bundle artifacts (the strings CasparCG
 * executes), so it also covers bundled DEPENDENCIES (e.g. zod via
 * @cg/shared-schema) that the source-level compat lint cannot see. The
 * banned list is the same one the lint enforces — one curated list in
 * @cg/eslint-config.
 */

function occurrences(haystack: string, needle: string): number {
  let count = 0;
  let i = haystack.indexOf(needle);
  while (i !== -1) {
    count += 1;
    i = haystack.indexOf(needle, i + 1);
  }
  return count;
}

describe(`CEF compat — no built-ins newer than Chromium ${String(CEF_CHROMIUM_BASELINE)} in the emitted bundles`, () => {
  for (const [label, bundle] of [
    ['cgJs (ESM — the .vcg page)', cgJs],
    ['cgJsIife (IIFE — the single-file/served page)', cgJsIife],
  ] as const) {
    it(`${label} contains none of the banned built-ins`, () => {
      const hits: string[] = [];
      for (const banned of CEF_BANNED_BUILTINS) {
        for (const needle of banned.needles) {
          const n = occurrences(bundle, needle);
          if (n > 0) {
            hits.push(
              `${banned.name} (Chromium ${String(banned.minChromium)}+): "${needle}" ×${String(n)}`,
            );
          }
        }
      }
      expect(hits, `banned built-ins found in ${label}:\n  ${hits.join('\n  ')}`).toEqual([]);
    });
  }
});
