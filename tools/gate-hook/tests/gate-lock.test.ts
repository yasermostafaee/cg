import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';
import {
  acquireLock,
  GateLockTimeoutError,
  HOST_LOCK_BASENAME,
  hostLockPath,
  isLockHeldError,
  lockOptions,
  resolveLockConfig,
  runUnderLock,
} from '../src/gate-lock.mjs';

/**
 * P-013 — the host-wide gate lock. The CLI beside it is plumbing (detect tmpdir, spawn
 * the gate, forward the exit code), so everything worth trusting is here.
 *
 * The claim this suite defends is that the lock actually SERIALIZES: a second gate waits
 * while the first holds the slot, and the slot is always released — on success, on
 * failure, and on a wait timeout. Two layers of proof:
 *   - the acquire/wait/timeout/release LOGIC, with time and the filesystem injected, so
 *     it is deterministic and fast; and
 *   - one real `proper-lockfile` round-trip, proving the wiring genuinely holds and frees
 *     a lock on disk. Cross-PROCESS serialization is proved separately by the scripted
 *     `../scripts/two-process-lock-check.mjs`.
 */

/** A no-op async fn with a (non-empty) body — a bare `async () => {}` trips no-empty-function. */
const noopAsync = (): Promise<void> => Promise.resolve();

/** The error `proper-lockfile` throws when the resource is already locked. */
function heldError(): Error & { code: string } {
  const err = new Error('Lock file is already being held') as Error & { code: string };
  err.code = 'ELOCKED';
  return err;
}

/** A fake clock whose time only advances when the code under test `sleep`s. */
function fakeClock(startMs = 0) {
  let t = startMs;
  return {
    now: () => t,
    sleep: async (ms: number) => {
      t += ms;
    },
  };
}

describe('hostLockPath', () => {
  it('places the lock under the given temp dir, outside any worktree', () => {
    expect(hostLockPath('/var/tmp')).toBe(join('/var/tmp', HOST_LOCK_BASENAME));
  });

  it('uses the stable host-global basename so all worktrees resolve to one lock', () => {
    const path = hostLockPath(tmpdir());
    expect(path.endsWith(HOST_LOCK_BASENAME)).toBe(true);
    expect(HOST_LOCK_BASENAME.length).toBeGreaterThan(0);
  });
});

describe('resolveLockConfig', () => {
  it('defaults to a stale window below the wait timeout, so a dead holder is reclaimable', () => {
    const cfg = resolveLockConfig({});
    expect(cfg.staleMs).toBeLessThan(cfg.waitTimeoutMs);
    expect(cfg.staleMs).toBeGreaterThan(0);
    expect(cfg.pollIntervalMs).toBeGreaterThan(0);
  });

  it('honors positive-integer env overrides', () => {
    expect(
      resolveLockConfig({
        CG_GATE_LOCK_STALE_MS: '1000',
        CG_GATE_LOCK_WAIT_MS: '5000',
        CG_GATE_LOCK_POLL_MS: '50',
      }),
    ).toEqual({ staleMs: 1000, waitTimeoutMs: 5000, pollIntervalMs: 50 });
  });

  it.each(['-5', '0', '1.5', 'abc', '', undefined])(
    'falls back to the default for the unusable override %p',
    (bad) => {
      const cfg = resolveLockConfig({ CG_GATE_LOCK_POLL_MS: bad });
      expect(cfg.pollIntervalMs).toBe(resolveLockConfig({}).pollIntervalMs);
    },
  );
});

describe('isLockHeldError', () => {
  it('is true only for an ELOCKED error', () => {
    expect(isLockHeldError(heldError())).toBe(true);
  });

  it.each([
    new Error('EACCES'),
    { code: 'EACCES' },
    { code: 'EEXIST' },
    null,
    undefined,
    'ELOCKED',
    42,
  ])('is false for %p', (value) => {
    expect(isLockHeldError(value)).toBe(false);
  });
});

describe('lockOptions', () => {
  it('pins the proper-lockfile contract: mtime staleness, no realpath, no internal retries', () => {
    const opts = lockOptions({ staleMs: 1234 });
    expect(opts.stale).toBe(1234);
    expect(opts.realpath).toBe(false);
    expect(opts.retries).toBe(0);
    expect(typeof opts.onCompromised).toBe('function');
  });

  it('passes a supplied onCompromised handler through', () => {
    const handler = vi.fn();
    lockOptions({ staleMs: 1 }, handler).onCompromised(new Error('x'));
    expect(handler).toHaveBeenCalledTimes(1);
  });
});

describe('GateLockTimeoutError', () => {
  it('is an Error whose message names the timeout in seconds', () => {
    const err = new GateLockTimeoutError(15 * 60 * 1000);
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('GateLockTimeoutError');
    expect(err.message).toContain('900s');
    expect(err.message).toContain('host gate slot');
  });
});

