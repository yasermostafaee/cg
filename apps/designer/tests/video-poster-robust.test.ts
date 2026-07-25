import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { attachRobustVideoPoster } from '../src/shared/video-poster.js';

/**
 * D-128 — the robust at-rest poster ladder (`src/shared/video-poster.ts`), the fix
 * for the canvas-blank field bug: a COLD seek into a GOP whose WebM alpha
 * side-stream frame is inter-coded at the governing main keyframe is a TERMINAL
 * Chromium `PIPELINE_ERROR_DECODE`, while sequential playback always decodes.
 *
 * The browser media pipeline can't run under vitest, so these tests drive the
 * ladder's TRANSITIONS against a scripted fake element: eager-load seek (rung 1),
 * error → `load()` reset → 16× sequential decode to the poster time (rung 2),
 * honest failure (rung 3), plus the abort / supersede lifecycles the React
 * thumbnail and the iframe walk depend on. The real-media halves live in the
 * Playwright spec (`video-canvas-render.spec.ts`) against a committed
 * seek-fragile fixture.
 */

type Listener = () => void;

class FakeVideo {
  muted = false;
  preload = '';
  src = '';
  duration = NaN;
  readyState = 0;
  error: { code: number; message: string } | null = null;
  playbackRate = 1;
  paused = true;
  playCalls = 0;
  loadCalls = 0;
  pauseCalls = 0;
  /** Every value assigned to currentTime — the seek targets the ladder issued. */
  seekTargets: number[] = [];
  #t = 0;
  #listeners = new Map<string, Set<Listener>>();

  get currentTime(): number {
    return this.#t;
  }
  set currentTime(v: number) {
    this.#t = v;
    this.seekTargets.push(v);
  }
  /** Test-side position advance that does NOT count as a ladder-issued seek. */
  advanceTo(v: number): void {
    this.#t = v;
  }

