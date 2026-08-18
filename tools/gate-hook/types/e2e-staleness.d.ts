/**
 * P-036 — the typed surface of `../src/e2e-staleness.mjs` (plain zero-dep ESM, no
 * build). The wildcard specifier lets the tests import the .mjs by relative path
 * while `tsc` checks every call against this contract; if the module's API
 * drifts, update BOTH files in the same change. Mirrors the
 * `pre-push-decision.d.ts` convention.
 */
declare module '*e2e-staleness.mjs' {
  /** A file and its mtime, as the newest thing found under a root. */
  export interface NewestFile {
    path: string | null;
    ms: number;
  }
  /** Newest mtime under `root`, or null when the path does not exist. */
  export function newestMtime(root: string, out?: NewestFile): NewestFile | null;

  export interface StalenessVerdict {
    stale: boolean;
    reason: 'missing' | 'no-inputs' | 'older-than-source' | 'fresh';
    file: string | null;
    behindMs: number;
  }
  /** The pure verdict: is the build older than the newest input? */
  export function decideStaleness(input: {
    distNewestMs: number | null;
    inputNewest: NewestFile | null;
  }): StalenessVerdict;

  /** Throw unless `distDir` is at least as new as everything in `inputDirs`. */
  export function assertFreshBuild(options: {
    label: string;
    distDir: string;
    inputDirs: readonly string[];
    escape?: string;
  }): void;
}
