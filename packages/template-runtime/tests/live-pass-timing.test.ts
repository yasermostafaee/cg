import { describe, expect, it } from 'vitest';
import type { Lifecycle, Playout } from '@cg/shared-schema';
import { PlayoutController } from '../src/playout-controller.js';

/**
 * 🔴 `TIMING-BUILD-21` §6 / §7 — THE LIVE-CHANGE CONTRACT.
 *
 * A row is on air looping. The operator wants two more passes and then out. Everything below is
 * about what must NOT happen when they type that.
 *
 * **IT MUST NOT RESTART.** The pass on screen continues — no jump to frame one, no cut, no
 * instant stop because passes already ran. That is the whole difference between a count you can
 * change on air and one you cannot: today the only way to change a playout override is to tear
 * the runtime down and rebuild it, which is a black frame in the middle of a live graphic.
 *
 * **THE NUMBER MEANS PASSES REMAINING FROM NOW.** Not a total, and the pass currently on screen
 * is NOT counted: typing 2 means this one finishes, two more play, then out as `mode` says.
 * Counting the current pass would make "2" mean one-and-a-bit, which is not a number anybody
 * asked for.
 *
 * **ZERO IS AN INSTRUCTION, NOT AN ERROR.** `0` while running means "after this pass, go out".
 * It is not a stop: `mode`'s out behaviour still runs, so the outro plays.
 *
 * The delay's half (§7): changing it on air takes effect from the NEXT pass and never disturbs
 * the running one — no restart, no truncation, and no gap that was not there.
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

interface Harness {
  controller: PlayoutController;
  frames: number[];
  events: string[];
  clock: ReturnType<typeof makeClock>;
}

function make(playout: Playout): Harness {
  const clock = makeClock();
  const frames: number[] = [];
  const events: string[] = [];
  const controller = new PlayoutController({
    frameRate: 50,
    active,
    lifecycle,
    playout,
    hasAnimation: false,
    applyFrame: (f) => frames.push(f),
    onExitStart: () => events.push('exit'),
    onSettle: () => events.push('settle'),
    clock,
  });
  return { controller, frames, events, clock };
}

/**
 * 🔴 THE FIXTURE'S PASS LENGTH IS THE HOLD, and getting this wrong makes every assertion below
 * mean something else.
 *
 * With `hasAnimation: false` the intro and outro legs are INSTANT — there is nothing to animate,
 * so the controller passes straight through them. A pass is therefore exactly `holdMs`. An
 * earlier draft of this file used a ZERO hold and stepped 20 ms at a time "into the middle of a
 * pass"; with a zero hold there is no middle, and those 200 ms ran a dozen whole passes. The
 * tests failed for a reason that had nothing to do with the code under test.
 */
const PASS_MS = 1000;

/** Advance to roughly the middle of the pass currently running. */
function intoPass(h: Harness): void {
  h.clock.advance(PASS_MS / 2);
}

/** Run the clock far enough to complete `n` whole passes. */
function runPasses(h: Harness, n: number): void {
  for (let i = 0; i < n; i++) h.clock.advance(PASS_MS);
}

