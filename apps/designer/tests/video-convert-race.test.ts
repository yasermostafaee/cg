import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * D-128 — the converter's REENTRANCY contract. The field bug this guards
 * against: React <StrictMode> double-invokes the modal's probe effect in dev
 * (a fast close/reopen does the same in prod), so TWO probeSource calls raced
 * the module's shared state and produced three different outcomes for the SAME
 * good file — bogus "no-stream" (log sink stolen by the other call),
 * "ErrnoError: FS error" (one call's reset terminated the other call's live
 * worker), or success (timing missed). The original suite never raced two
 * calls, which is exactly why it missed the bug — these tests ALWAYS race.
 *
 * Contract under test:
 *  1. single-flight load — concurrent callers share ONE worker, never two;
 *  2. per-call log capture — each probe's verdict comes from its OWN exec;
 *  3. caller-scoped reset — a failing call never kills a worker it doesn't own;
 *  4. abort — rejects with AbortError and leaves the healthy worker untouched.
 */

// ---- controllable ASYNC fake FFmpeg (vi.hoisted — mock factories hoist) ----
const { behavior, constructed, FakeFFmpeg } = vi.hoisted(() => {
  type LogCb = (e: { message: string }) => void;

  const behavior = {
    /** Called for every exec; receives the args, the instance, and a global exec index. */
    execImpl: null as ((args: string[], ff: unknown, index: number) => Promise<number>) | null,
    execCount: 0,
  };

  class FakeFFmpeg {
    logCbs: LogCb[] = [];
    progressCbs: ((e: { progress: number }) => void)[] = [];
    terminated = false;
    calls: string[] = [];
    /** Pending exec rejects — terminate() rejects them all, like the real lib. */
    pendingRejects: ((err: Error) => void)[] = [];
    constructor() {
      constructed.push(this);
    }
    on(event: string, cb: LogCb): void {
      if (event === 'log') this.logCbs.push(cb);
      else if (event === 'progress')
        this.progressCbs.push(cb as unknown as (e: { progress: number }) => void);
    }
    off(event: string, cb: LogCb): void {
      if (event === 'log') this.logCbs = this.logCbs.filter((f) => f !== cb);
      else if (event === 'progress')
        this.progressCbs = this.progressCbs.filter(
          (f) => f !== (cb as unknown as (e: { progress: number }) => void),
        );
    }
    emitLog(line: string): void {
      for (const cb of [...this.logCbs]) cb({ message: line });
    }
    async load(): Promise<void> {
      this.calls.push('load');
      // async like the real load — this is the window where the OLD
      // check-then-act ensureLoaded let a second caller construct worker #2
      await new Promise((r) => setTimeout(r, 1));
    }
    createDir(): Promise<void> {
      this.calls.push('createDir');
      return Promise.resolve();
    }
    unmount(): Promise<void> {
      this.calls.push('unmount');
      if (!this.calls.includes('mount')) return Promise.reject(new Error('not mounted'));
      return Promise.resolve();
    }
    mount(): Promise<void> {
      this.calls.push('mount');
      return Promise.resolve();
    }
    exec(args: string[]): Promise<number> {
      this.calls.push(`exec:${args.join(' ').slice(0, 40)}`);
      const index = behavior.execCount++;
      if (behavior.execImpl !== null) return behavior.execImpl(args, this, index);
      // default: an ASYNC probe-ish exec (yields to the event loop — the
      // window in which unserialized concurrent calls used to interleave)
      return new Promise((resolve, reject) => {
        this.pendingRejects.push(reject);
        setTimeout(() => {
          this.pendingRejects = this.pendingRejects.filter((f) => f !== reject);
          if (!args.includes('-frames:v')) for (const l of GOOD_BANNER) this.emitLog(l);
          resolve(1);
        }, 2);
      });
    }
    readFile(): Promise<Uint8Array> {
      this.calls.push('readFile');
      return Promise.resolve(new Uint8Array([0x1a, 0x45, 0xdf, 0xa3]));
    }
    deleteFile(): Promise<void> {
      this.calls.push('deleteFile');
      return Promise.resolve();
    }
    terminate(): void {
      this.terminated = true;
      const pending = this.pendingRejects;
      this.pendingRejects = [];
      for (const rej of pending) rej(new Error('called FFmpeg.terminate()'));
    }
  }
  const constructed: InstanceType<typeof FakeFFmpeg>[] = [];
  const GOOD_BANNER = [
    '  Duration: 00:00:01.60, start: 0.000000, bitrate: 3310 kb/s',
    '  Stream #0:0: Video: rawvideo, bgra, 64x64, 25 fps, 25 tbr, 25 tbn',
  ];
  return { behavior, constructed, FakeFFmpeg, GOOD_BANNER };
});

