/**
 * P-009 — the typed surface of `../src/gate-decision.mjs` (plain zero-dep ESM, no
 * build). The wildcard specifier lets the tests import the .mjs by relative path
 * while `tsc` checks every call against this contract; if the module's API drifts,
 * update BOTH files in the same change.
 */
declare module '*gate-decision.mjs' {
  export function normalizePath(p: string): string;
  export function parsePorcelain(stdout: string): string[];
  export function parseNameOnly(stdout: string): string[];
  export function isDocsPath(path: string): boolean;
  export function isUiRenderPath(path: string): boolean;
  export const UI_RENDER_PATTERNS: readonly RegExp[];
  export const DIFF_BASE_REFS: readonly string[];
  export function pickDiffBaseRef(
    resolves: (ref: string) => boolean,
    refs?: readonly string[],
  ): string | null;
  export interface GitResult {
    status: number | null;
    stdout?: string;
  }
  export function collectChangedPaths(git: (args: readonly string[]) => GitResult): string[] | null;
  export interface Classification {
    kind: 'empty' | 'docs-only' | 'code';
    needsE2e: boolean;
  }
  export function classifyChangedSet(paths: readonly string[]): Classification;
  export function nextAttempt(prevContent: string | null | undefined): number;
  export function commandsFor(classification: Classification): string[];
}
