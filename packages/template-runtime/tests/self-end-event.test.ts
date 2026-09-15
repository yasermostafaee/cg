/** @vitest-environment jsdom */
import { describe, expect, it } from 'vitest';
import { withCgControl, type FieldValues, type Scene } from '@cg/shared-schema';
import { createRuntime } from '../src/runtime.js';

/**
 * 🔴 `SELF-STOP-24` §2.1 / §2.4 — **THE PAGE'S HALF, END TO END, AGAINST THE REAL RUNTIME.**
 *
 * `self-end-signal.test.ts` proves the CONTROLLER can tell a self-end from an operator exit.
 * `cg-control-take-token.test.ts` proves the token survives the wire. This proves the two meet:
 * `createRuntime` lifts the token off the payload, emits ONE `self-end` carrying it when the
 * ROOT finishes on its own, and emits nothing when the operator takes it off.
 *
 * 🔴 **BOTH DELIVERY DOORS ARE EXERCISED, and that is not belt-and-braces.** `0f54e00d` was a
 * value lifted on `update(data)` and dropped on `play(data)` — silently inert on every host that
 * hands a template its load-time data through `play`, which is what CasparCG does. The owner met
 * that defect on the plant. A token lifted on one door only would fail exactly the same way, and
 * the failure would look like "the feature does nothing" rather than like a bug.
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

function scene(playout: Record<string, unknown>): Scene {
  return {
    schemaVersion: 1,
    id: 'scene-1',
    name: 'Self ender',
    templateType: 'custom',
    resolution: { width: 1920, height: 1080 },
    frameRate: 50,
    safeAreas: { title: 10, action: 5 },
    frameRange: { in: 0, out: 50 },
    lifecycle: { outPoint: 40 },
    editorBackdrop: 'transparent',
    playout,
    layers: [
      { id: 'L1', name: 'l', visible: true, locked: false, blendMode: 'normal', children: [] },
    ],
    fields: [],
    bindings: [],
    fonts: [],
    metadata: { createdAt: '2026-09-15T00:00:00.000Z', updatedAt: '2026-09-15T00:00:00.000Z' },
  } as unknown as Scene;
}

const twoPasses = { mode: 'loop-cycle', holdSource: 'timed', holdMs: PASS_MS, repeat: 2 };
const forever = {
  mode: 'loop-cycle',
  holdSource: 'timed',
  holdMs: PASS_MS,
  repeat: 'infinite',
};

interface Live {
  rt: ReturnType<typeof createRuntime>;
  clock: ReturnType<typeof makeClock>;
  /** Every `self-end` payload, in order. */
  ends: (string | undefined)[];
  stopEnds: number;
}

function mount(playout: Record<string, unknown>): Live {
  const clock = makeClock();
  const host = document.createElement('div');
  document.body.appendChild(host);
  const rt = createRuntime(scene(playout), { host, skipFontLoad: true, clock });
  const ends: (string | undefined)[] = [];
  let stopEnds = 0;
  rt.on('self-end', (e) => {
    ends.push(e.take);
  });
  rt.on('stop.end', () => {
    stopEnds += 1;
  });
  return {
    rt,
    clock,
    ends,
    get stopEnds() {
      return stopEnds;
    },
  } as unknown as Live;
}

const payload = (take: string): FieldValues =>
  withCgControl({} as unknown as FieldValues, { take });

/**
 * ⚠ **ONE `advance()` PER PASS, never one big jump — the fixture's clock fires ONE GENERATION
 * of timers per call.** `advance(delta)` snapshots the due list before running it, so the timer
 * a pass boundary schedules for the NEXT pass is not in that snapshot and waits for the next
 * call. `advance(PASS_MS * 2)` therefore runs ONE pass, not two — which reads as "the runtime
 * never emitted" and sends you looking for a product bug that is not there.
 */
function runPasses(l: Live, n: number): void {
  for (let i = 0; i < n; i++) l.clock.advance(PASS_MS);
}

