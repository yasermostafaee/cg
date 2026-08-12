import { describe, expect, it, vi } from 'vitest';
import type { LottiePlayerHandle } from '@cg/lottie-bridge';
import { LottieDriver, type LottieDriverOptions } from '../src/lottie-driver.js';

/**
 * D-125 §D3 — the driven-frame model. The driver advances the player by the
 * INJECTED clock via `goToFrame`, never lottie-web's own rAF: pause freezes the
 * playhead and resume continues it with no drift, and a freeze hold stays frozen.
 * Tested in isolation with a mock handle + a fake clock (no `lottie_light`).
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

function mockHandle(): LottiePlayerHandle & { frames: number[]; destroyed: boolean } {
  const frames: number[] = [];
  const handle = {
    element: {} as HTMLElement,
    frames,
    destroyed: false,
    play: () => undefined,
    pause: () => undefined,
    stop: () => undefined,
    destroy() {
      handle.destroyed = true;
    },
    goToFrame(f: number) {
      frames.push(f);
    },
    get isAlive() {
      return !handle.destroyed;
    },
  };
  return handle;
}

function makeDriver(over: Partial<LottieDriverOptions> = {}): {
  driver: LottieDriver;
  handle: ReturnType<typeof mockHandle>;
  clock: MockClock;
} {
  const handle = mockHandle();
  const clock = makeClock();
  const driver = new LottieDriver({
    handle,
    fr: 100, // 100 fps → 1 frame every 10ms (clean math)
    ip: 0,
    op: 100,
    speed: 1,
    introEnd: 5,
    idleIn: 5,
    idleOut: 10,
    holdBehavior: 'freeze',
    clock,
    ...over,
  });
  return { driver, handle, clock };
}

const last = (h: { frames: number[] }): number | undefined => h.frames.at(-1);

describe('LottieDriver — driven-frame render', () => {
  it('reset() paints the in-frame', () => {
    const { driver, handle } = makeDriver({ ip: 3 });
    driver.reset();
    expect(last(handle)).toBe(3);
  });

  it('poster() falls back to the hold frame (introEnd) when no posterFrame is given', () => {
    // The static editor canvas must show the settled graphic, not the invisible
    // intro-start (frame `ip`, where an AE intro has scaled the graphic to nothing).
    const { driver, handle } = makeDriver({ ip: 0, introEnd: 5 });
    driver.poster();
    expect(last(handle)).toBe(5);
  });

  it('poster() paints the explicit posterFrame (the runtime midpoint for a marker-less clip)', () => {
    // A marker-less furniture clip's `introEnd` falls back to `op` (the LAST frame) —
    // the outro-END, where the graphic has animated OFF (invisible). The runtime passes
    // the clip MIDPOINT as `posterFrame` so the canvas parks on a VISIBLE held frame.
    const { driver, handle } = makeDriver({ ip: 0, introEnd: 60, posterFrame: 30 });
    driver.poster();
    expect(last(handle)).toBe(30);
  });

  it('a subsequent play (reset + start) overrides the poster and plays from the in-frame', () => {
    const { driver, handle, clock } = makeDriver({ ip: 0, introEnd: 5 });
    driver.poster(); // canvas poster at introEnd
    expect(last(handle)).toBe(5);
    driver.reset(); // play() path re-arms from ip
    expect(last(handle)).toBe(0);
    driver.start();
    clock.advance(20); // intro advances from ip
    expect(last(handle)).toBe(2);
  });

  it('start() paints the in-frame synchronously and advances by the injected clock', () => {
    const { driver, handle, clock } = makeDriver();
    driver.reset();
    driver.start();
    expect(last(handle)).toBe(0); // in-frame painted before the first rAF
    clock.advance(10); // 1 frame at 100fps
    expect(last(handle)).toBe(1);
    clock.advance(20); // +2 frames
    expect(last(handle)).toBe(3);
  });

  it('applies the speed multiplier to the advance rate', () => {
    const { driver, handle, clock } = makeDriver({ speed: 2, introEnd: 100 });
    driver.reset();
    driver.start();
    clock.advance(10); // 10ms × 2 × 100fps/1000 = 2 frames
    expect(last(handle)).toBe(2);
  });

  it('freeze hold clamps at introEnd and stops ticking', () => {
    const { driver, handle, clock } = makeDriver({ introEnd: 5 });
    driver.reset();
    driver.start();
    clock.advance(60); // elapsed 60ms → advanced 6 ≥ introEnd 5 → freeze
    expect(last(handle)).toBe(5);
    expect(clock.pending).toHaveLength(0); // no further rAF scheduled
    const count = handle.frames.length;
    clock.advance(100); // nothing scheduled — no more paints
    expect(handle.frames).toHaveLength(count);
  });

  it('pause freezes the playhead; resume continues from that exact frame (no drift)', () => {
    const { driver, handle, clock } = makeDriver({ introEnd: 100 });
    driver.reset();
    driver.start();
    clock.advance(20); // frame 2
    expect(last(handle)).toBe(2);
    driver.pause();
    const atPause = handle.frames.length;
    clock.advance(500); // a long paused gap — must NOT advance
    expect(handle.frames).toHaveLength(atPause);
    driver.resume();
    clock.advance(10); // one more frame past where it froze
    expect(last(handle)).toBe(3); // continues 2 → 3, the paused gap ignored
  });

  it('idle-loop wraps within [idleIn, idleOut) and keeps ticking', () => {
    const { driver, handle, clock } = makeDriver({
      holdBehavior: 'idle-loop',
      introEnd: 5,
      idleIn: 5,
      idleOut: 10,
    });
    driver.reset();
    driver.start();
    clock.advance(50); // advanced 5 → idle frame 5 + (0 % 5) = 5
    expect(last(handle)).toBe(5);
    clock.advance(20); // advanced 7 → 5 + (2 % 5) = 7
    expect(last(handle)).toBe(7);
    clock.advance(30); // advanced 10 → 5 + (5 % 5) = 5 (wrapped)
    expect(last(handle)).toBe(5);
    expect(clock.pending.length).toBeGreaterThan(0); // still ticking (no freeze)
  });

  it('resume() does not un-freeze a settled freeze hold', () => {
    const { driver, handle, clock } = makeDriver({ introEnd: 5 });
    driver.reset();
    driver.start();
    clock.advance(60); // freeze at 5
    expect(last(handle)).toBe(5);
    driver.resume(); // no-op — stays frozen
    clock.advance(50);
    expect(last(handle)).toBe(5);
    expect(clock.pending).toHaveLength(0);
  });

  it('destroy() tears down the handle and halts', () => {
    const { driver, handle, clock } = makeDriver({ introEnd: 100 });
    driver.reset();
    driver.start();
    clock.advance(10);
    driver.destroy();
    expect(handle.destroyed).toBe(true);
    const count = handle.frames.length;
    clock.advance(50);
    expect(handle.frames).toHaveLength(count); // no paint after destroy
  });
});

/**
 * D-135 — the PLAYHEAD path. `positionAt()` paints the frame the Designer's playhead
 * asks for, through the SAME mapping the driver's own clock uses.
 *
 * The singularity IS the requirement, not an implementation detail that happens to hold:
 * D-135's acceptance is that scrub and play agree, and the cheapest way to guarantee that
 * is for there to be nothing to reconcile. A forked implementation could satisfy every
 * frame assertion below and still be wrong, so the first test asserts the MECHANISM.
 */