describe('acquireLock', () => {
  const config = { waitTimeoutMs: 60_000, pollIntervalMs: 100 };

  it('acquires immediately when the slot is free — no wait, no announcement', async () => {
    const release = vi.fn(noopAsync);
    const lock = vi.fn(async () => release);
    const sleep = vi.fn(noopAsync);
    const log = vi.fn();

    const got = await acquireLock({ lock, sleep, now: () => 0, log }, '/r', config);

    expect(got).toBe(release);
    expect(lock).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
  });

  it('waits while held, announces exactly once, then acquires', async () => {
    const release = vi.fn(noopAsync);
    let calls = 0;
    const lock = vi.fn(async () => {
      calls += 1;
      if (calls <= 3) throw heldError();
      return release;
    });
    const clock = fakeClock();
    const sleep = vi.fn(clock.sleep);
    const log = vi.fn();

    const got = await acquireLock({ lock, sleep, now: clock.now, log }, '/r', config);

    expect(got).toBe(release);
    expect(lock).toHaveBeenCalledTimes(4);
    expect(sleep).toHaveBeenCalledTimes(3);
    expect(log).toHaveBeenCalledTimes(1);
    expect(String(log.mock.calls[0]?.[0])).toContain('waiting for host gate slot');
  });

  it('throws GateLockTimeoutError when the slot never frees within the window', async () => {
    const lock = vi.fn(async () => {
      throw heldError();
    });
    const clock = fakeClock();

    await expect(
      acquireLock({ lock, sleep: clock.sleep, now: clock.now }, '/r', {
        waitTimeoutMs: 500,
        pollIntervalMs: 100,
      }),
    ).rejects.toBeInstanceOf(GateLockTimeoutError);
  });

  it('re-throws a non-held error immediately without waiting', async () => {
    const boom = new Error('EACCES');
    const lock = vi.fn(async () => {
      throw boom;
    });
    const sleep = vi.fn(noopAsync);

    await expect(acquireLock({ lock, sleep, now: () => 0 }, '/r', config)).rejects.toBe(boom);
    expect(sleep).not.toHaveBeenCalled();
  });
});

describe('runUnderLock', () => {
  const config = resolveLockConfig({});

  it('runs the gate WITHOUT serialization (and says so) when the lock library is missing', async () => {
    const run = vi.fn(async () => ({ code: 7 }));
    const log = vi.fn();

    const result = await runUnderLock({
      resource: '/r',
      config,
      run,
      log,
      loadLockfile: async () => null,
    });

    expect(result).toEqual({ code: 7 });
    expect(run).toHaveBeenCalledTimes(1);
    expect(log.mock.calls.some((c) => String(c[0]).includes('WITHOUT host serialization'))).toBe(
      true,
    );
  });

  it('acquires, runs, and releases the slot on success', async () => {
    const release = vi.fn(noopAsync);
    const lock = vi.fn(async () => release);
    const run = vi.fn(async () => ({ code: 0 }));

    const result = await runUnderLock({
      resource: '/r',
      config,
      run,
      loadLockfile: async () => ({ lock }),
      sleep: noopAsync,
      now: () => 0,
    });

    expect(result).toEqual({ code: 0 });
    expect(lock).toHaveBeenCalledTimes(1);
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('releases the slot even when the gate throws', async () => {
    const release = vi.fn(noopAsync);
    const lock = vi.fn(async () => release);
    const boom = new Error('gate blew up');
    const run = vi.fn(async () => {
      throw boom;
    });

    await expect(
      runUnderLock({
        resource: '/r',
        config,
        run,
        loadLockfile: async () => ({ lock }),
        sleep: noopAsync,
        now: () => 0,
      }),
    ).rejects.toBe(boom);
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('propagates a wait timeout and never runs the gate', async () => {
    const lock = vi.fn(async () => {
      throw heldError();
    });
    const run = vi.fn(async () => ({ code: 0 }));
    const clock = fakeClock();

    await expect(
      runUnderLock({
        resource: '/r',
        config: { staleMs: 1000, waitTimeoutMs: 300, pollIntervalMs: 100 },
        run,
        loadLockfile: async () => ({ lock }),
        sleep: clock.sleep,
        now: clock.now,
      }),
    ).rejects.toBeInstanceOf(GateLockTimeoutError);
    expect(run).not.toHaveBeenCalled();
  });

  it('degrades to an unserialized run on a non-timeout acquisition failure', async () => {
    const lock = vi.fn(async () => {
      throw new Error('EACCES creating lock dir');
    });
    const run = vi.fn(async () => ({ code: 3 }));
    const log = vi.fn();

    const result = await runUnderLock({
      resource: '/r',
      config,
      run,
      log,
      loadLockfile: async () => ({ lock }),
      sleep: noopAsync,
      now: () => 0,
    });

    expect(result).toEqual({ code: 3 });
    expect(run).toHaveBeenCalledTimes(1);
    expect(log.mock.calls.some((c) => String(c[0]).includes('WITHOUT host serialization'))).toBe(
      true,
    );
  });

  it('actually holds a real lock on disk for the run and frees it after (proper-lockfile wiring)', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'gate-lock-it-'));
    // Unique temp resource — NEVER the real host-global path, so this never contends
    // with the actual gate lock the parent `pnpm gate` is holding while this test runs.
    const resource = join(dir, HOST_LOCK_BASENAME);
    const lockArtifact = `${resource}.lock`;
    let heldDuringRun = false;

    try {
      const result = await runUnderLock({
        resource,
        config: resolveLockConfig({}),
        run: async () => {
          heldDuringRun = existsSync(lockArtifact);
          return { code: 0 };
        },
      });

      expect(result).toEqual({ code: 0 });
      expect(heldDuringRun).toBe(true); // the lock existed WHILE the gate ran
      expect(existsSync(lockArtifact)).toBe(false); // and was released after
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