describe('SELF-STOP-24 — the runtime emits self-end, once, with the take it was given', () => {
  it('a finite loop that runs out emits once, carrying the token from play(data)', async () => {
    const l = mount(twoPasses);
    await l.rt.play(payload('take-play-1'));

    l.clock.advance(PASS_MS);
    expect(l.ends, 'emitted with a pass still to come').toEqual([]);

    l.clock.advance(PASS_MS);
    expect(l.ends, 'the token was dropped on the play() door — 0f54e00d again').toEqual([
      'take-play-1',
    ]);
  });

  it('carries the token from the update(data) door too', async () => {
    const l = mount(twoPasses);
    await l.rt.play({} as unknown as FieldValues);
    await l.rt.update(payload('take-update-1'));

    runPasses(l, 2);
    expect(l.ends, 'the token was dropped on the update() door').toEqual(['take-update-1']);
  });

  it('the LATEST token wins — a refresh supersedes the one the page was booted with', async () => {
    // The re-take case: the producer is resident, so the page is the SAME page and the bridge
    // refreshes the token with a pre-PLAY update. A report must name the run that just ended.
    const l = mount(twoPasses);
    await l.rt.play(payload('take-old'));
    await l.rt.update(payload('take-new'));

    runPasses(l, 2);
    expect(l.ends).toEqual(['take-new']);
  });

  it('emits BEFORE stop.end, so a listener sees the run it names', async () => {
    const order: string[] = [];
    const clock = makeClock();
    const host = document.createElement('div');
    document.body.appendChild(host);
    const rt = createRuntime(scene(twoPasses), { host, skipFontLoad: true, clock });
    rt.on('self-end', () => order.push('self-end'));
    rt.on('stop.end', () => order.push('stop.end'));
    await rt.play(payload('t'));
    clock.advance(PASS_MS);
    clock.advance(PASS_MS);

    expect(order).toEqual(['self-end', 'stop.end']);
  });

  it('an operator stop emits stop.end and NO self-end', async () => {
    const l = mount(forever);
    await l.rt.play(payload('take-1'));
    l.clock.advance(PASS_MS / 2);

    await l.rt.stop();
    l.clock.advance(PASS_MS);

    expect(l.ends, 'an operator stop was reported as the template finishing').toEqual([]);
    expect(l.stopEnds, 'it did not settle — the fixture proves nothing').toBeGreaterThan(0);
  });

  it('an operator out() emits no self-end either', async () => {
    const l = mount(forever);
    await l.rt.play(payload('take-1'));
    l.clock.advance(PASS_MS / 2);

    // ⚠ NOT `await l.rt.out()` — `out()` awaits the content fade, whose timer is on THIS
    // clock. Awaiting before advancing deadlocks the test against its own fixture.
    const exiting = l.rt.out();
    l.clock.advance(PASS_MS);
    await exiting;

    expect(l.ends).toEqual([]);
    expect(l.stopEnds, 'it did not settle — the fixture proves nothing').toBeGreaterThan(0);
  });

  it('an infinite loop emits nothing however long it runs', async () => {
    const l = mount(forever);
    await l.rt.play(payload('take-1'));
    for (let i = 0; i < 20; i++) l.clock.advance(PASS_MS);

    expect(l.ends).toEqual([]);
  });

  it('a page that was never given a token still emits, with no take', async () => {
    // The event is about the LIFECYCLE; arming is the reporter's decision, not the runtime's.
    // Keeping them separate is what lets the Designer preview observe a self-end while opening
    // no connection.
    const l = mount(twoPasses);
    await l.rt.play({} as unknown as FieldValues);
    runPasses(l, 2);

    expect(l.ends).toEqual([undefined]);
  });

  it('a second run emits again — the page is not one-shot', async () => {
    const l = mount(twoPasses);
    await l.rt.play(payload('take-1'));
    runPasses(l, 2);
    expect(l.ends).toEqual(['take-1']);

    await l.rt.play(payload('take-2'));
    runPasses(l, 2);
    expect(l.ends).toEqual(['take-1', 'take-2']);
  });
});
