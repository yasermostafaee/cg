/**
 * P-013 — the host-wide gate lock. Enforces the standing rule "never two gates running
 * concurrently on this host" (P-010 calls it "this host's exclusive gate slot") with a
 * MECHANISM instead of discipline, and in doing so closes the pre-push/Stop-hook
 * double-fire: a push fires `.husky/pre-push` → `pnpm gate` at the same moment a turn
 * end fires `.claude/hooks/gate-stop.mjs` → `pnpm gate`, two gates land in the same
 * worktree at once, and they race on vitest's shared coverage `.tmp/` dir — the exact
 * `ENOENT` that reads like a product regression (B-097).
 *
 * The lock is the OUTER layer. It WRAPS B-098's `bounded-turbo-cli` (host serialization),
 * it does NOT replace it (intra-gate concurrency bound). Both are load controls at
 * different scopes: this one bounds how many gates run at once on the machine; B-098
 * bounds how many test workers ONE gate may fan out to.
 *
 * Where it is applied — the single chokepoint, not each call site. Every gate entry
 * point (a direct `pnpm gate`, the pre-push hook, the Stop hook, `pnpm gate:e2e`) funnels
 * through the `gate` / `gate:e2e` package.json scripts, so wrapping THOSE serializes all
 * of them through ONE lock implementation. Wrapping each caller separately would be a
 * second (and eventually a third) copy of the same rule — precisely the "one canonical
 * predicate, never a local re-derivation" hazard CLAUDE.md rule 6 and P-012 exist to
 * forbid. One wrap, one place.
 *
 * NOT zero-dependency, unlike its `gate-hook` siblings (`gate-decision`,
 * `pre-push-decision`, `test-concurrency`), and deliberately so: those run the DECISION
 * about whether/what to gate and must work on a fresh clone before `pnpm install`. This
 * module runs the gate ITSELF, which cannot run without `node_modules` present anyway
 * (turbo, vitest, prettier, openspec) — so it may lean on an installed package. It uses
 * `proper-lockfile` (cross-platform stale + compromised-lock handling) rather than
 * hand-rolling PID files, loaded via dynamic import so a missing dep DEGRADES to an
 * unserialized run rather than crashing the sole enforcement mechanism (see below).
 *
 * The PURE parts — path, config, the wait/timeout decision, the acquire loop with its
 * side effects injected — live here and are unit-tested directly. The CLI next door
 * (`gate-lock-cli.mjs`) is plumbing: detect tmpdir, spawn the gate as a child, forward
 * the exit code. The genuine two-process serialization is proved by the scripted check
 * in `../scripts/two-process-lock-check.mjs`.
 */

import { join } from 'node:path';

/**
 * The lock resource base name. Fixed and host-global on purpose: the three worktrees
 * (`cg`, `cg-designer`, `cg-runtime`) share ONE machine and must serialize against each
 * other, so the path lives under the OS temp dir — outside any worktree — where all
 * three resolve to the same file. A per-worktree path would let them run concurrently,
 * which is the whole thing this prevents. `proper-lockfile` appends `.lock`, so the
 * on-disk artifact is `<tmpdir>/cg-platform-gate.lock/`.
 */
export const HOST_LOCK_BASENAME = 'cg-platform-gate';

/**
 * Max age before a lock is considered abandoned and may be stolen. `proper-lockfile`
 * refreshes the holder's mtime every `stale/2` while it is alive, so a LIVE gate — even
 * a slow `gate:e2e` (~6 min) or a CPU-starved one — never goes stale; only a crashed or
 * `kill -9`'d holder does, and then this is how long until the next waiter reclaims it.
 * Kept well BELOW the wait timeout so a dead holder is always reclaimed inside the wait
 * window rather than deadlocking the host.
 */
const DEFAULT_STALE_MS = 5 * 60 * 1000;

/**
 * How long a waiter blocks for the slot before giving up and erroring. Generous — a
 * legitimate gate ahead of it takes 2–6 min — but finite, so a genuinely stuck gate
 * surfaces as a clear error instead of an infinite hang.
 */
const DEFAULT_WAIT_TIMEOUT_MS = 15 * 60 * 1000;

/** How often a blocked waiter re-tries the lock. */
const DEFAULT_POLL_INTERVAL_MS = 750;