  addEventListener(ev: string, fn: Listener): void {
    const set = this.#listeners.get(ev) ?? new Set<Listener>();
    set.add(fn);
    this.#listeners.set(ev, set);
  }
  removeEventListener(ev: string, fn: Listener): void {
    this.#listeners.get(ev)?.delete(fn);
  }
  dispatch(ev: string): void {
    for (const fn of [...(this.#listeners.get(ev) ?? [])]) fn();
  }

  load(): void {
    this.loadCalls++;
    this.error = null;
    this.readyState = 0;
    this.#t = 0; // a real load() resets the playback position
  }
  play(): Promise<void> {
    this.playCalls++;
    this.paused = false;
    return Promise.resolve();
  }
  pause(): void {
    this.pauseCalls++;
    this.paused = true;
  }
}

const asVideo = (v: FakeVideo): HTMLVideoElement => v as unknown as HTMLVideoElement;
const flush = async (): Promise<void> => {
  await vi.advanceTimersByTimeAsync(0);
};

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('rung 1 — the eager-load seek', () => {
  it('wires muted + preload=auto + src, seeks the clip midpoint, resolves via seek', async () => {
    const v = new FakeVideo();
    const p = attachRobustVideoPoster(asVideo(v), 'blob:clip');
    expect(v.muted).toBe(true);
    expect(v.preload).toBe('auto');
    expect(v.src).toBe('blob:clip');
    v.duration = 10;
    v.readyState = 1;
    v.dispatch('loadedmetadata');
    await flush();
    expect(v.seekTargets).toEqual([5]); // midpoint — no posterMs given
    v.readyState = 4;
    v.dispatch('seeked');
    await expect(p).resolves.toEqual({ ok: true, via: 'seek' });
    expect(v.playbackRate).toBe(1); // rung 2 never armed
    expect(v.loadCalls).toBe(0);
  });

  it('uses posterMs when given and clamps it inside the clip', async () => {
    const v = new FakeVideo();
    const p = attachRobustVideoPoster(asVideo(v), 'blob:clip', 20_000);
    v.duration = 10;
    v.readyState = 1;
    v.dispatch('loadedmetadata');
    await flush();
    expect(v.seekTargets).toEqual([9.99]); // 20s clamped to duration - 10ms
    v.readyState = 4;
    v.dispatch('seeked');
    await expect(p).resolves.toEqual({ ok: true, via: 'seek' });
  });

  it('does not re-set an src that already matches (the pooled-node walk)', async () => {
    const v = new FakeVideo();
    v.src = 'blob:clip';
    const srcWrites: string[] = [];
    Object.defineProperty(v, 'src', {
      get: () => 'blob:clip',
      set: (val: string) => srcWrites.push(val),
    });
    attachRobustVideoPoster(asVideo(v), 'blob:clip');
    expect(srcWrites).toEqual([]);
    await flush();
  });
});

describe('rung 2 — sequential 16x decode after a terminal seek error', () => {
  it('recovers: load() reset, 16x play to the poster time, pause, rate restored', async () => {
    const v = new FakeVideo();
    const p = attachRobustVideoPoster(asVideo(v), 'blob:clip');
    v.duration = 10;
    v.readyState = 1;
    v.dispatch('loadedmetadata');
    await flush();
    expect(v.seekTargets).toEqual([5]);
    // The cold-seek trap: a terminal media error instead of `seeked`.
    v.error = { code: 3, message: 'PIPELINE_ERROR_DECODE' };
    v.dispatch('error');
    await flush();
    expect(v.loadCalls).toBe(1); // the reset that clears the terminal error
    v.duration = 10;
    v.readyState = 1;
    v.dispatch('loadedmetadata');
    await flush();
    expect(v.playbackRate).toBe(16);
    expect(v.playCalls).toBe(1);
    v.advanceTo(3.2);
    await vi.advanceTimersByTimeAsync(100);
    v.advanceTo(5.1); // reached the poster time
    await vi.advanceTimersByTimeAsync(100);
    await expect(p).resolves.toEqual({ ok: true, via: 'rate-play' });
    expect(v.pauseCalls).toBeGreaterThan(0);
    expect(v.playbackRate).toBe(1); // a later real play (VideoDriver) is untouched
  });

  it('treats `ended` during recovery as the poster reached', async () => {
    const v = new FakeVideo();
    const p = attachRobustVideoPoster(asVideo(v), 'blob:clip');
    v.duration = 10;
    v.readyState = 1;
    v.dispatch('loadedmetadata');
    await flush();
    v.error = { code: 3, message: 'PIPELINE_ERROR_DECODE' };
    v.dispatch('error');
    await flush();
    v.readyState = 1;
    v.dispatch('loadedmetadata');
    await flush();
    v.dispatch('ended');
    await expect(p).resolves.toEqual({ ok: true, via: 'rate-play' });
    expect(v.playbackRate).toBe(1);
  });

  it('a stalled rung-1 seek (no seeked, no error) escalates to recovery after its bound', async () => {
    const v = new FakeVideo();
    const p = attachRobustVideoPoster(asVideo(v), 'blob:clip');
    v.duration = 10;
    v.readyState = 1;
    v.dispatch('loadedmetadata');
    await flush();
    await vi.advanceTimersByTimeAsync(5_100); // the 5s seek bound
    expect(v.loadCalls).toBe(1);
    v.readyState = 1;
    v.dispatch('loadedmetadata');
    await flush();
    v.dispatch('ended');
    await expect(p).resolves.toEqual({ ok: true, via: 'rate-play' });
  });

  it('a metadata failure retries once through the reset before giving up', async () => {
    const v = new FakeVideo();
    const p = attachRobustVideoPoster(asVideo(v), 'blob:clip');
    v.error = { code: 4, message: 'DEMUXER_ERROR_COULD_NOT_OPEN' };
    v.dispatch('error'); // metadata never arrives
    await flush();
    expect(v.loadCalls).toBe(1);
    v.error = { code: 4, message: 'DEMUXER_ERROR_COULD_NOT_OPEN' };
    v.dispatch('error'); // the reset fails the same way
    await expect(p).resolves.toEqual({
      ok: false,
      via: 'none',
      error: 'DEMUXER_ERROR_COULD_NOT_OPEN',
    });
  });
});

describe('rung 3 — honest failure', () => {
  it('an error during recovery playback fails with the media error, rate restored', async () => {
    const v = new FakeVideo();
    const p = attachRobustVideoPoster(asVideo(v), 'blob:clip');
    v.duration = 10;
    v.readyState = 1;
    v.dispatch('loadedmetadata');
    await flush();
    v.error = { code: 3, message: 'PIPELINE_ERROR_DECODE' };
    v.dispatch('error');
    await flush();
    v.readyState = 1;
    v.dispatch('loadedmetadata');
    await flush();
    expect(v.playbackRate).toBe(16);
    v.error = { code: 3, message: 'PIPELINE_ERROR_DECODE at t=2' };
    v.dispatch('error');
    await expect(p).resolves.toEqual({
      ok: false,
      via: 'none',
      error: 'PIPELINE_ERROR_DECODE at t=2',
    });
    expect(v.playbackRate).toBe(1);
    expect(v.pauseCalls).toBeGreaterThan(0);
  });
});

describe('lifecycle — abort and supersede', () => {
  it('aborting settles the run and pauses the element (the React cleanup path)', async () => {
    const v = new FakeVideo();
    const controller = new AbortController();
    const p = attachRobustVideoPoster(asVideo(v), 'blob:clip', undefined, controller.signal);
    controller.abort();
    await expect(p).resolves.toEqual({ ok: false, via: 'none', error: 'aborted' });
    expect(v.pauseCalls).toBeGreaterThan(0);
  });

  it('an already-aborted signal settles immediately without touching the media', async () => {
    const v = new FakeVideo();
    const controller = new AbortController();
    controller.abort();
    const p = attachRobustVideoPoster(asVideo(v), 'blob:clip', undefined, controller.signal);
    await expect(p).resolves.toEqual({ ok: false, via: 'none', error: 'aborted' });
    expect(v.playCalls).toBe(0);
  });

  it('a re-attach supersedes the in-flight run; the new run completes normally', async () => {
    const v = new FakeVideo();
    const first = attachRobustVideoPoster(asVideo(v), 'blob:old');
    const second = attachRobustVideoPoster(asVideo(v), 'blob:new');
    expect(v.src).toBe('blob:new');
    v.duration = 8;
    v.readyState = 1;
    v.dispatch('loadedmetadata');
    await flush();
    await expect(first).resolves.toEqual({ ok: false, via: 'none', error: 'superseded' });
    v.readyState = 4;
    v.dispatch('seeked');
    await expect(second).resolves.toEqual({ ok: true, via: 'seek' });
  });
});
