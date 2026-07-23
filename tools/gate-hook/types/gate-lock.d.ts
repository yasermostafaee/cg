/**
 * P-013 — the typed surface of `../src/gate-lock.mjs` (plain ESM, no build step). The
 * wildcard specifier lets the tests import the .mjs by relative path while `tsc` checks
 * every call against this contract; if the module's API drifts, update BOTH files in the
 * same change. Mirrors the `test-concurrency.d.ts` (B-098) convention.
 */
declare module '*gate-lock.mjs' {
  /** The stable, host-global lock resource base name. */
  export const HOST_LOCK_BASENAME: string;

  export interface LockConfig {
    /** Max age before a lock is considered abandoned and may be stolen. */
    staleMs: number;
    /** How long a waiter blocks before giving up and erroring. */
    waitTimeoutMs: number;
    /** How often a blocked waiter re-tries the lock. */
    pollIntervalMs: number;
  }

  export interface LockOptions {
    stale: number;
    realpath: boolean;
    retries: number;
    onCompromised: (err: unknown) => void;
  }

  /** Side effects injected into {@link acquireLock}, so its loop is testable. */
  export interface AcquireDeps {
    lock: (resource: string) => Promise<() => Promise<void>>;
    sleep: (ms: number) => Promise<void>;
    now: () => number;
    log?: (message: string) => void;
  }

  export interface RunUnderLockArgs {
    resource: string;
    config: LockConfig;
    run: () => Promise<{ code: number }>;
    log?: (message: string) => void;
    loadLockfile?: () => Promise<{
      lock: (resource: string, options?: unknown) => Promise<() => Promise<void>>;
    } | null>;
    sleep?: (ms: number) => Promise<void>;
    now?: () => number;
  }

  export class GateLockTimeoutError extends Error {
    constructor(waitTimeoutMs: number);
  }

  export function hostLockPath(tmpDir: string): string;
  export function resolveLockConfig(env?: Record<string, string | undefined>): LockConfig;
  export function isLockHeldError(err: unknown): boolean;
  export function lockOptions(
    config: { staleMs: number },
    onCompromised?: (err: unknown) => void,
  ): LockOptions;
  export function acquireLock(
    deps: AcquireDeps,
    resource: string,
    config: { waitTimeoutMs: number; pollIntervalMs: number },
  ): Promise<() => Promise<void>>;
  export function runUnderLock(args: RunUnderLockArgs): Promise<{ code: number }>;
}