/**
 * The host-global lock resource path for a given temp directory. Pure so a test can
 * assert it lands under the temp dir (never inside a worktree) with the stable name.
 *
 * @param {string} tmpDir the OS temp directory (`os.tmpdir()` at the call site)
 * @returns {string}
 */
export function hostLockPath(tmpDir) {
  return join(String(tmpDir), HOST_LOCK_BASENAME);
}

/**
 * Coerce a value to a positive integer, or return the fallback. Shared by every config
 * override so a malformed env var can never widen a bound or zero out a timeout.
 *
 * @param {unknown} value
 * @param {number} fallback
 * @returns {number}
 */
function positiveIntOr(value, fallback) {
  if (value === null || value === undefined || value === '') return fallback;
  const n = Number(value);
  return Number.isFinite(n) && Number.isInteger(n) && n > 0 ? n : fallback;
}

/**
 * Resolve the lock timing config, honoring `CG_GATE_LOCK_*` env overrides. The overrides
 * exist mainly so the scripted two-process check can run in seconds instead of minutes;
 * an unusable value falls back to the default rather than to zero or infinity.
 *
 * @param {Record<string, string | undefined>} [env]
 * @returns {{ staleMs: number, waitTimeoutMs: number, pollIntervalMs: number }}
 */
export function resolveLockConfig(env = {}) {
  return {
    staleMs: positiveIntOr(env.CG_GATE_LOCK_STALE_MS, DEFAULT_STALE_MS),
    waitTimeoutMs: positiveIntOr(env.CG_GATE_LOCK_WAIT_MS, DEFAULT_WAIT_TIMEOUT_MS),
    pollIntervalMs: positiveIntOr(env.CG_GATE_LOCK_POLL_MS, DEFAULT_POLL_INTERVAL_MS),
  };
}

/**
 * Is this the error `proper-lockfile` throws when the lock is already held by someone
 * else? That case means "wait"; anything else means "this is a real failure".
 *
 * @param {unknown} err
 * @returns {boolean}
 */
export function isLockHeldError(err) {
  return Boolean(err) && typeof err === 'object' && 'code' in err && err.code === 'ELOCKED';
}

/**
 * Thrown when a waiter blocks for the full wait timeout without ever getting the slot.
 * Distinct type so the CLI can tell "a gate is stuck, surface it" (fatal) apart from an
 * incidental lock failure (degrade to an unserialized run).
 */
export class GateLockTimeoutError extends Error {
  /** @param {number} waitTimeoutMs */
  constructor(waitTimeoutMs) {
    super(
      `gate-lock: timed out after ${Math.round(waitTimeoutMs / 1000)}s waiting for the host gate slot`,
    );
    this.name = 'GateLockTimeoutError';
  }
}

/**
 * The `proper-lockfile` options for this lock. Pure so a test can pin the contract:
 * mtime-based staleness (portable, no PID guessing), `realpath: false` because the
 * resource is a placeholder path that need not exist, and no internal retries — the
 * wait loop below owns retrying so it can announce and time out on its own terms.
 *
 * @param {{ staleMs: number }} config
 * @param {(err: unknown) => void} [onCompromised]
 * @returns {{ stale: number, realpath: boolean, retries: number, onCompromised: (err: unknown) => void }}
 */
export function lockOptions(config, onCompromised) {
  return {
    stale: config.staleMs,
    realpath: false,
    retries: 0,
    onCompromised:
      onCompromised ??
      ((err) => {
        throw err;
      }),
  };
}

/**
 * Acquire the lock, WAITING while it is held by another gate. Every side effect is
 * injected so the whole loop is unit-testable without a filesystem or a clock:
 *
 *   - `lock(resource)` resolves to a release function, or rejects `ELOCKED` when held;
 *   - `sleep(ms)` and `now()` drive the poll/timeout with no real time passing;
 *   - `log(msg)` announces the wait exactly ONCE, so a blocked gate says why it is idle.
 *
 * A non-`ELOCKED` rejection is re-thrown immediately — it is not contention, so waiting
 * on it would be waiting on a real failure. A held lock is retried until acquired or the
 * wait timeout elapses, at which point it throws {@link GateLockTimeoutError}.
 *
 * @param {{ lock: (resource: string) => Promise<() => Promise<void>>, sleep: (ms: number) => Promise<void>, now: () => number, log?: (message: string) => void }} deps
 * @param {string} resource
 * @param {{ waitTimeoutMs: number, pollIntervalMs: number }} config
 * @returns {Promise<() => Promise<void>>} the release function
 */