describe('TIMING-BUILD-21 §6 — a live pass-count change does not restart the graphic', () => {
  it('leaves the pass on screen running — no jump to frame one', () => {
    const h = make({
      mode: 'loop-cycle',
      holdSource: 'timed',
      holdMs: PASS_MS,
      repeat: 'infinite',
    });
    h.controller.play();
    // Get into the middle of a pass.
    intoPass(h);
    const before = h.frames.at(-1)!;
    expect(before, 'the fixture must actually be mid-pass, or this proves nothing').toBeGreaterThan(
      0,
    );

    h.controller.setRemainingPasses(2);

    const after = h.frames.at(-1)!;
    expect(after, 'the playhead jumped — the graphic restarted').toBeGreaterThanOrEqual(before);
    expect(h.events, 'the graphic exited or settled on a configuration change').toEqual([]);
  });

  it('the number is passes REMAINING, and the current pass is not one of them', () => {
    const h = make({
      mode: 'loop-cycle',
      holdSource: 'timed',
      holdMs: PASS_MS,
      repeat: 'infinite',
    });
    h.controller.play();
    intoPass(h); // mid-pass 1

    h.controller.setRemainingPasses(2);

    // Pass 1 finishes (it was never counted), then exactly two more run, then out.
    runPasses(h, 1);
    expect(h.events, 'the current pass was counted — it must not be').toEqual([]);
    runPasses(h, 2);
    expect(h.events).toContain('settle');
  });

  it('ZERO on air goes out after the current pass — an instruction, not a stop', () => {
    const h = make({
      mode: 'loop-cycle',
      holdSource: 'timed',
      holdMs: PASS_MS,
      repeat: 'infinite',
    });
    h.controller.play();
    intoPass(h);

    h.controller.setRemainingPasses(0);

    expect(h.events, 'zero cut the graphic instantly instead of letting the pass finish').toEqual(
      [],
    );
    runPasses(h, 1);
    // `mode`'s out behaviour still runs: the outro plays and the graphic exits.
    expect(h.events).toContain('exit');
    expect(h.events).toContain('settle');
  });

  it('infinite while running is legal and keeps it going', () => {
    const h = make({ mode: 'loop-cycle', holdSource: 'timed', holdMs: PASS_MS, repeat: 2 });
    h.controller.play();
    intoPass(h);

    h.controller.setRemainingPasses('infinite');

    runPasses(h, 6);
    expect(h.events, 'it stopped despite being told to keep going').toEqual([]);
  });

  it('raising the count mid-run adds passes rather than restarting the count', () => {
    const h = make({ mode: 'loop-cycle', holdSource: 'timed', holdMs: PASS_MS, repeat: 2 });
    h.controller.play();
    intoPass(h);

    h.controller.setRemainingPasses(4);

    runPasses(h, 4);
    expect(h.events, 'four more passes were asked for; it ended early').toEqual([]);
    runPasses(h, 1);
    expect(h.events).toContain('settle');
  });

  it('a settled controller ignores a live count change', () => {
    // Nothing is on air to keep running, and re-arming a finished graphic from a configuration
    // verb would put a picture back on screen that the operator took off.
    const h = make({ mode: 'auto-out', holdSource: 'timed', holdMs: PASS_MS });
    h.controller.play();
    runPasses(h, 2);
    expect(h.events).toContain('settle');
    const settledAt = h.events.length;

    h.controller.setRemainingPasses(3);
    runPasses(h, 3);
    expect(h.events.length, 'a settled graphic came back').toBe(settledAt);
  });
});

describe('TIMING-BUILD-21 §7 — a live delay change never disturbs the running pass', () => {
  it('takes effect from the NEXT gap, leaving the one in flight alone', () => {
    const playout: Playout = {
      mode: 'loop-cycle',
      holdSource: 'timed',
      holdMs: PASS_MS,
      repeat: 'infinite',
      delayMs: 200,
    };
    const h = make(playout);
    h.controller.play();
    runPasses(h, 1); // pass 1 done; we are inside the 200 ms gap

    const framesAtGapStart = h.frames.length;
    // The operator changes the gap while it is running. The controller re-reads `delayMs` at
    // every boundary rather than snapshotting it, so this is simply a mutation of the config.
    playout.delayMs = 5000;

    // The IN-FLIGHT gap keeps its original 200 ms: the next pass starts on the old timing.
    h.clock.advance(200);
    expect(
      h.frames.length,
      'the running gap was stretched by a change that should apply to the NEXT one',
    ).toBeGreaterThan(framesAtGapStart);
  });

  it('a zero gap stays synchronous — no frame of black anybody asked for', () => {
    const h = make({
      mode: 'loop-cycle',
      holdSource: 'timed',
      holdMs: PASS_MS,
      repeat: 2,
      delayMs: 0,
    });
    h.controller.play();
    runPasses(h, 2);
    // With no gap the two passes complete and settle without an extra timer tick between them.
    expect(h.events).toContain('settle');
  });

  it('a gap actually holds the graphic off screen before the next pass', () => {
    const h = make({
      mode: 'loop-cycle',
      holdSource: 'timed',
      holdMs: PASS_MS,
      repeat: 'infinite',
      delayMs: 400,
    });
    h.controller.play();
    runPasses(h, 1);
    const atGap = h.frames.length;
    h.clock.advance(100); // still inside the gap
    expect(h.frames.length, 'the gap is not holding — frames kept coming').toBe(atGap);
    h.clock.advance(400); // past it
    expect(h.frames.length).toBeGreaterThan(atGap);
  });

  it('stopping DURING a gap settles without replaying an outro over nothing', () => {
    const h = make({
      mode: 'loop-cycle',
      holdSource: 'timed',
      holdMs: PASS_MS,
      repeat: 'infinite',
      delayMs: 5000,
    });
    h.controller.play();
    runPasses(h, 1);
    // A NON-final outro announces no exit — the graphic is cycling, not leaving — so nothing
    // has been announced yet at this point, and the gap is running.
    expect(h.events.filter((e) => e === 'exit')).toHaveLength(0);

    h.controller.stop();

    expect(h.events).toContain('settle');
    // ONE departure, ONE announcement. Before the `gap` phase existed, `stop()` here fell
    // through to `startOutro()` and replayed an exit from an already-hidden state: an outro
    // animation over nothing, and a second `onExitStart` for a single departure.
    expect(
      h.events.filter((e) => e === 'exit'),
      'the one departure was announced more than once',
    ).toHaveLength(1);
  });
});
