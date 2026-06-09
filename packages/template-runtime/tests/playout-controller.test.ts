import { describe, expect, it } from 'vitest';
import type { Lifecycle, Playout } from '@cg/shared-schema';
import { PlayoutController } from '../src/playout-controller.js';

/** Fake rAF + timer clock so lifecycle timing is deterministic. */
function makeClock() {
  let ms = 0;
  let rafQueue: ((ts: number) => void)[] = [];
  const timers: { id: number; due: number; cb: () => void }[] = [];
  let nextId = 1;
  return {
    now: () => ms,
    raf: (cb: (ts: number) => void) => {
      rafQueue.push(cb);
      return rafQueue.length;
    },
    cancel: () => {
      rafQueue = [];
    },
    setTimeout: (cb: () => void, delay: number) => {
      const id = nextId++;
      timers.push({ id, due: ms + delay, cb });
      return id;
    },
    clearTimeout: (h: unknown) => {
      const i = timers.findIndex((t) => t.id === h);
      if (i >= 0) timers.splice(i, 1);
    },
    /** Advance time, firing due timers then flushing one rAF round. */
    advance: (delta: number) => {
      ms += delta;
      const due = timers.filter((t) => t.due <= ms).sort((a, b) => a.due - b.due);
      for (const t of due) {
        const i = timers.indexOf(t);
        if (i >= 0) timers.splice(i, 1);
        t.cb();
      }
      const cbs = rafQueue;
      rafQueue = [];
      for (const cb of cbs) cb(ms);
    },
  };
}

const active = { in: 0, out: 50 };
// Single out-point: intro [0, 40], hold at 40, outro [40, 50].
const lifecycle: Lifecycle = { outPoint: 40 };

interface Harness {
  controller: PlayoutController;
  frames: number[];
  events: string[];
  clock: ReturnType<typeof makeClock>;
}

function make(
  playout: Playout,
  opts: { lifecycle?: Lifecycle; hasAnimation?: boolean; durationHook?: () => number } = {},
): Harness {
  const clock = makeClock();
  const frames: number[] = [];
  const events: string[] = [];
  const controller = new PlayoutController({
    frameRate: 50,
    active,
    lifecycle: 'lifecycle' in opts ? opts.lifecycle : lifecycle,
    playout,
    hasAnimation: opts.hasAnimation ?? false,
    applyFrame: (f) => frames.push(f),
    onExitStart: () => events.push('exit'),
    onSettle: () => events.push('settle'),
    durationHook: opts.durationHook,
    clock,
  });
  return { controller, frames, events, clock };
}