export async function acquireLock(deps, resource, config) {
  const { lock, sleep, now, log } = deps;
  const start = now();
  let announced = false;
  for (;;) {
    try {
      return await lock(resource);
    } catch (err) {
      if (!isLockHeldError(err)) throw err;
      if (now() - start >= config.waitTimeoutMs) throw new GateLockTimeoutError(config.waitTimeoutMs);
      if (!announced) {
        log?.('gate-lock: waiting for host gate slot…\n');
        announced = true;
      }
      await sleep(config.pollIntervalMs);
    }
  }
}

/** @returns {Promise<void>} */
const realSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const realNow = () => Date.now();

/**
 * Load `proper-lockfile` if present, else `null`. Dynamic so the sole enforcement
 * mechanism degrades gracefully — a stale `node_modules` or a botched install must not
 * make `pnpm gate` throw before it ever checks the push.
 *
 * @returns {Promise<{ lock: (resource: string, options?: unknown) => Promise<() => Promise<void>> } | null>}
 */
async function defaultLoadLockfile() {
  try {
    const mod = await import('proper-lockfile');
    return mod.default ?? mod;
  } catch {
    return null;
  }
}

/**
 * Run `run()` while holding the host gate lock, releasing it on completion — success,
 * failure, or throw. This is the whole public entry point the CLI calls.
 *
 * Fail-safety is deliberate and asymmetric, because while GitHub Actions billing is out
 * this gate is the ONLY landing gate and must not be defeated by its own lock:
 *
 *   - lock library missing            → warn, run WITHOUT serialization (still gates);
 *   - acquisition fails (non-timeout) → warn, run WITHOUT serialization (still gates);
 *   - wait times out (a stuck gate)   → THROW {@link GateLockTimeoutError} — do not run,
 *                                        surface it, because a 15-min-held slot is abnormal;
 *   - our held lock is compromised    → shout, keep running (losing a near-done gate is
 *                                        worse than the rare concurrent run it warns about).
 *
 * @param {{ resource: string, config: { staleMs: number, waitTimeoutMs: number, pollIntervalMs: number }, run: () => Promise<{ code: number }>, log?: (message: string) => void, loadLockfile?: () => Promise<{ lock: (resource: string, options?: unknown) => Promise<() => Promise<void>> } | null>, sleep?: (ms: number) => Promise<void>, now?: () => number }} args
 * @returns {Promise<{ code: number }>} whatever `run()` returned
 */
export async function runUnderLock(args) {
  const { resource, config, run, log } = args;
  const loadLockfile = args.loadLockfile ?? defaultLoadLockfile;
  const sleep = args.sleep ?? realSleep;
  const now = args.now ?? realNow;

  const lib = await loadLockfile();
  if (!lib || typeof lib.lock !== 'function') {
    log?.(
      'gate-lock: proper-lockfile unavailable — running the gate WITHOUT host serialization\n',
    );
    return run();
  }

  const onCompromised = (err) => {
    log?.(
      `gate-lock: WARNING host lock was compromised mid-gate (${err instanceof Error ? err.message : String(err)}). ` +
        'Another gate may be running concurrently on this host.\n',
    );
  };

  let release;
  try {
    release = await acquireLock(
      {
        lock: (res) => lib.lock(res, lockOptions(config, onCompromised)),
        sleep,
        now,
        log,
      },
      resource,
      config,
    );
  } catch (err) {
    if (err instanceof GateLockTimeoutError) throw err;
    log?.(
      `gate-lock: could not acquire the host slot (${err instanceof Error ? err.message : String(err)}) — ` +
        'running the gate WITHOUT host serialization\n',
    );
    return run();
  }

  try {
    return await run();
  } finally {
    try {
      await release();
    } catch {
      // A failed release is self-healing: the lock goes stale and the next waiter
      // reclaims it. Never let a release error mask the gate's own exit code.
    }
  }
}
