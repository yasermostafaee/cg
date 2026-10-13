/**
 * P-035 — the typed surface of `../src/never-stage-decision.mjs` (plain zero-dep
 * ESM, no build). The wildcard specifier lets the tests import the .mjs by
 * relative path while `tsc` checks every call against this contract; if the
 * module's API drifts, update BOTH files in the same change. Mirrors the
 * `pre-push-decision.d.ts` convention.
 */
declare module '*never-stage-decision.mjs' {
  /** One list line → a RegExp over a repo-relative, forward-slashed path. */
  export function patternToRegExp(pattern: string): RegExp;
  /** The list, comments and blanks stripped. */
  export function readPatterns(text: string): string[];
  /** Which of `stagedPaths` the `patterns` forbid. Empty ⇒ the commit may proceed. */
  export function offendingPaths(
    stagedPaths: readonly string[],
    patterns: readonly string[],
  ): string[];
}
