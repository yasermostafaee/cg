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

  // P-034 — the Playwright half of the same bound. Kept in this one declaration
  // because it lives in that one module; a second .d.ts would be the second
  // spelling this change exists to remove.
  export function readConcurrencyFlag(args: readonly string[]): number | null;
  export function defaultPlaywrightWorkers(cores: unknown): number;
  export function resolveE2eWorkers(
    cores: unknown,
    taskConcurrency: unknown,
    override?: unknown,
  ): number;
  export function e2eWorkerEnv(workersPerTask: number): Record<string, string>;
}
