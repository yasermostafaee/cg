import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * D-128 — the converter's RESET-ON-FAILURE contract. A hard ffmpeg abort taints
 * the wasm runtime; any later FS call on a tainted instance throws
 * `ErrnoError: FS error` — which is how a failed first import used to poison the
 * second one. Every failure path must therefore terminate + drop the cached
 * worker, and the next call must construct a FRESH one. Success keeps the cache
 * (the ~150–350 ms load is only re-paid after a failure) but leaks no FS state
 * (unmount + output delete on the way out).
 */

// ---- controllable fake FFmpeg (vi.hoisted — vi.mock factories are hoisted) ----
const { behavior, constructed, FakeFFmpeg } = vi.hoisted(() => {
  type LogCb = (e: { message: string }) => void;

  const behavior = {
    probeLines: [] as string[],
    execImpl: null as ((args: string[]) => Promise<number>) | null,
    mountThrows: false,
  };

  class FakeFFmpeg {
    logCb: LogCb | null = null;
    terminated = false;
    calls: string[] = [];
    constructor() {
      constructed.push(this);
    }
    on(event: string, cb: LogCb): void {
      if (event === 'log') this.logCb = cb;
    }
    load(): Promise<void> {
      this.calls.push('load');
      return Promise.resolve();
    }
    createDir(): Promise<void> {
      this.calls.push('createDir');
      return Promise.resolve();
    }
    unmount(): Promise<void> {
      this.calls.push('unmount');
      // first-run unmount of an empty mountpoint throws, like the real FS
      if (!this.calls.includes('mount')) return Promise.reject(new Error('not mounted'));
      return Promise.resolve();
    }
    mount(): Promise<void> {
      this.calls.push('mount');
      if (behavior.mountThrows) return Promise.reject(new Error('ErrnoError: FS error'));
      return Promise.resolve();
    }
    exec(args: string[]): Promise<number> {
      this.calls.push(`exec:${args.join(' ').slice(0, 40)}`);
      if (behavior.execImpl !== null) return behavior.execImpl(args);
      // default probe behaviour: emit the configured banner lines, exit 1 (no output)
      for (const l of behavior.probeLines) this.logCb?.({ message: l });
      return Promise.resolve(1);
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
    }
  }
  const constructed: InstanceType<typeof FakeFFmpeg>[] = [];
  return { behavior, constructed, FakeFFmpeg };
});

vi.mock('@ffmpeg/ffmpeg', () => ({ FFmpeg: FakeFFmpeg }));
vi.mock('@ffmpeg/util', () => ({ toBlobURL: (u: string) => Promise.resolve(u) }));

import {
  cancelConversion,
  convertToWebm,
  hasCachedInstanceForTest,
  probeSource,
} from '../src/renderer/features/assets/video-convert.js';

const FILE = { name: 'clip.avi' } as unknown as File;
const GOOD_BANNER = [
  '  Duration: 00:00:01.60, start: 0.000000, bitrate: 3310 kb/s',
  '  Stream #0:0: Video: rawvideo, bgra, 64x64, 25 fps, 25 tbr, 25 tbn',
];

beforeEach(() => {
  behavior.probeLines = [];
  behavior.execImpl = null;
  behavior.mountThrows = false;
  constructed.length = 0;
});

afterEach(() => {
  cancelConversion(); // never leak the singleton between tests
});

