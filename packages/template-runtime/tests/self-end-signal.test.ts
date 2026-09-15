import { describe, expect, it } from 'vitest';
import type { Lifecycle, Playout } from '@cg/shared-schema';
import { PlayoutController } from '../src/playout-controller.js';

/**
 * 🔴 `SELF-STOP-24` §2.1 — **WHICH SETTLES ARE THE TEMPLATE FINISHING, AND WHICH ARE NOT.**
 *
 * `C-013`'s whole substance is a channel telling the bridge that the CONTENT finished. Before
 * anything can be sent, the runtime has to be able to tell the two kinds of settle apart, and
 * this file is that distinction under test.
 *
 * `PlayoutController` reaches `settled = true` from four places. Only two of them are the
 * template ending by itself:
 *
 * - `onOutroEnd()` with no cycles left — the authored run is over;
 * - `setRemainingPasses(0)` during the between-passes gap — the count ran out and the pass the
 *   operator declined never started.
 *
 * The other two are an external command asking for the exit: `stop()`, and the cascaded `stop()`
 * the runtime's own exit issues. **Those must emit nothing** — the bridge asked for them and
 * does not need telling, and a signal on an operator stop would be a report about a take the
 * console has already moved past.
 *
 * ⚠ **`static`, `manual` and every infinite lifecycle are pinned as an ABSENCE.** They never
 * reach either self-end row — `static`/`manual` have no auto-exit at all, and an infinite
 * `loop-cycle` returns at the `'infinite'` branch before the terminal one. That is a property of
 * the existing control flow rather than a guard anybody wrote, which is exactly why it is worth
 * a test: nothing fails if a later edit gives them a way there.
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

const active = { in: 0, out: 50 };
const lifecycle: Lifecycle = { outPoint: 40 };

/** The fixture's pass length. `hasAnimation: false` ⇒ the legs are instant, so a pass IS the hold. */
const PASS_MS = 1000;

interface Harness {
  controller: PlayoutController;
  /** Every lifecycle callback, in order, so ORDERING is assertable and not merely counts. */
  events: string[];
  clock: ReturnType<typeof makeClock>;
}

function make(playout: Playout): Harness {
  const clock = makeClock();
  const events: string[] = [];
  const controller = new PlayoutController({
    frameRate: 50,
    active,
    lifecycle,
    playout,
    hasAnimation: false,
    applyFrame: () => undefined,
    onExitStart: () => events.push('exit'),
    onSelfEnd: () => events.push('self-end'),
    onSettle: () => events.push('settle'),
    clock,
  });
  return { controller, events, clock };
}

function selfEnds(h: Harness): number {
  return h.events.filter((e) => e === 'self-end').length;
}

