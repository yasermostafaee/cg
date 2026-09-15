import { describe, expect, it } from 'vitest';
import type { Lifecycle, Playout } from '@cg/shared-schema';
import { PlayoutController } from '../src/playout-controller.js';

/**
 * 🔴 **`TIMING-WIRE-22 · DELTA A1` — `passes` IS RELATIVE, SO RE-SENDING IT RE-ARMS IT.**
 *
 * The count crossing the wire is "remaining FROM NOW". That makes it an INSTRUCTION, not a
 * value, and an instruction is not idempotent: sending `2` to a page that already ran one of its
 * two gives it two more, not one.
 *
 * Everything the restore does downstream of that fact depends on it, so it is pinned here on its
 * own, at the controller, where it can be seen in isolation.
 *
 * ⚠ The second case pins the other half of the same fact: a count set BEFORE `play()` does NOT
 * survive, because `play()` snapshots `repeatOf(playout)` into `cyclesLeft`. Both are properties
 * of the same design — the count is a live edit to a running loop, not a stored setting — and
 * both are consequences a caller has to know about rather than defects in the controller.
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

const PASS_MS = 1000;
const active = { in: 0, out: 50 };
const lifecycle: Lifecycle = { outPoint: 40 };

function make(playout: Playout): {
  controller: PlayoutController;
  events: string[];
  clock: ReturnType<typeof makeClock>;
} {
  const clock = makeClock();
  const events: string[] = [];
  const controller = new PlayoutController({
    frameRate: 50,
    active,
    lifecycle,
    playout,
    hasAnimation: false,
    // These cases assert on EVENTS, not frames — the arithmetic is what is under test.
    applyFrame: () => undefined,
    onExitStart: () => events.push('exit'),
    onSettle: () => events.push('settle'),
    clock,
  });
  return { controller, events, clock };
}

const looping = (): Playout => ({
  mode: 'loop-cycle',
  holdSource: 'timed',
  holdMs: PASS_MS,
  repeat: 'infinite',
});

describe('DELTA A1 — re-sending a relative count RE-ARMS it', () => {
  it('🔴 sending 2 again after ONE pass gives two more, not one', () => {
    /*
      This is the restore's exact shape. The operator sets 2 on air; one pass completes, so ONE
      remains; the bridge restarts and re-sends the value it recorded — which is still `2`,
      because the bridge stores the instruction, not a counter it has been tracking.

      The page is now told "two more from now" a second time. It obeys.
    */
    const h = make(looping());
    h.controller.play();
    h.controller.setRemainingPasses(2); // on air, during pass 1

    // "2 more after the one on screen" is THREE passes in total, so three boundaries.
    h.clock.advance(PASS_MS); // pass 1 completes; TWO of the three remain
    expect(h.events).toEqual([]);

    // THE RESTORE TELL — the same relative number, sent again.
    h.controller.setRemainingPasses(2);

    h.clock.advance(PASS_MS); // pass 2
    h.clock.advance(PASS_MS); // pass 3 — a CORRECT restore ends it here
    expect(h.events, 'it ended correctly — the re-arm did not happen').toEqual([]);
    h.clock.advance(PASS_MS); // pass 4, which should never have run
    expect(h.events, 'it never ended at all').toContain('settle');
  });

  it('…where NOT re-sending ends it after exactly the passes asked for', () => {
    // The control for the case above: same fixture, same clock, no second send. Without this the
    // first case could pass on a fixture that simply never settles.
    const h = make(looping());
    h.controller.play();
    h.controller.setRemainingPasses(2);

    h.clock.advance(PASS_MS);
    h.clock.advance(PASS_MS);
    expect(h.events, 'it ended a pass early').toEqual([]);
    h.clock.advance(PASS_MS);
    expect(h.events, 'two more passes were asked for and two more ran').toContain('settle');
  });
});

describe('DELTA A1 / A3 — a count set BEFORE play() does not survive play()', () => {
  it('🔴 play() snapshots the AUTHORED repeat, discarding a pre-play count', () => {
    /*
      `play()` is `cyclesLeft = repeatOf(this.o.playout)`, so anything `setRemainingPasses` wrote
      beforehand is overwritten. That is correct for what the method IS — a live edit to a
      running loop — but it means the OFF-AIR path cannot be built on it: a count delivered by
      `CG ADD` (which reaches the page through `update()`) is discarded by the `CG PLAY` that
      follows it.
    */
    const h = make({ ...looping(), repeat: 3 });
    h.controller.setRemainingPasses(0); // "out after the current pass" — before anything runs
    h.controller.play();

    // If the pre-play count had survived, this would settle after one pass.
    h.clock.advance(PASS_MS);
    expect(h.events, 'the pre-play count survived — it does not').toEqual([]);
    h.clock.advance(PASS_MS);
    h.clock.advance(PASS_MS);
    expect(h.events, 'it ran the AUTHORED 3 instead').toContain('settle');
  });
});