describe('PlayoutController', () => {
  it('manual: play runs the full intro and holds at the out-point (no loop, no auto-outro)', () => {
    const h = make({ mode: 'manual' });
    h.controller.play();
    expect(h.frames).toEqual([40]); // held at outPoint
    expect(h.events).toEqual([]); // no exit while holding
    h.clock.advance(10_000); // time passes — still holding, nothing changes
    expect(h.frames).toEqual([40]);
    expect(h.events).toEqual([]);
  });

  it('manual: stop runs the outro then settles', () => {
    const h = make({ mode: 'manual' });
    h.controller.play();
    h.controller.stop();
    expect(h.frames).toEqual([40, 50]); // outro played to active.out
    expect(h.events).toEqual(['exit', 'settle']);
  });

  it('hold freezes at the out-point — the entrance plays once and does not loop', () => {
    const h = make({ mode: 'manual' }, { hasAnimation: true });
    h.controller.play();
    for (let i = 0; i < 60; i++) h.clock.advance(20); // run well past the intro
    expect(Math.max(...h.frames)).toBe(40); // never past outPoint
    expect(h.frames[h.frames.length - 1]).toBe(40); // settled frozen at outPoint
    const len = h.frames.length;
    h.clock.advance(5000);
    expect(h.frames.length).toBe(len); // frozen — no new frames (not looping)
  });

  it('no out-point: play plays the whole timeline once and holds the last frame (not loop)', () => {
    const h = make({ mode: 'manual' }, { lifecycle: undefined, hasAnimation: true });
    h.controller.play();
    for (let i = 0; i < 70; i++) h.clock.advance(20);
    expect(Math.max(...h.frames)).toBe(50); // implicit out-point = active.out
    expect(h.frames[h.frames.length - 1]).toBe(50); // holds the last frame
    const len = h.frames.length;
    h.clock.advance(5000);
    expect(h.frames.length).toBe(len); // frozen, not looping
  });

  it('no out-point: stop plays the (empty) outro and settles', () => {
    const h = make({ mode: 'manual' }, { lifecycle: undefined });
    h.controller.play();
    expect(h.events).toEqual([]);
    h.controller.stop();
    expect(h.events).toEqual(['exit', 'settle']);
  });

  it('auto-out: plays the outro automatically after holdMs', () => {
    const h = make({ mode: 'auto-out', holdMs: 2000 });
    h.controller.play();
    expect(h.events).toEqual([]); // still holding
    h.clock.advance(1999);
    expect(h.events).toEqual([]); // not yet
    h.clock.advance(1);
    expect(h.events).toEqual(['exit', 'settle']);
    expect(h.frames).toEqual([40, 50]);
  });

  it('loop-cycle: repeats N times then settles once', () => {
    const h = make({ mode: 'loop-cycle', holdMs: 1000, repeat: 2 });
    h.controller.play();
    h.clock.advance(1000); // cycle 1 outro → cycle 2 intro (not final, no exit)
    expect(h.events).toEqual([]);
    h.clock.advance(1000); // cycle 2 outro → final settle
    expect(h.events).toEqual(['exit', 'settle']);
  });

  it('loop-cycle infinite: never settles on its own; stop() ends it', () => {
    const h = make({ mode: 'loop-cycle', holdMs: 500, repeat: 'infinite' });
    h.controller.play();
    for (let i = 0; i < 5; i++) h.clock.advance(500);
    expect(h.events).toEqual([]); // keeps looping
    h.controller.stop();
    expect(h.events).toEqual(['exit', 'settle']);
  });

  it('pause/resume freezes the hold countdown', () => {
    const h = make({ mode: 'auto-out', holdMs: 2000 });
    h.controller.play();
    h.clock.advance(1000); // half the hold elapsed
    h.controller.pause();
    h.clock.advance(5000); // paused — countdown frozen
    expect(h.events).toEqual([]);
    h.controller.resume();
    h.clock.advance(999);
    expect(h.events).toEqual([]); // 1000 + 999 < 2000
    h.clock.advance(1);
    expect(h.events).toEqual(['exit', 'settle']);
  });

  it('content-driven: each pass takes its duration from the durationHook (holdMs ignored)', () => {
    // holdMs is present but MUST be ignored for content-driven; the hook wins.
    const h = make(
      { mode: 'content-driven', holdMs: 99 },
      { durationHook: () => 3000 },
    );
    h.controller.play();
    h.clock.advance(2999);
    expect(h.events).toEqual([]);
    h.clock.advance(1); // single pass (repeat defaults to 1) → settle
    expect(h.events).toEqual(['exit', 'settle']);
  });

  it('content-driven repeat = N: runs N passes then settles once', () => {
    const h = make(
      { mode: 'content-driven', repeat: 3 },
      { durationHook: () => 1000 },
    );
    h.controller.play();
    h.clock.advance(1000); // pass 1 → pass 2 (not final)
    expect(h.events).toEqual([]);
    h.clock.advance(1000); // pass 2 → pass 3 (not final)
    expect(h.events).toEqual([]);
    h.clock.advance(1000); // pass 3 → final settle
    expect(h.events).toEqual(['exit', 'settle']);
  });

  it('content-driven repeat = infinite: loops the pass forever; stop() ends it', () => {
    const h = make(
      { mode: 'content-driven', repeat: 'infinite' },
      { durationHook: () => 500 },
    );
    h.controller.play();
    for (let i = 0; i < 8; i++) h.clock.advance(500);
    expect(h.events).toEqual([]); // keeps looping, never settles on its own
    h.controller.stop();
    expect(h.events).toEqual(['exit', 'settle']);
  });

  it('content-driven: the duration hook is re-read each pass (dynamic content)', () => {
    const durations = [400, 700];
    let i = 0;
    const h = make(
      { mode: 'content-driven', repeat: 2 },
      { durationHook: () => durations[i++] ?? 0 },
    );
    h.controller.play();
    h.clock.advance(400); // pass 1 used 400ms → pass 2
    expect(h.events).toEqual([]);
    h.clock.advance(699);
    expect(h.events).toEqual([]); // pass 2 needs 700ms, not 400
    h.clock.advance(1);
    expect(h.events).toEqual(['exit', 'settle']);
  });
});

describe('PlayoutController — D-026 state-aware stop', () => {
  it('stop() on a SETTLED auto-out controller is a no-op (does not replay the exit)', () => {
    const h = make({ mode: 'auto-out', holdMs: 1000 });
    h.controller.play();
    h.clock.advance(1000); // hold elapses → outro → settle
    expect(h.events).toEqual(['exit', 'settle']);
    expect(h.controller.isSettled()).toBe(true);
    h.controller.stop(); // already finished — must NOT re-exit
    expect(h.events).toEqual(['exit', 'settle']); // unchanged
  });

  it('stop() on a COMPLETED finite loop-cycle is a no-op', () => {
    const h = make({ mode: 'loop-cycle', holdMs: 500, repeat: 2 });
    h.controller.play();
    h.clock.advance(500); // cycle 1 → cycle 2
    h.clock.advance(500); // cycle 2 → settle
    expect(h.events).toEqual(['exit', 'settle']);
    expect(h.controller.isSettled()).toBe(true);
    h.controller.stop();
    expect(h.events).toEqual(['exit', 'settle']); // not re-exited
  });

  it('stop() still exits an INFINITE loop (it never settles on its own)', () => {
    const h = make({ mode: 'loop-cycle', holdMs: 500, repeat: 'infinite' });
    h.controller.play();
    for (let i = 0; i < 4; i++) h.clock.advance(500);
    expect(h.events).toEqual([]); // looping, not settled
    expect(h.controller.isSettled()).toBe(false);
    h.controller.stop();
    expect(h.events).toEqual(['exit', 'settle']);
  });

  it('stop() still exits a MANUAL hold', () => {
    const h = make({ mode: 'manual' });
    h.controller.play();
    expect(h.controller.isSettled()).toBe(false);
    h.controller.stop();
    expect(h.events).toEqual(['exit', 'settle']);
  });

  it('stop() still exits a PAUSED controller', () => {
    const h = make({ mode: 'auto-out', holdMs: 1000 });
    h.controller.play();
    h.clock.advance(400);
    h.controller.pause();
    expect(h.controller.isSettled()).toBe(false);
    h.controller.stop();
    expect(h.events).toEqual(['exit', 'settle']);
  });
});
