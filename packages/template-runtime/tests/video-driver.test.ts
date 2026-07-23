import { describe, expect, it } from 'vitest';
import { VideoDriver, type VideoDriverOptions, type VideoHandle } from '../src/video-driver.js';

/**
 * D-128 Phase 4 — the video lifecycle driver. Unlike the Lottie (a driven-frame
 * RENDERER), a `<video>` advances its OWN clock; this driver keeps it in lockstep
 * with the injected clock — pause/resume re-anchor, loop wrap is driver-commanded,
 * and drift is corrected only past a threshold (never per-tick). Tested with a
 * mock handle that models linear playback + a fake clock (no real decode).
 */

interface MockClock {
  ms: number;
  pending: ((ts: number) => void)[];
  now: () => number;
  raf: (cb: (ts: number) => void) => number;
  cancel: (h: number) => void;
  /** Advance the clock by `ms` and flush one rAF tick. */
  advance: (ms: number) => void;
}

function makeClock(): MockClock {
  const clock: MockClock = {
    ms: 0,
    pending: [],
    now: () => clock.ms,
    raf: (cb) => {
      clock.pending.push(cb);
      return clock.pending.length;
    },
    cancel: () => {
      clock.pending = [];
    },
    advance: (ms) => {
      clock.ms += ms;
      const cbs = clock.pending;
      clock.pending = [];
      for (const cb of cbs) cb(clock.ms);
    },
  };
  return clock;
}

/**
 * A `<video>` that plays LINEARLY off the same fake clock, records commands, and
 * can STALL. Models the HTML media element's END-OF-MEDIA behaviour: on reaching
 * its natural duration a playing element fires `ended` and PAUSES; a subsequent
 * `seek` moves the head but leaves it paused (only `play()` re-advances it). That
 * auto-pause is what a driver-commanded loop must survive.
 */
function mockVideo(
  clock: MockClock,
  durationSec = 10,
): {
  handle: VideoHandle;
  seeks: number[];
  plays: number;
  pauses: number;
  /** Freeze the playhead while the clock keeps running (models a decode stall / drift). */
  stalled: boolean;
  at: () => number;
} {
  let pos = 0;
  let playing = false;
  let anchorClock = 0;
  let anchorPos = 0;
  const rec = {
    seeks: [] as number[],
    plays: 0,
    pauses: 0,
    stalled: false,
    at: () => {
      settle();
      return pos;
    },
    handle: null as unknown as VideoHandle,
  };
  const settle = (): void => {
    if (!playing || rec.stalled) return;
    pos = anchorPos + (clock.ms - anchorClock) / 1000;
    if (pos >= durationSec) {
      // Natural end: the element clamps to duration and pauses (fires `ended`).
      pos = durationSec;
      playing = false;
    }
  };
  rec.handle = {
    play: () => {
      settle();
      rec.plays++;
      playing = true;
      anchorClock = clock.ms;
      anchorPos = pos;
    },
    pause: () => {
      settle();
      rec.pauses++;
      playing = false;
    },
    seek: (sec) => {
      settle();
      rec.seeks.push(sec);
      pos = sec;
      anchorClock = clock.ms;
      anchorPos = sec;
    },
    currentTime: () => {
      settle();
      return pos;
    },
  };
  return rec;
}

function makeDriver(over: Partial<VideoDriverOptions> = {}): {
  driver: VideoDriver;
  video: ReturnType<typeof mockVideo>;
  clock: MockClock;
} {
  const clock = makeClock();
  const video = mockVideo(clock);
  const driver = new VideoDriver({
    handle: video.handle,
    durationMs: 10_000,
    introEndMs: 2000,
    outroStartMs: 8000,
    loopStartMs: 2000,
    loopEndMs: 8000,
    holdBehavior: 'loop',
    driftThresholdMs: 80,
    clock,
    ...over,
  });
  return { driver, video, clock };
}