const GOOD_BANNER = [
  '  Duration: 00:00:01.60, start: 0.000000, bitrate: 3310 kb/s',
  '  Stream #0:0: Video: rawvideo, bgra, 64x64, 25 fps, 25 tbr, 25 tbn',
];
const BAD_LINES = ['[avi] Invalid data found when processing input'];

vi.mock('@ffmpeg/ffmpeg', () => ({ FFmpeg: FakeFFmpeg }));
vi.mock('@ffmpeg/util', () => ({ toBlobURL: (u: string) => Promise.resolve(u) }));

import {
  cancelConversion,
  convertToWebm,
  hasCachedInstanceForTest,
  probeSource,
} from '../src/renderer/features/assets/video-convert.js';

const FILE = { name: 'clip.avi' } as unknown as File;

beforeEach(() => {
  behavior.execImpl = null;
  behavior.execCount = 0;
  constructed.length = 0;
});

afterEach(() => {
  cancelConversion(); // never leak the singleton between tests
  vi.restoreAllMocks();
});

describe('video-convert — reentrancy under concurrent callers (D-128 race)', () => {
  it('TWO CONCURRENT probes of the same file BOTH succeed, share ONE worker, and neither steals the other’s log', async () => {
    // The exact field interleaving: two probes in flight at once (StrictMode
    // double-mount). Old code: two workers constructed, one orphaned; the log
    // sink stolen → one probe read an empty log → bogus "no-stream"; a reset
    // from one call killed the other's worker → "ErrnoError: FS error".
    const [r1, r2] = await Promise.all([probeSource(FILE), probeSource(FILE)]);

    // BOTH calls get the correct verdict — no cross-talk, no empty log.
    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
    if (r1.ok && r2.ok) {
      expect(r1.probe).toEqual({ fps: 25, width: 64, height: 64, durationMs: 1600 });
      expect(r2.probe).toEqual(r1.probe);
    }
    // Single-flight load: ONE worker ever constructed, still alive and cached.
    expect(constructed).toHaveLength(1);
    expect(constructed[0]?.terminated).toBe(false);
    expect(hasCachedInstanceForTest()).toBe(true);
    // Per-call capture is ATTACH + DETACH: no listener may outlive its exec.
    expect(constructed[0]?.logCbs).toHaveLength(0);
  });

  it('a no-stream probe racing a good probe never kills the good probe’s worker (caller-scoped reset)', async () => {
    // Probe execs: 1st gets garbage (→ no-stream → that call drops ITS worker),
    // 2nd gets the good banner. Poster execs just fail cleanly (code 1).
    let probeExecIndex = 0;
    behavior.execImpl = (args, ff) =>
      new Promise((resolve) => {
        setTimeout(() => {
          if (!args.includes('-frames:v')) {
            const lines = probeExecIndex++ === 0 ? BAD_LINES : GOOD_BANNER;
            for (const l of lines) (ff as InstanceType<typeof FakeFFmpeg>).emitLog(l);
          }
          resolve(1);
        }, 2);
      });

    const [bad, good] = await Promise.all([probeSource(FILE), probeSource(FILE)]);

    expect(bad.ok).toBe(false);
    if (!bad.ok) {
      expect(bad.reason).toBe('no-stream'); // ITS verdict, from ITS log
      // The verdict carries the FILE'S OWN ffmpeg lines — the field bug's
      // signature was a no-stream with a stolen/EMPTY log tail.
      expect(bad.logTail.join('\n')).toContain('Invalid data found');
    }
    expect(good.ok).toBe(true); // the racing call is untouched by the reset

    // The failing call terminated only the worker IT held; the good call got a
    // fresh one that is still alive and cached.
    expect(constructed).toHaveLength(2);
    expect(constructed[0]?.terminated).toBe(true);
    expect(constructed[1]?.terminated).toBe(false);
    expect(hasCachedInstanceForTest()).toBe(true);
  });

  it('an already-aborted signal rejects with AbortError and leaves the cached worker untouched', async () => {
    const warm = await probeSource(FILE); // cache a healthy worker first
    expect(warm.ok).toBe(true);
    expect(constructed).toHaveLength(1);

    const ctrl = new AbortController();
    ctrl.abort();
    await expect(probeSource(FILE, { signal: ctrl.signal })).rejects.toMatchObject({
      name: 'AbortError',
    });

    // No reset, no reload: the healthy worker survives for the next probe.
    expect(constructed).toHaveLength(1);
    expect(constructed[0]?.terminated).toBe(false);
    expect(hasCachedInstanceForTest()).toBe(true);
  });

  it('aborting a QUEUED probe rejects it without disturbing the running probe (the StrictMode cleanup path)', async () => {
    // Probe A runs; probe B queues behind it (op mutex) and is aborted while
    // waiting — exactly what the modal's effect cleanup does on StrictMode's
    // first mount. B must reject; A must complete normally on the one worker.
    const ctrl = new AbortController();
    const a = probeSource(FILE);
    const b = probeSource(FILE, { signal: ctrl.signal });
    ctrl.abort();

    const ra = await a;
    expect(ra.ok).toBe(true);
    await expect(b).rejects.toMatchObject({ name: 'AbortError' });

    expect(constructed).toHaveLength(1); // B never built (or killed) anything
    expect(constructed[0]?.terminated).toBe(false);
    expect(hasCachedInstanceForTest()).toBe(true);
  });

  it('cancelConversion mid-convert resolves null and the next import starts on a FRESH worker', async () => {
    // The convert exec hangs until terminate() rejects it (like the real lib).
    behavior.execImpl = (args, ff) => {
      if (args.includes('-c:v')) {
        return new Promise((_resolve, reject) => {
          (ff as InstanceType<typeof FakeFFmpeg>).pendingRejects.push(reject);
        });
      }
      if (!args.includes('-frames:v'))
        for (const l of GOOD_BANNER) (ff as InstanceType<typeof FakeFFmpeg>).emitLog(l);
      return Promise.resolve(1);
    };

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const converting = convertToWebm({ file: FILE, targetFps: 50 });
    await new Promise((r) => setTimeout(r, 5)); // let it reach the hanging exec
    cancelConversion();
    expect(await converting).toBeNull();
    expect(hasCachedInstanceForTest()).toBe(false);
    // the real underlying error (the terminate) reached the console, honestly
    expect(errorSpy).toHaveBeenCalled();
    // per-call listeners were DETACHED on the way out despite the crash
    expect(constructed[0]?.logCbs).toHaveLength(0);
    expect(constructed[0]?.progressCbs).toHaveLength(0);

    // Next import: a brand-new worker, full probe green.
    const next = await probeSource(FILE);
    expect(next.ok).toBe(true);
    expect(constructed).toHaveLength(2);
    expect(constructed[1]?.terminated).toBe(false);
  });

  it('cancelConversion DURING the worker load discards the loading worker (generation guard)', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const converting = convertToWebm({ file: FILE, targetFps: 50 });
    // let the exclusive body reach loadFresh (worker constructed, gen captured)
    // — the fake's 1 ms load timer is still pending when the cancel strikes
    while (constructed.length === 0) await Promise.resolve();
    cancelConversion();

    expect(await converting).toBeNull();
    expect(hasCachedInstanceForTest()).toBe(false);
    expect(constructed).toHaveLength(1);
    // the mid-load worker noticed the reset, discarded itself, was never cached
    expect(constructed[0]?.terminated).toBe(true);
    expect(errorSpy).toHaveBeenCalled();

    // and the module recovers: the next probe builds a fresh worker, green
    const next = await probeSource(FILE);
    expect(next.ok).toBe(true);
    expect(constructed).toHaveLength(2);
  });

  it('a crashing probe reports converter-crashed with the REAL error on the console — and only after ITS own failure', async () => {
    behavior.execImpl = () => Promise.reject(new Error('ErrnoError: FS error'));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const r = await probeSource(FILE);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe('converter-crashed'); // never blames the file
      expect(r.logTail.join('\n')).toContain('ErrnoError: FS error');
    }
    // the previously-swallowed throw is surfaced verbatim
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('probe crashed'),
      expect.objectContaining({ message: 'ErrnoError: FS error' }),
    );
    expect(hasCachedInstanceForTest()).toBe(false);
  });
});
