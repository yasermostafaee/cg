/**
 * B-098 — the typed surface of `../src/test-concurrency.mjs` (plain zero-dep ESM, no
 * build). The wildcard specifier lets the tests import the .mjs by relative path
 * while `tsc` checks every call against this contract; if the module's API drifts,
 * update BOTH files in the same change.
 */
declare module '*test-concurrency.mjs' {
  export interface TestBound {
    /** Cores the bound was computed against (1 when detection yields nothing usable). */
    cores: number;
    /** Vitest forks permitted per `test` task. */
    forksPerTask: number;
    /** Turbo tasks permitted in flight at once. */
    taskConcurrency: number;
    /** `taskConcurrency * forksPerTask` — the worst-case concurrent worker count. */
    maxTestWorkers: number;
    /** Cores set aside for workers; the rest is headroom for coordinators and the OS. */
    workerBudget: number;
  }
  export interface TestBoundOverrides {
    forksPerTask?: unknown;
    taskConcurrency?: unknown;
  }
  export function toPositiveInt(value: unknown): number | null;
  export function resolveTestBound(cores: unknown, overrides?: TestBoundOverrides): TestBound;
  export function applyConcurrencyFlag(args: readonly string[], concurrency: number): string[];
  export function testWorkerEnv(forksPerTask: number): Record<string, string>;
}
