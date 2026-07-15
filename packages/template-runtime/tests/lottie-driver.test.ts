import { describe, expect, it } from 'vitest';
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

  it('poster() paints the settled hold frame (introEnd), not the in-frame', () => {
    // The static editor canvas must show the settled graphic, not the invisible
    // intro-start (frame `ip`, where an AE intro has scaled the graphic to nothing).
    const { driver, handle } = makeDriver({ ip: 0, introEnd: 5 });
    driver.poster();
    expect(last(handle)).toBe(5);
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
