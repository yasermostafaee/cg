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

  /** Every workspace package, NAME → absolute directory (read from each manifest). */
  export function readWorkspacePackages(
    repoRoot: string,
    groups?: readonly string[],
  ): Map<string, string>;

  /**
   * The workspace packages `entryDir` depends on, TRANSITIVELY. Throws on a
   * `scope`d dependency that is not a workspace package — an unresolvable one must
   * never be indistinguishable from a fresh one.
   */
  export function resolveWorkspaceDeps(
    entryDir: string,
    byName: Map<string, string>,
    scope?: string,
  ): string[];

  /** Everything that can change what an app's bundle contains. */
  export function bundleInputDirs(options: { appDir: string; repoRoot: string }): string[];
}