describe('LottieDriver — positionAt (the Designer playhead)', () => {
  /** The one mapping both paths must route through. */
  const mapping = (): unknown =>
    (LottieDriver.prototype as unknown as Record<string, unknown>)['clipPositionAt'];

  it('the clock path and the playhead path resolve the frame through ONE function', () => {
    const spy = vi.spyOn(
      LottieDriver.prototype as unknown as { clipPositionAt: (...a: unknown[]) => unknown },
      'clipPositionAt',
    );
    expect(mapping()).toBeTypeOf('function');
    try {
      const a = makeDriver({ introEnd: 100 });
      a.driver.reset();
      a.driver.start(); // the driver's OWN clock
      a.clock.advance(10);
      const viaClock = spy.mock.calls.length;
      expect(viaClock).toBeGreaterThan(0);

      const b = makeDriver({ introEnd: 100 });
      b.driver.positionAt(10, null); // the PLAYHEAD
      expect(spy.mock.calls.length).toBeGreaterThan(viaClock);
    } finally {
      spy.mockRestore();
    }
  });

  it('paints exactly what the driver’s own clock paints, across intro, hold and outro', () => {
    // A sweep rather than a spot check: the two paths must agree at every phase and at
    // every boundary, which is what makes a later fork fail loudly instead of drifting.
    // Elapsed 0 and below is deliberately absent — that is the D-125 POSTER rest rule,
    // which sits ON TOP of the mapping and is asserted in its own test below.
    for (const elapsed of [10, 25, 49, 50, 51, 120, 1000]) {
      const clocked = makeDriver({ introEnd: 5, holdBehavior: 'freeze' });
      clocked.driver.reset();
      clocked.driver.start();
      clocked.clock.advance(elapsed);

      const positioned = makeDriver({ introEnd: 5, holdBehavior: 'freeze' });
      positioned.driver.positionAt(elapsed, null);
      expect(last(positioned.handle)).toBe(last(clocked.handle));
    }
  });

  it('positions the OUT phase from the composition’s out-point, clamped at `op`', () => {
    const { driver, handle } = makeDriver({ introEnd: 5, outroStart: 50, op: 60 });
    driver.positionAt(0, 0);
    expect(last(handle)).toBe(50);
    driver.positionAt(0, 50); // +5 frames at 100fps
    expect(last(handle)).toBe(55);
    driver.positionAt(0, 200); // past `op` — clamped, never overshot
    expect(last(handle)).toBe(60);
  });

  it('an idle-loop hold wraps under the playhead exactly as it does under the clock', () => {
    const { driver, handle } = makeDriver({
      introEnd: 5,
      idleIn: 5,
      idleOut: 10,
      holdBehavior: 'idle-loop',
    });
    driver.positionAt(50, null); // advanced 5 → the hold entry
    expect(last(handle)).toBe(5);
    driver.positionAt(70, null); // advanced 7 → 2 into the 5-frame idle span
    expect(last(handle)).toBe(7);
    driver.positionAt(100, null); // advanced 10 → wrapped
    expect(last(handle)).toBe(5);
  });

  it('🔴 at or before the run’s start it rests on the POSTER, never on `ip`', () => {
    // D-125 SURVIVES D-135. `ip` is the intro-START, where a furniture clip has scaled
    // the graphic to nothing, and a scene OPENS with its playhead at the in-point — so
    // painting the mapped frame here would put an empty box on the design surface, which
    // is the exact bug the poster was filed to fix. The two answer different questions:
    // the poster is what the canvas shows when the playhead has NOT entered the
    // composition, the mapping is what it shows when it has.
    const { driver, handle } = makeDriver({ ip: 3, introEnd: 50, posterFrame: 30 });
    driver.positionAt(0, null);
    expect(last(handle)).toBe(30);
    driver.positionAt(-500, null);
    expect(last(handle)).toBe(30);
    // One frame in, the playhead owns it again.
    driver.positionAt(10, null);
    expect(last(handle)).toBe(4);
  });

  it('with no explicit posterFrame the rest frame falls back to the hold frame', () => {
    const { driver, handle } = makeDriver({ ip: 3, introEnd: 50 });
    driver.positionAt(0, null);
    expect(last(handle)).toBe(50);
  });

  it('the OUT phase is never the poster — an out-point at the in-point still positions', () => {
    // The rest rule is keyed on the INTRO elapsed only: a playhead that has entered the
    // OUT phase is being scrubbed, whatever the intro elapsed reads.
    const { driver, handle } = makeDriver({ ip: 0, introEnd: 5, outroStart: 50, op: 60 });
    driver.positionAt(0, 0);
    expect(last(handle)).toBe(50);
  });

  it('it never starts a clock, and a LIVE driver is not fought', () => {
    const { driver, handle, clock } = makeDriver({ introEnd: 100 });
    driver.positionAt(10, null);
    expect(last(handle)).toBe(1);
    // No rAF was armed: the playhead is the only clock on this path.
    expect(clock.pending).toHaveLength(0);

    // Once the driver runs its own lifecycle it OWNS the frame — a stray tick is a no-op.
    driver.reset();
    driver.start();
    clock.advance(30);
    const owned = last(handle);
    const count = handle.frames.length;
    driver.positionAt(0, null);
    driver.positionAt(900, null);
    expect(handle.frames).toHaveLength(count);
    expect(last(handle)).toBe(owned);
  });

  it('a frozen hold is owned too — the playhead does not yank it out of the hold', () => {
    const { driver, handle, clock } = makeDriver({ introEnd: 5 });
    driver.reset();
    driver.start();
    clock.advance(100); // past introEnd → settled freeze at 5
    expect(last(handle)).toBe(5);
    const count = handle.frames.length;
    driver.positionAt(0, null);
    expect(handle.frames).toHaveLength(count);
  });

  it('a destroyed driver paints nothing', () => {
    const { driver, handle } = makeDriver();
    driver.destroy();
    const count = handle.frames.length;
    driver.positionAt(10, null);
    expect(handle.frames).toHaveLength(count);
  });
});