describe('video-convert — reset-on-failure contract (D-128)', () => {
  it('a probe that finds no video stream drops the cached worker; the next call re-loads fresh', async () => {
    behavior.probeLines = ['[avi] Invalid data found when processing input'];
    const r1 = await probeSource(FILE);
    expect(r1.ok).toBe(false);
    if (!r1.ok) expect(r1.reason).toBe('no-stream'); // genuine file problem — blame the file
    expect(hasCachedInstanceForTest()).toBe(false);
    expect(constructed[0]?.terminated).toBe(true);

    // second call must construct a FRESH worker, not reuse the tainted one
    behavior.probeLines = GOOD_BANNER;
    const r2 = await probeSource(FILE);
    expect(r2.ok).toBe(true);
    expect(constructed).toHaveLength(2);
  });

  it('an FS throw (ErrnoError) during mount surfaces in the log tail and resets', async () => {
    behavior.mountThrows = true;
    const r = await probeSource(FILE);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe('converter-crashed'); // OUR fault — never blames the file
      expect(r.logTail.join('\n')).toContain('ErrnoError: FS error');
    }
    expect(hasCachedInstanceForTest()).toBe(false);
  });

  it('a successful probe KEEPS the worker cached (no re-load tax) and unmounts on the way out', async () => {
    behavior.probeLines = GOOD_BANNER;
    // poster exec fails cleanly (code 1 → posterless probe, NOT a throw)
    behavior.execImpl = (args) => {
      if (args.includes('-frames:v')) return Promise.resolve(1);
      for (const l of GOOD_BANNER) constructed[0]?.logCb?.({ message: l });
      return Promise.resolve(1);
    };
    const r = await probeSource(FILE);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.posterUrl).toBeNull();
    expect(hasCachedInstanceForTest()).toBe(true);
    expect(constructed).toHaveLength(1);
    expect(constructed[0]?.calls.at(-1)).toBe('unmount'); // FS hygiene on success
  });

  it('a convert exiting non-zero resets (a hard abort can hide behind a non-zero exit)', async () => {
    behavior.execImpl = () => Promise.resolve(1);
    const bytes = await convertToWebm({ file: FILE, targetFps: 50 });
    expect(bytes).toBeNull();
    expect(hasCachedInstanceForTest()).toBe(false);
  });

  it('a convert whose exec THROWS resets and returns null (never rethrows into the modal)', async () => {
    behavior.execImpl = () => Promise.reject(new Error('worker died'));
    const bytes = await convertToWebm({ file: FILE, targetFps: 50 });
    expect(bytes).toBeNull();
    expect(hasCachedInstanceForTest()).toBe(false);
  });

  it('a SUCCESSFUL convert returns the bytes and ALSO drops the worker (fresh per import)', async () => {
    // Field evidence: back-to-back imports of known-good files alternated
    // good → FS error → good on a reused instance despite unmount hygiene —
    // every import must start with a virgin worker, success included.
    behavior.execImpl = () => Promise.resolve(0);
    const bytes = await convertToWebm({ file: FILE, targetFps: 50 });
    expect(bytes).toEqual(new Uint8Array([0x1a, 0x45, 0xdf, 0xa3]));
    expect(hasCachedInstanceForTest()).toBe(false);
    expect(constructed[0]?.terminated).toBe(true);

    // the NEXT import constructs a fresh worker and succeeds
    behavior.execImpl = () => Promise.resolve(0);
    const again = await convertToWebm({ file: FILE, targetFps: 50 });
    expect(again).toEqual(new Uint8Array([0x1a, 0x45, 0xdf, 0xa3]));
    expect(constructed).toHaveLength(2);
  });

  it('back-to-back probe→convert cycles never share a worker across imports', async () => {
    // import 1: probe (keeps the instance for its own convert) then convert (drops it)
    behavior.probeLines = GOOD_BANNER;
    const p1 = await probeSource(FILE);
    expect(p1.ok).toBe(true);
    expect(hasCachedInstanceForTest()).toBe(true); // probe→convert same import reuses
    behavior.execImpl = () => Promise.resolve(0);
    expect(await convertToWebm({ file: FILE, targetFps: 50 })).not.toBeNull();
    expect(hasCachedInstanceForTest()).toBe(false);

    // import 2: a brand-new worker, full cycle green — the exact field gap
    behavior.execImpl = null;
    behavior.probeLines = GOOD_BANNER;
    const p2 = await probeSource(FILE);
    expect(p2.ok).toBe(true);
    behavior.execImpl = () => Promise.resolve(0);
    expect(await convertToWebm({ file: FILE, targetFps: 50 })).not.toBeNull();
    expect(constructed).toHaveLength(2); // one worker per import, never shared across
  });
});
