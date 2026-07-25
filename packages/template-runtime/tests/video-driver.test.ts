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
  timers: { id: number; due: number; cb: () => void }[];
  now: () => number;
  raf: (cb: (ts: number) => void) => number;
  cancel: (h: number) => void;
  setTimeout: (cb: () => void, ms: number) => number;
  clearTimeout: (h: unknown) => void;
  /** Advance the clock by `ms` and flush due timers + one rAF tick. */
  advance: (ms: number) => void;
}

function makeClock(): MockClock {
  let nextTimer = 1;
  const clock: MockClock = {
    ms: 0,
    pending: [],
    timers: [],
    now: () => clock.ms,
    raf: (cb) => {
      clock.pending.push(cb);
      return clock.pending.length;
    },
    cancel: () => {
      clock.pending = [];
    },
    setTimeout: (cb, ms) => {
      const id = nextTimer++;
      clock.timers.push({ id, due: clock.ms + ms, cb });
      return id;
    },
    clearTimeout: (h) => {
      const i = clock.timers.findIndex((t) => t.id === h);
      if (i >= 0) clock.timers.splice(i, 1);
    },
    advance: (ms) => {
      clock.ms += ms;
      const due = clock.timers.filter((t) => t.due <= clock.ms).sort((a, b) => a.due - b.due);
      for (const t of due) {
        const i = clock.timers.indexOf(t);
        if (i >= 0) clock.timers.splice(i, 1);
        t.cb();
      }
      const cbs = clock.pending;
      clock.pending = [];
      for (const cb of cbs) cb(clock.ms);
    },
  };
  return clock;
}

