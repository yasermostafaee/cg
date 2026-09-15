/** @vitest-environment jsdom */
import { describe, expect, it } from 'vitest';
import { withCgControl, type FieldValues, type Scene } from '@cg/shared-schema';
import { createRuntime } from '../src/runtime.js';

/**
 * 🔴 `TIMING-WIRE-22` (b) — A `CG UPDATE` CHANGES THE RUNNING LOOP, AND DOES NOT RESTART IT.
 *
 * The far end of the road. `cg-control-timing.test.ts` proves the payload survives the wire;
 * this proves the page ACTS on it — against the real `createRuntime`, through the real
 * `update()`, with no seam invented for the test.
 *
 * ⚠ The thing being guarded is that this is NOT a rebuild. Every other route to a playout knob
 * goes through `scene-replace` → `remove()` + `createRuntime()`, which on air is a black frame
 * in the middle of a live graphic. If this ever starts rebuilding, the graphic on screen dies
 * for a frame and the tests below would still pass unless they watch for it — so they watch the
 * settle events, which a rebuild would reset.
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

/** A looping composition whose pass is exactly its hold (no animation ⇒ instant legs). */
const PASS_MS = 1000;

function loopingScene(): Scene {
  return {
    schemaVersion: 1,
    id: 'scene-1',
    name: 'Looper',
    templateType: 'custom',
    resolution: { width: 1920, height: 1080 },
    frameRate: 50,
    safeAreas: { title: 10, action: 5 },
    frameRange: { in: 0, out: 50 },
    lifecycle: { outPoint: 40 },
    editorBackdrop: 'transparent',
    playout: { mode: 'loop-cycle', holdSource: 'timed', holdMs: PASS_MS, repeat: 'infinite' },
    layers: [
      { id: 'L1', name: 'l', visible: true, locked: false, blendMode: 'normal', children: [] },
    ],
    fields: [],
    bindings: [],
    fonts: [],
    metadata: { createdAt: '2026-09-15T00:00:00.000Z', updatedAt: '2026-09-15T00:00:00.000Z' },
  } as unknown as Scene;
}

interface Live {
  rt: ReturnType<typeof createRuntime>;
  settles: number;
  clock: ReturnType<typeof makeClock>;
  host: HTMLDivElement;
}

async function onAir(): Promise<Live> {
  const clock = makeClock();
  const host = document.createElement('div');
  document.body.appendChild(host);
  const rt = createRuntime(loopingScene(), { host, skipFontLoad: true, clock });
  let settles = 0;
  rt.on('stop.end', () => {
    settles += 1;
  });
  await rt.play({});
  return {
    rt,
    clock,
    host,
    get settles() {
      return settles;
    },
  } as unknown as Live;
}

const runPasses = (l: Live, n: number): void => {
  for (let i = 0; i < n; i++) l.clock.advance(PASS_MS);
};

describe('TIMING-WIRE-22 (b) — the page applies __cg.timing to the running controller', () => {
  it('a CG UPDATE carrying two passes ends the loop after exactly two more', async () => {
    const l = await onAir();
    l.clock.advance(PASS_MS / 2); // mid-pass 1

    await l.rt.update(withCgControl({} as FieldValues, { timing: { passes: 2 } }));

    runPasses(l, 1);
    expect(l.settles, 'the pass on screen was counted — it must not be').toBe(0);
    runPasses(l, 2);
    expect(l.settles, 'two more passes were asked for and did not end the loop').toBe(1);
    l.host.remove();
  });

  it('ZERO takes it out after the current pass, without cutting it', async () => {
    const l = await onAir();
    l.clock.advance(PASS_MS / 2);

    await l.rt.update(withCgControl({} as FieldValues, { timing: { passes: 0 } }));

    expect(l.settles, 'zero cut the graphic instead of letting the pass finish').toBe(0);
    runPasses(l, 1);
    expect(l.settles).toBe(1);
    l.host.remove();
  });

  it('an ordinary field update leaves a running count alone', async () => {
    // ABSENT MEANS UNCHANGED. If an update without a timing member reset the count, every text
    // correction during a show would silently re-arm the loop.
    const l = await onAir();
    l.clock.advance(PASS_MS / 2);
    await l.rt.update(withCgControl({} as FieldValues, { timing: { passes: 1 } }));

    await l.rt.update({ headline: 'new text' } as unknown as FieldValues);

    runPasses(l, 1);
    expect(l.settles, 'a plain field update disturbed the count').toBe(0);
    runPasses(l, 1);
    expect(l.settles).toBe(1);
    l.host.remove();
  });

  it('a malformed timing member changes nothing rather than throwing', async () => {
    // A page that throws inside update() takes the whole graphic off air.
    const l = await onAir();
    l.clock.advance(PASS_MS / 2);

    await expect(
      l.rt.update({ __cg: { timing: { passes: 'lots' } } } as unknown as FieldValues),
    ).resolves.toBeUndefined();

    runPasses(l, 4);
    expect(l.settles, 'a malformed count stopped an infinite loop').toBe(0);
    l.host.remove();
  });

  it('the delay arrives and holds the graphic off screen between passes', async () => {
    const l = await onAir();

    await l.rt.update(withCgControl({} as FieldValues, { timing: { delayMs: 400, passes: 1 } }));

    runPasses(l, 1); // current pass ends; the gap begins
    expect(l.settles, 'it settled instead of entering the gap').toBe(0);
    l.clock.advance(400); // gap over → the last pass runs
    runPasses(l, 1);
    expect(l.settles).toBe(1);
    l.host.remove();
  });
});
