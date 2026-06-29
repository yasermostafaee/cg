import { describe, expect, it } from 'vitest';
import { playoutOf } from '@cg/shared-schema';
import { createRuntime } from '../src/runtime.js';
import { lowerThirdScene } from './fixtures.js';

/**
 * D-114 — `static` playout, verified end-to-end on a REAL no-out-point scene (the Persian
 * lower-third fixture): the whole pipeline `playoutOf` → `PlayoutController` resolves a no-out-point
 * default composition to `static`, which plays in, holds until `stop()`, and hard-cuts (no outro).
 */

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

async function run(
  clock: ReturnType<typeof makeClock>,
  totalMs: number,
  step = 100,
): Promise<void> {
  let left = totalMs;
  while (left > 0) {
    const d = Math.min(step, left);
    clock.advance(d);
    left -= d;
    for (let i = 0; i < 6; i += 1) await Promise.resolve();
  }
}

describe('D-114 — static playout on a real no-out-point scene', () => {
  it('the real lower-third fixture has no out-point and resolves to static', () => {
    expect(lowerThirdScene.lifecycle).toBeUndefined();
    expect(playoutOf(lowerThirdScene).mode).toBe('static');
  });

  it('plays in and HOLDS — a static graphic never auto-outs (holds until stop)', async () => {
    const clock = makeClock();
    const runtime = createRuntime(lowerThirdScene, { skipFontLoad: true, clock });
    const events: string[] = [];
    runtime.on('stop.start', () => events.push('stop.start'));
    runtime.on('stop.end', () => events.push('stop.end'));
    await runtime.play({});
    await run(clock, 10_000); // a long time passes — no holdMs, no content driver
    expect(events).toEqual([]); // static does NOT exit on its own
    await runtime.stop();
  });

  it('stop CUTS cleanly — exits and settles immediately, with no outro segment', async () => {
    const clock = makeClock();
    const runtime = createRuntime(lowerThirdScene, { skipFontLoad: true, clock });
    const events: string[] = [];
    runtime.on('stop.start', () => events.push('stop.start'));
    runtime.on('stop.end', () => events.push('stop.end'));
    await runtime.play({});
    await run(clock, 500); // settle the (instant) intro
    events.length = 0;
    await runtime.stop();
    await run(clock, 50); // a hair of time — a clean cut needs no outro duration
    expect(events).toEqual(['stop.start', 'stop.end']); // immediate exit + settle (empty outro)
  });
});