describe('VideoDriver (D-128 Phase 4)', () => {
  it('start() plays the intro from 0 and does NOT re-seek per tick during smooth playback', () => {
    const { driver, video, clock } = makeDriver();
    driver.start();
    expect(video.plays).toBe(1);
    expect(video.seeks).toEqual([0]); // only the intro-start seek
    for (let i = 0; i < 10; i++) clock.advance(50); // 500ms into the intro, smooth
    expect(video.seeks).toEqual([0]); // NO drift corrections — bounded, never per-tick
    expect(video.at()).toBeCloseTo(0.5, 2);
  });

  it("hold: 'freeze' pauses at the hold point and resolves whenComplete there", async () => {
    const { driver, video, clock } = makeDriver({ holdBehavior: 'freeze' });
    let done = false;
    void driver.whenComplete().then(() => (done = true));
    driver.start();
    for (let i = 0; i < 45; i++) clock.advance(50); // well past introEnd (2000ms)
    await Promise.resolve();
    expect(done).toBe(true); // completion at the hold point
    expect(video.pauses).toBeGreaterThan(0);
    expect(video.seeks.at(-1)).toBeCloseTo(2.0, 2); // parked at introEnd (2.0s)
  });

  it("hold: 'loop' wraps [loopStart, loopEnd] with driver-commanded seeks and NEVER completes", async () => {
    const { driver, video, clock } = makeDriver(); // loop [2000, 8000]
    let done = false;
    void driver.whenComplete().then(() => (done = true));
    driver.start();
    // play through the intro and two full loop spans (6s span → ~14s total)
    for (let i = 0; i < 300; i++) clock.advance(50);
    await Promise.resolve();
    expect(done).toBe(false); // a loop video is an infinite hold-driver
    // the wrap was driver-commanded: it seeked back to the loop start (2.0s) at least once
    const wrapSeeks = video.seeks.filter((s) => Math.abs(s - 2.0) < 0.2);
    expect(wrapSeeks.length).toBeGreaterThanOrEqual(1);
    // and the playhead stayed within the loop window, never running off past loopEnd
    expect(video.at()).toBeLessThanOrEqual(8.0 + 0.1);
  });

  it('bounded drift correction: re-seeks ONLY once drift exceeds the threshold', () => {
    const { driver, video, clock } = makeDriver({ holdBehavior: 'freeze', introEndMs: 100_000 });
    driver.start();
    clock.advance(50);
    const before = video.seeks.length;
    // stall the decode: the playhead freezes while the clock keeps advancing
    video.stalled = true;
    clock.advance(50); // drift ~50ms (< 80) — no correction
    clock.advance(20); // drift ~70ms (< 80) — still none
    expect(video.seeks.length).toBe(before);
    clock.advance(30); // drift ~100ms (> 80) — corrects now
    expect(video.seeks.length).toBe(before + 1);
    expect(video.seeks.at(-1)! * 1000).toBeCloseTo(150, -1); // re-seeked to the expected clip-time
  });

  it('pause() freezes and resume() re-anchors + re-seeks to the clock-derived clip-time', () => {
    const { driver, video, clock } = makeDriver({ holdBehavior: 'freeze', introEndMs: 100_000 });
    driver.start();
    clock.advance(500); // 0.5s into the intro
    driver.pause();
    expect(video.pauses).toBe(1);
    const seekCount = video.seeks.length;
    clock.advance(5000); // time passes while paused — the video must NOT advance
    driver.resume();
    // resume RE-SEEKS to the clip-time captured at pause (0.5s), never trusting a stalled head
    expect(video.seeks.length).toBe(seekCount + 1);
    expect(video.seeks.at(-1)!).toBeCloseTo(0.5, 2);
    expect(video.plays).toBe(2); // played again after the re-seek
  });

  it('playOutro() plays [outroStart → duration] once and resolves at the end', async () => {
    const { driver, video, clock } = makeDriver({ outroStartMs: 8000, durationMs: 10_000 });
    let resolved = false;
    const p = driver.playOutro().then(() => (resolved = true));
    expect(video.seeks.at(-1)).toBeCloseTo(8.0, 2); // seeked to the outro start
    for (let i = 0; i < 60; i++) clock.advance(50); // 3s ≥ the 2s outro
    await p;
    expect(resolved).toBe(true);
    expect(video.pauses).toBeGreaterThan(0); // paused at the clip end
  });

  it('ALWAYS resolves the outro: a degenerate (no-outro) clip resolves immediately', async () => {
    // absent phases ⇒ outroStart = duration ⇒ NO outro (decision (b))
    const { driver } = makeDriver({ outroStartMs: 10_000, durationMs: 10_000 });
    let resolved = false;
    await driver.playOutro().then(() => (resolved = true));
    expect(resolved).toBe(true);
  });

  it('ALWAYS resolves the outro: reset()/stop()/destroy() settle a pending outro', async () => {
    for (const kill of ['reset', 'stop', 'destroy'] as const) {
      const { driver } = makeDriver({ outroStartMs: 8000, durationMs: 10_000 });
      let resolved = false;
      const p = driver.playOutro().then(() => (resolved = true));
      driver[kill]();
      await p;
      expect(resolved, kill).toBe(true);
    }
  });

  it('NO phases (whole clip loops): intro is [0, duration], hold loops [0, duration], no outro', async () => {
    // The runtime encodes absent phases as introEnd=duration, loop=[0,duration], outroStart=duration.
    const { driver, video, clock } = makeDriver({
      introEndMs: 10_000,
      loopStartMs: 0,
      loopEndMs: 10_000,
      outroStartMs: 10_000,
    });
    let done = false;
    void driver.whenComplete().then(() => (done = true));
    driver.start();
    for (let i = 0; i < 500; i++) clock.advance(50); // 25s: two+ passes of the 10s clip
    await Promise.resolve();
    expect(done).toBe(false); // a whole-clip loop never self-completes
    // it wrapped back to 0 (driver-commanded), not run off the end
    const wrapSeeks = video.seeks.filter((s) => Math.abs(s) < 0.2);
    expect(wrapSeeks.length).toBeGreaterThanOrEqual(2); // start + at least one wrap
    // AND it kept the element PLAYING across each wrap: because loopEnd === duration
    // here, a real <video> hits its natural end and auto-pauses, so the wrap must
    // re-issue play() (not just seek) or the loop dies frozen after one pass.
    expect(video.plays).toBeGreaterThan(1);
    // and its degenerate outro resolves at once
    let resolved = false;
    await driver.playOutro().then(() => (resolved = true));
    expect(resolved).toBe(true);
  });
});
