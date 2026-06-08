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
const lifecycle: Lifecycle = { introEndFrame: 10, outroStartFrame: 40 };

interface Harness {
  controller: PlayoutController;
  frames: number[];
  events: string[];
  clock: ReturnType<typeof makeClock>;
}

function make(
  playout: Playout,
  opts: { lifecycle?: Lifecycle; hasAnimation?: boolean } = {},
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
    clock,
  });
  return { controller, frames, events, clock };
}

describe('PlayoutController', () => {
  it('manual: play runs the intro and holds (no loop, no auto-outro)', () => {
    const h = make({ mode: 'manual' });
    h.controller.play();
    expect(h.frames).toEqual([10]); // held at introEndFrame
    expect(h.events).toEqual([]); // no exit while holding
    h.clock.advance(10_000); // time passes — still holding, nothing changes
    expect(h.frames).toEqual([10]);
    expect(h.events).toEqual([]);
  });

  it('manual: stop runs the outro then settles', () => {
    const h = make({ mode: 'manual' });
    h.controller.play();
    h.controller.stop();
    expect(h.frames).toEqual([10, 50]); // outro played to active.out
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
    expect(h.frames).toEqual([10, 50]);
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

  it('content-driven: uses the durationHook for the hold', () => {
    const clock = makeClock();
    const events: string[] = [];
    const controller = new PlayoutController({
      frameRate: 50,
      active,
      lifecycle,
      playout: { mode: 'content-driven' },
      hasAnimation: false,
      applyFrame: () => undefined,
      onExitStart: () => events.push('exit'),
      onSettle: () => events.push('settle'),
      durationHook: () => 3000,
      clock,
    });
    controller.play();
    clock.advance(2999);
    expect(events).toEqual([]);
    clock.advance(1);
    expect(events).toEqual(['exit', 'settle']);
  });

  it('no lifecycle: stop settles instantly (legacy behaviour)', () => {
    const h = make({ mode: 'manual' }, { lifecycle: undefined });
    h.controller.play();
    expect(h.events).toEqual([]);
    h.controller.stop();
    expect(h.events).toEqual(['exit', 'settle']);
  });
});
