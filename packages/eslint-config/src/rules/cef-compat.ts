/**
 * B-066 — the CEF compatibility baseline for everything CasparCG loads.
 *
 * CasparCG's HTML producer is CEF, NOT a modern browser. The oldest
 * supported CasparCG (2.3 LTS) ships CEF ≈ **Chromium 71** — the repo's
 * declared floor (the IIFE bundle target and the exporter's CSS-compat
 * comment both pin it). esbuild `target` down-levels SYNTAX only: built-in
 * METHODS newer than the baseline pass straight through a
 * correctly-targeted bundle — which is exactly how a
 * `String.prototype.replaceAll` (Chromium 85+) call shipped inside a
 * chrome71-targeted bundle and aborted every Persian template at boot on
 * air (B-066).
 *
 * TWO enforcement layers share THIS one curated list:
 *  1. the `cefCompat` lint rules below — flag the offending SOURCE line in
 *     the CasparCG-facing packages during dev;
 *  2. `@cg/single-file-export`'s `cef-compat.test.ts` — scans the exact
 *     EMITTED bundle artifacts via each entry's `needles`, catching
 *     offenders inside bundled dependencies that lint can't see.
 *
 * Name-based matching (any `.replaceAll(` call, receiver-blind) is
 * deliberate paranoia for a compat gate; a genuinely-safe exception can
 * disable the rule locally with a justifying comment.
 *
 * Under-baseline built-ins that stay ALLOWED (for the record):
 * `flat`/`flatMap` (69), `trimStart`/`trimEnd` (66), `globalThis` (71),
 * `queueMicrotask` (71).
 */
export const CEF_CHROMIUM_BASELINE = 71;

export interface CefBannedBuiltin {
  /** Human name, e.g. `String.prototype.replaceAll`. */
  name: string;
  /** First Chromium version shipping it (all > {@link CEF_CHROMIUM_BASELINE}). */
  minChromium: number;
  /** Textual needles the bundle-artifact scan looks for. */
  needles: readonly string[];
  /** esquery selector(s) for the lint rule. */
  selectors: readonly string[];
}

export const CEF_BANNED_BUILTINS: readonly CefBannedBuiltin[] = [
  {
    name: 'String.prototype.replaceAll',
    minChromium: 85,
    needles: ['.replaceAll('],
    selectors: ["CallExpression[callee.property.name='replaceAll']"],
  },
  {
    name: 'String/Array.prototype.at',
    minChromium: 92,
    needles: ['.at('],
    selectors: ["CallExpression[callee.property.name='at']"],
  },
  {
    name: 'Array.prototype.findLast',
    minChromium: 97,
    needles: ['.findLast('],
    selectors: ["CallExpression[callee.property.name='findLast']"],
  },
  {
    name: 'Array.prototype.findLastIndex',
    minChromium: 97,
    needles: ['.findLastIndex('],
    selectors: ["CallExpression[callee.property.name='findLastIndex']"],
  },
  {
    name: 'String.prototype.matchAll',
    minChromium: 73,
    needles: ['.matchAll('],
    selectors: ["CallExpression[callee.property.name='matchAll']"],
  },
  {
    name: 'Object.hasOwn',
    minChromium: 93,
    needles: ['Object.hasOwn'],
    selectors: ["MemberExpression[object.name='Object'][property.name='hasOwn']"],
  },
  {
    name: 'Object.fromEntries',
    minChromium: 73,
    needles: ['Object.fromEntries'],
    selectors: ["MemberExpression[object.name='Object'][property.name='fromEntries']"],
  },
  {
    name: 'Promise.allSettled',
    minChromium: 76,
    needles: ['Promise.allSettled'],
    selectors: ["MemberExpression[object.name='Promise'][property.name='allSettled']"],
  },
  {
    name: 'Promise.any',
    minChromium: 85,
    needles: ['Promise.any('],
    selectors: ["MemberExpression[object.name='Promise'][property.name='any']"],
  },
  {
    name: 'structuredClone',
    minChromium: 98,
    needles: ['structuredClone('],
    selectors: ["CallExpression[callee.name='structuredClone']"],
  },
];

/** The `no-restricted-syntax` entries enforcing the banned list. */
export function cefCompatSyntaxRestrictions(): (string | { selector: string; message: string })[] {
  return CEF_BANNED_BUILTINS.flatMap((banned) =>
    banned.selectors.map((selector) => ({
      selector,
      message:
        `${banned.name} is Chromium ${String(banned.minChromium)}+ — CasparCG's CEF baseline is ` +
        `Chromium ${String(CEF_CHROMIUM_BASELINE)} (2.3 LTS) and esbuild targets do NOT ` +
        `down-level built-in methods (B-066). Use a baseline-safe equivalent.`,
    })),
  );
}