describe('SELF-STOP-24 §2.1 — a run that ends by itself announces that it did', () => {
  it('a finite loop-cycle emits exactly once, when its last pass is over', () => {
    const h = make({ mode: 'loop-cycle', holdSource: 'timed', holdMs: PASS_MS, repeat: 2 });
    h.controller.play();

    h.clock.advance(PASS_MS);
    expect(selfEnds(h), 'emitted while a pass was still to come').toBe(0);

    h.clock.advance(PASS_MS);
    expect(selfEnds(h), 'the authored run is over and nothing was announced').toBe(1);
  });

  it('emits BEFORE the settle, so a listener sees the end of the run it names', () => {
    const h = make({ mode: 'loop-cycle', holdSource: 'timed', holdMs: PASS_MS, repeat: 1 });
    h.controller.play();
    h.clock.advance(PASS_MS);

    const selfEndAt = h.events.indexOf('self-end');
    const settleAt = h.events.indexOf('settle');
    expect(selfEndAt, 'never emitted').toBeGreaterThanOrEqual(0);
    expect(settleAt, 'never settled — the fixture proves nothing').toBeGreaterThanOrEqual(0);
    expect(selfEndAt, 'the settle was announced first').toBeLessThan(settleAt);
  });

  it('a timed auto-out emits at its own settle', () => {
    const h = make({ mode: 'auto-out', holdSource: 'timed', holdMs: PASS_MS });
    h.controller.play();

    expect(selfEnds(h), 'emitted before the hold was over').toBe(0);
    h.clock.advance(PASS_MS);
    expect(selfEnds(h), 'the auto-out ran out and nothing was announced').toBe(1);
  });

  it('a live count of ZERO during the gap emits — the declined pass never started', () => {
    const h = make({
      mode: 'loop-cycle',
      holdSource: 'timed',
      holdMs: PASS_MS,
      repeat: 'infinite',
      delayMs: 5000,
    });
    h.controller.play();
    // Finish the pass on screen; the controller is now waiting out the authored gap.
    h.clock.advance(PASS_MS);
    expect(selfEnds(h), 'emitted at a loop boundary — this is not the end of a run').toBe(0);

    h.controller.setRemainingPasses(0);
    expect(selfEnds(h), 'the count ran out in the gap and nothing was announced').toBe(1);
    expect(
      h.events.filter((e) => e === 'settle'),
      'it did not actually settle',
    ).toHaveLength(1);
  });

  it('an operator stop emits NOTHING — the party that asked already knows', () => {
    const h = make({
      mode: 'loop-cycle',
      holdSource: 'timed',
      holdMs: PASS_MS,
      repeat: 'infinite',
    });
    h.controller.play();
    h.clock.advance(PASS_MS / 2);

    h.controller.stop();
    h.clock.advance(PASS_MS);

    expect(selfEnds(h), 'an operator stop was reported as the template finishing').toBe(0);
    expect(h.events, 'it did not settle — the fixture proves nothing').toContain('settle');
  });

  it('a stop DURING the between-passes gap emits nothing either', () => {
    const h = make({
      mode: 'loop-cycle',
      holdSource: 'timed',
      holdMs: PASS_MS,
      repeat: 'infinite',
      delayMs: 5000,
    });
    h.controller.play();
    h.clock.advance(PASS_MS); // into the gap

    h.controller.stop();

    expect(selfEnds(h), 'the gap short-circuit reported an operator stop as a self-end').toBe(0);
    expect(h.events, 'it did not settle — the fixture proves nothing').toContain('settle');
  });

  it('an INFINITE loop-cycle never emits, however long it runs', () => {
    const h = make({
      mode: 'loop-cycle',
      holdSource: 'timed',
      holdMs: PASS_MS,
      repeat: 'infinite',
    });
    h.controller.play();
    for (let i = 0; i < 20; i++) h.clock.advance(PASS_MS);

    expect(selfEnds(h), 'a graphic that never ends announced that it had').toBe(0);
  });

  it('a MANUAL lifecycle never emits', () => {
    const h = make({ mode: 'manual' });
    h.controller.play();
    for (let i = 0; i < 20; i++) h.clock.advance(PASS_MS);

    expect(selfEnds(h), 'a manual graphic announced an end nobody asked it to reach').toBe(0);
  });

  it('a STATIC lifecycle never emits', () => {
    const h = make({ mode: 'static' });
    h.controller.play();
    for (let i = 0; i < 20; i++) h.clock.advance(PASS_MS);

    expect(selfEnds(h), 'a static graphic announced an end').toBe(0);
  });

  it('an absent onSelfEnd is a silent no-op — every existing caller still works', () => {
    const clock = makeClock();
    const events: string[] = [];
    const controller = new PlayoutController({
      frameRate: 50,
      active,
      lifecycle,
      playout: { mode: 'auto-out', holdSource: 'timed', holdMs: PASS_MS },
      hasAnimation: false,
      applyFrame: () => undefined,
      onExitStart: () => events.push('exit'),
      onSettle: () => events.push('settle'),
      clock,
    });
    controller.play();
    expect(() => clock.advance(PASS_MS)).not.toThrow();
    expect(events).toContain('settle');
  });
});
