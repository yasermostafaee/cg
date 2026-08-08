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
  export function isKnownNonRenderPath(path: string): boolean;
  export function affectsRender(path: string): boolean;
  export const UI_RENDER_PATTERNS: readonly RegExp[];
  export const NON_RENDER_PATTERNS: readonly RegExp[];
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
  export const E2E_OPT_IN_ENV: string;
  export function localE2eOptIn(env?: Record<string, string | undefined>): boolean;
  export function commandsFor(
    classification: Classification,
    options?: { localE2e?: boolean },
  ): string[];
  export function e2eReminderFor(classification: Classification): string | null;
}