/** Advance the clock in realistic ~50 ms tick steps (foreground rAF cadence). */
function run(clock: MockClock, totalMs: number, step = 50): void {
  for (let left = totalMs; left > 0; left -= step) clock.advance(Math.min(step, left));
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
  /** True while a seek is settling — the driver must not stack another correction. */
  seeking: boolean;
  /** Model a TERMINAL media error (the fragile-alpha seek class on pre-.5 assets). */
  dead: boolean;
  /** How many times the driver asked for an element rebuild. */
  recovers: number;
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
    seeking: false,
    dead: false,
    recovers: 0,
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
    seeking: () => rec.seeking,
    dead: () => rec.dead,
    recover: () => {
      // Models the runtime handle's rebuild: a FRESH element at the position the
      // dead one last knew, playing again if it was — and no longer dead.
      rec.recovers++;
      rec.dead = false;
      anchorClock = clock.ms;
      anchorPos = pos;
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

  it('pause() freezes and resume() is SEEK-FREE — the clock re-anchors to the media and plays on', () => {
    // REDONE 2026-07-25 (superseding the re-seek assertion): the resume re-seek
    // was a fragile-alpha-seek trigger on pre-alignment assets (the owner's
    // pause/resume speckle + freeze). The media froze where it froze — it is
    // authoritative (the large-gap principle): resume just re-anchors and plays.
    const { driver, video, clock } = makeDriver({ holdBehavior: 'freeze', introEndMs: 100_000 });
    driver.start();
    run(clock, 500); // 0.5s into the intro, smooth foreground ticks
    driver.pause();
    expect(video.pauses).toBe(1);
    const seekCount = video.seeks.length;
    clock.advance(5000); // time passes while paused — the video must NOT advance
    driver.resume();
    expect(video.seeks.length).toBe(seekCount); // NO seek — the fragile op is not performed
    expect(video.plays).toBe(2); // just played again
    expect(video.at()).toBeCloseTo(0.5, 2); // continues from where it froze…
    run(clock, 500);
    expect(video.at()).toBeCloseTo(1.0, 2); // …in lockstep with the re-anchored clock
    expect(video.seeks.length).toBe(seekCount); // and smooth playback needs no correction
  });

  it('a DEAD element (terminal media error) is rebuilt on the next tick, rate-limited, with correction grace', () => {
    const { driver, video, clock } = makeDriver({ holdBehavior: 'freeze', introEndMs: 100_000 });
    driver.start();
    run(clock, 500);
    video.dead = true; // the fragile-alpha seek class: the element dies mid-run
    clock.advance(50);
    expect(video.recovers).toBe(1); // rebuilt on the very next tick
    // a genuinely broken asset that dies again is retried QUIETLY, never a storm
    video.dead = true;
    clock.advance(50);
    expect(video.recovers).toBe(1); // rate-limited (1s window)
    clock.advance(1000);
    expect(video.recovers).toBe(2); // retried after the window
  });

  it('reset() rebuilds a dead element BEFORE re-arming — the next take never plays into a corpse', () => {
    const { driver, video, clock } = makeDriver();
    driver.start();
    run(clock, 500);
    video.dead = true;
    driver.stop(); // stop() itself recovers…
    expect(video.recovers).toBe(1);
    video.dead = true; // …and if the element dies again while cleared,
    clock.advance(2000);
    driver.reset(); // reset() recovers again so start() lands on a live node
    expect(video.recovers).toBe(2);
    expect(video.seeks.at(-1)).toBe(0); // then parks at the intro start as always
  });

  it('playOutro() on a dead element recovers first — the outro seek lands on a LIVE node', async () => {
    const { driver, video, clock } = makeDriver({ outroStartMs: 8000, durationMs: 10_000 });
    driver.start();
    run(clock, 500);
    video.dead = true;
    clock.advance(2000); // let the rate-limit window pass after the tick-time recovery
    video.dead = true;
    let resolved = false;
    void driver.playOutro().then(() => (resolved = true));
    expect(video.recovers).toBeGreaterThanOrEqual(2); // recovered at the outro entry
    expect(video.seeks.at(-1)).toBeCloseTo(8.0, 2); // and the outro seek was issued after it
    run(clock, 2100);
    await Promise.resolve();
    expect(resolved).toBe(true); // the outro still settles (§D6.4.1)
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

describe('VideoDriver — sync robustness (background throttle / freeze / resume, 2026-07-23)', () => {
  it('a LARGE gap (background throttle) RE-BASES to the media — NO forward jump, no wedge', () => {
    const { driver, video, clock } = makeDriver(); // loop [2000,8000], intro 2000
    driver.start();
    run(clock, 3000); // into the loop hold; the head is playing at ~3.0s
    const posBeforeGap = video.at();
    const seeksBeforeGap = video.seeks.length;
    const playsBeforeGap = video.plays;
    // Background tab: rAF is starved and the browser pauses the media, so the head FREEZES
    // while performance.now() races ~9s ahead; then one throttled tick fires on return.
    video.stalled = true;
    clock.advance(9000);
    // The OLD driver seeked the video FORWARD to wall%span (~6s) — the "further ahead than
    // where it stopped" jump. The fix RE-BASES to the media's actual frozen position: NO
    // corrective seek is issued, and it re-issues play() to continue from there.
    expect(video.seeks.length).toBe(seeksBeforeGap);
    expect(video.plays).toBe(playsBeforeGap + 1);
    // resume normal ticking: it continues FORWARD from the actual position, still in-window
    video.stalled = false;
    run(clock, 1500);
    expect(video.at()).toBeGreaterThan(posBeforeGap);
    expect(video.at()).toBeLessThanOrEqual(8.0 + 0.1);
  });

  it('repeated pause/resume cycles do NOT accumulate drift (paused gaps are never phantom time)', () => {
    const { driver, video, clock } = makeDriver({ holdBehavior: 'freeze', introEndMs: 100_000 });
    driver.start();
    for (let i = 0; i < 5; i++) {
      run(clock, 400); // 0.4s of ACTIVE play
      driver.pause();
      clock.advance(2000); // 2s paused — no ticks, must not accrue as clip time
      driver.resume();
    }
    run(clock, 400);
    // 6 × 0.4s of active play = ~2.4s; the five 2s paused gaps did NOT creep the head forward
    expect(video.at()).toBeCloseTo(2.4, 1);
  });

  it('never stacks a corrective seek while one is still settling (media.seeking guard)', () => {
    const { driver, video, clock } = makeDriver({ holdBehavior: 'freeze', introEndMs: 100_000 });
    driver.start();
    run(clock, 100);
    video.stalled = true; // build real drift…
    video.seeking = true; // …but a seek is in flight
    const before = video.seeks.length;
    run(clock, 200); // drift now well past 80ms
    expect(video.seeks.length).toBe(before); // NOT stacked — the seek-storm can't start
    video.seeking = false;
    clock.advance(50);
    expect(video.seeks.length).toBe(before + 1); // corrects once the seek settled
  });

  it('bounds the outro: playOutro resolves via the wall-clock backstop even if paused mid-outro', async () => {
    const { driver, clock } = makeDriver({ outroStartMs: 8000, durationMs: 10_000 });
    let resolved = false;
    const p = driver.playOutro().then(() => (resolved = true));
    clock.advance(50); // one tick into the outro
    driver.pause(); // pause mid-outro — the rAF loop stops, the terminal is never reached
    // Without the backstop this promise hangs forever (the exit ledger wedges = the freeze).
    // The backstop (outroMs 2000 + margin 2000) fires and force-settles it.
    clock.advance(5000);
    await p;
    expect(resolved).toBe(true);
  });

  it('Stop/Out/Play recover the driver from ANY state — a paused outro with a stuck seek', async () => {
    const { driver, video, clock } = makeDriver({ outroStartMs: 8000, durationMs: 10_000 });
    // Wedge it: outro in flight, paused, with a seek that never completes.
    const p = driver.playOutro().then(() => undefined);
    clock.advance(50);
    driver.pause();
    video.seeking = true; // a seek stuck in flight
    // STOP must settle the pending outro and halt regardless of the media state.
    driver.stop();
    await p; // resolved — no hang, whatever the media is doing
    // PLAY = reset()+start() must bring it back to a clean intro from that wedged state.
    driver.reset();
    driver.start();
    expect(video.plays).toBeGreaterThan(0);
    video.seeking = false;
    run(clock, 500);
    expect(video.at()).toBeGreaterThan(0); // playing normally again
  });

  it('RESUME GRACE: drift correction is suppressed while the decoder ramps, then resumes', () => {
    const { driver, video, clock } = makeDriver({
      holdBehavior: 'freeze',
      introEndMs: 100_000,
      resumeGraceMs: 600,
    });
    driver.start();
    run(clock, 400);
    driver.pause();
    clock.advance(1000);
    driver.resume();
    const afterResume = video.seeks.length; // includes resume's own re-anchor seek
    // A slow decoder ramp: the media stalls while wall time advances, so drift builds — the
    // exact condition that used to trigger a self-amplifying corrective-seek storm (each seek
    // a ~5s keyframe-decode burst). During the grace those corrections must NOT fire.
    video.stalled = true;
    run(clock, 400); // within the 600ms grace ⇒ NO corrective seek despite the drift
    expect(video.seeks.length).toBe(afterResume);
    run(clock, 400); // past the grace ⇒ a single correction resumes (decoder assumed ramped)
    expect(video.seeks.length).toBeGreaterThan(afterResume);
  });
});
