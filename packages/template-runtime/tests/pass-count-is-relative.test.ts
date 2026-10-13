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

describe('🔴 DELTA B0 — a count set BEFORE play() is the count that airs', () => {
  /*
    `Passes next take` promised something the system did not do. The off-air count reaches the
    page on the `CG ADD` payload, through `update()`, and the `CG PLAY` that follows used to
    overwrite it with the authored `repeat` — so the operator set 2, saw it stored, took the
    row, and watched the template run its own count.

    🔴 **THE TWO READINGS ARE DIFFERENT NUMBERS, AND THAT IS THE DESIGN, NOT AN INCONSISTENCY.**
    The console says so in its own two labels:

      - OFF AIR — "Passes next take": a TOTAL. `2` airs two passes.
      - ON AIR — "Passes remaining": relative, the pass on screen uncounted. `2` means that one
        finishes and two more play — three in total.

    One stored operator value, read as a total by `play()` and as a remainder by a live edit.
    Anything else would make one of the two labels lie.
  */
  it('an operator count set before play() wins over the authored repeat — as a TOTAL', () => {
    const h = make({ ...looping(), repeat: 5 });
    h.controller.setRemainingPasses(2); // off air: "two passes next take"
    h.controller.play();

    h.clock.advance(PASS_MS);
    expect(h.events, 'it ended after one — the count was read as a remainder').toEqual([]);
    h.clock.advance(PASS_MS);
    expect(h.events, 'two passes were asked for and two passes ran').toContain('settle');
  });

  it('with NO operator count set, the authored repeat applies exactly as before', () => {
    // The other half of the rule, and the one that must not move: a template nobody has
    // touched keeps running what its author asked for.
    const h = make({ ...looping(), repeat: 2 });
    h.controller.play();

    h.clock.advance(PASS_MS);
    expect(h.events).toEqual([]);
    h.clock.advance(PASS_MS);
    expect(h.events).toContain('settle');
  });

  it('an infinite set before play() survives it', () => {
    const h = make({ ...looping(), repeat: 2 });
    h.controller.setRemainingPasses('infinite');
    h.controller.play();

    for (let i = 0; i < 6; i++) h.clock.advance(PASS_MS);
    expect(h.events, 'it stopped despite being told to keep going').toEqual([]);
  });

  it('ZERO set before play() settles after the FIRST pass, not after one more', () => {
    /*
      `0` as a total cannot un-play the pass the take has already started — the `CG ADD` and the
      `CG PLAY` have happened. So it settles at the first boundary. What it must NOT do is take
      the on-air reading (`0` = "let the current one finish, then out"), which from a standing
      start would seat `1` and run a pass the operator did not ask for. Same number, and the
      difference between the two readings is exactly one pass.
    */
    const h = make({ ...looping(), repeat: 3 });
    h.controller.setRemainingPasses(0);
    h.controller.play();

    h.clock.advance(PASS_MS);
    expect(h.events).toContain('settle');
  });

  it('a GAP set before play() survives it too', () => {
    // `play()` never touched `delayMs`, so this half was already correct — pinned so it stays
    // that way, because B0 changes the method around it.
    const h = make({ ...looping(), repeat: 2, delayMs: 0 });
    h.controller.setDelayMs(400);
    h.controller.play();

    h.clock.advance(PASS_MS); // pass 1 ends, the gap begins
    expect(h.events).toEqual([]);
    h.clock.advance(100);
    expect(h.events, 'the gap was discarded by play()').toEqual([]);
    h.clock.advance(400);
    h.clock.advance(PASS_MS);
    expect(h.events).toContain('settle');
  });
});

describe('DELTA A3 — SUPERSEDED BY B0, kept as the record of what was wrong', () => {
  /*
    ⚠ This block used to assert the OPPOSITE — that `play()` discarded a pre-play count — and
    it was right when it was written. `DELTA A3` established that as a defect (the console's
    `Passes next take` label promised something the system did not do), and `DELTA B0` fixed it.

    The case is REPLACED rather than deleted so the reversal is legible: an assertion that was
    green, correct, and describing a defect is exactly the kind a later reader is entitled to
    find an account of.
  */
  it('the pre-play count now survives, and the authored repeat is what it displaces', () => {
    const h = make({ ...looping(), repeat: 3 });
    h.controller.setRemainingPasses(1); // "one pass next take", against an authored 3
    h.controller.play();

    h.clock.advance(PASS_MS);
    expect(h.events, 'it ran the AUTHORED 3 — the operator value was discarded again').toContain(
      'settle',
    );
  });
});
