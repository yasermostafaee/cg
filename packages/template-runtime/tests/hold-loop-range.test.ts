import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Element, Playout, Scene } from '@cg/shared-schema';
import { createRuntime } from '../src/runtime.js';
import { FrameDriver } from '../src/frame-driver.js';
import { ClockDriver } from '../src/clock-driver.js';
import { SequenceDriver } from '../src/sequence-driver.js';
import { TickerDriver } from '../src/ticker-driver.js';

/**
 * D-133 §2 — THE HOLD LOOP: a content-driven hold renders as a repeating
 * `[contentStart → outPoint]` instead of a parked out-point frame.
 *
 * The item is not "the playhead wraps" — that half is cheap. The item is **what the wrap
 * must NOT do**: "wrap the playhead, continue the content" is a different machine from
 * "wrap the playhead, restart the content", and a design that restarts the driver at the
 * seam fails D-133 even when the playhead behaviour is identical. §8 risk 1 says that
 * invariant is satisfiable BY ACCIDENT and breakable by accident, so it is asserted here
 * on the MECHANISM (spies on every content driver's lifecycle methods), never inferred
 * from the crawl looking continuous.
 *
 * ── The fixture's arithmetic, stated once so every assertion below is a fixed number ──
 *
 * 50 fps, active [0 → 100], out-point 90, content start PINNED at 30:
 *
 *   entrance  [0 → 30]   600 ms   (consumes its duration — the marker is authored)
 *   settle    [30 → 90]  1200 ms  ⇒ the hold begins at t = 1800 ms
 *   LOOP      [30 → 90]  1200 ms per pass ⇒ wraps at t = 3000, 4200, 5400 …
 *   outro     [90 → 100] 200 ms
 *
 * The ticker: viewport 400 px (its own width), one 20-char item ⇒ 200 px at
 * `tickerMeasure`, gap 10, speed 200 px/s. A finite `repeat: 3` completes when the last
 * item has fully left the band: `3W + 2g + V = 1020 px` ⇒ **5100 ms** of crawl, so a
 * ticker started at 600 ms completes at **5700 ms** — three seams into the hold.
 *
 * The composition frame is read off an opacity track keyframed `0@30 → 1@90 → 0@100`, so
 * the painted frame is recoverable from one style read: rising 0→1 is a loop pass, a drop
 * back to ~0 is a WRAP, and falling from 1 is the OUT phase past the loop end.
 */

function makeClock() {
  let ms = 0;
  const rafs = new Map<number, (ts: number) => void>();
  const timers: { id: number; due: number; cb: () => void }[] = [];
  let nextId = 1;
  return {
    now: () => ms,
    raf: (cb: (ts: number) => void) => {
      const id = nextId++;
      rafs.set(id, cb);
      return id;
    },
    cancel: (h: number) => {
      rafs.delete(h);
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
      const round = [...rafs.entries()];
      for (const [id] of round) rafs.delete(id);
      for (const [, cb] of round) cb(ms);
    },
  };
}

type Clock = ReturnType<typeof makeClock>;

/** Advance the clock in 20 ms steps, flushing microtasks so promise seams resolve. */
async function run(clock: Clock, totalMs: number, step = 20): Promise<void> {
  let left = totalMs;
  while (left > 0) {
    const d = Math.min(step, left);
    clock.advance(d);
    left -= d;
    for (let i = 0; i < 6; i += 1) await Promise.resolve();
  }
}

/** Advance in 20 ms steps, calling `sample` after each one (with the clock's own time). */
async function runSampling(
  clock: Clock,
  totalMs: number,
  sample: (t: number) => void,
): Promise<void> {
  let left = totalMs;
  while (left > 0) {
    const d = Math.min(20, left);
    clock.advance(d);
    left -= d;
    for (let i = 0; i < 6; i += 1) await Promise.resolve();
    sample(clock.now());
  }
}

const tickerMeasure = (node: HTMLElement): number => (node.textContent?.length ?? 0) * 10;

const baseTransform = {
  position: { x: 0, y: 0 },
  size: { w: 400, h: 60 },
  scale: { x: 1, y: 1 },
  rotation: 0,
  anchor: { x: 0, y: 0 },
};

const font = {
  family: 'Vazirmatn',
  weight: 500,
  style: 'normal',
  size: 36,
  lineHeight: 1.4,
  letterSpacing: 0,
};

/**
 * The FRAME PROBE: furniture whose opacity track makes the painted composition frame
 * readable from the DOM. It is also what makes the range frame-dependent — a range in
 * which nothing paints differently has nothing to replay, and the controller keeps the
 * parked frame (that case is its own test below).
 */
function frameProbe(id: string): Element {
  return {
    id,
    name: id,
    type: 'shape',
    transform: baseTransform,
    opacity: 1,
    visible: true,
    locked: false,
    zIndex: 0,
    shape: 'rect',
    fill: { kind: 'solid', color: '#FF0000' },
    animation: {
      tracks: {
        opacity: {
          keyframes: [
            { frame: 30, value: 0, easing: 'linear' },
            { frame: 90, value: 1, easing: 'linear' },
            { frame: 100, value: 0, easing: 'linear' },
          ],
        },
      },
    },
  } as unknown as Element;
}

/** The same furniture with NO tracks — the control that makes the range static. */
function staticFurniture(id: string): Element {
  return {
    id,
    name: id,
    type: 'shape',
    transform: baseTransform,
    opacity: 1,
    visible: true,
    locked: false,
    zIndex: 0,
    shape: 'rect',
    fill: { kind: 'solid', color: '#FF0000' },
  } as unknown as Element;
}

function ticker(id: string, repeat: number | 'infinite'): Element {
  return {
    id,
    name: id,
    type: 'ticker',
    transform: baseTransform,
    opacity: 1,
    visible: true,
    locked: false,
    zIndex: 0,
    font,
    color: '#FFFFFF',
    direction: 'rtl',
    speed: 200,
    gap: 10,
    repeat,
    cycleBoundary: 'seamless',
    items: [{ id: 'a', text: 'abcdefghijklmnopqrst' }], // 20 chars ⇒ 200 px
  } as unknown as Element;
}

/** A countdown far beyond the test window — present to be SPIED ON, never to end the hold. */
function countdownClock(id: string): Element {
  return {
    id,
    name: id,
    type: 'clock',
    transform: baseTransform,
    opacity: 1,
    visible: true,
    locked: false,
    zIndex: 0,
    font,
    color: '#FFFFFF',
    align: 'center',
    mode: 'countdown',
    target: { kind: 'duration', ms: 600_000 },
    format: 'mm:ss',
    digits: 'latin',
  } as unknown as Element;
}

function infiniteSequence(id: string): Element {
  return {
    id,
    name: id,
    type: 'sequence',
    transform: baseTransform,
    opacity: 1,
    visible: true,
    locked: false,
    zIndex: 0,
    font,
    color: '#FFFFFF',
    align: 'start',
    direction: 'rtl',
    items: [
      { id: 'a', text: 'ONE' },
      { id: 'b', text: 'TWO' },
    ],
    defaultDwellMs: 500,
    advance: 'auto',
    transitionIn: 'bottom',
    transitionOut: 'top',
    transitionTiming: 'simultaneous',
    transitionMs: 100,
    repeat: 'infinite',
  } as unknown as Element;
}

function scene(children: Element[], playout?: Playout): Scene {
  return {
    schemaVersion: 1,
    id: 'root',
    name: 'root',
    templateType: 'custom',
    resolution: { width: 400, height: 120 },
    frameRate: 50,
    safeAreas: { title: 10, action: 5 },
    frameRange: { in: 0, out: 100 },
    lifecycle: { outPoint: 90, contentStart: 30 },
    playout: playout ?? { mode: 'auto-out', holdSource: 'content-driven' },
    editorBackdrop: 'transparent',
    layers: [
      { id: 'pl', name: 'main', visible: true, locked: false, blendMode: 'normal', children },
    ],
    fields: [],
    bindings: [],
    fonts: [],
    metadata: { createdAt: '2026-08-13T00:00:00.000Z', updatedAt: '2026-08-13T00:00:00.000Z' },
  } as unknown as Scene;
}

/** The painted composition frame, recovered from the probe's opacity track. */
const probeOpacity = (): number =>
  Number.parseFloat(
    document.querySelector<HTMLElement>('[data-cg-element-id="probe"]')?.style.opacity ?? 'NaN',
  );

/** The crawl's translateX, in px — `''` (no transform) means the driver has been RESET. */
const crawlX = (): number | null => {
  const t = document.querySelector<HTMLElement>('.cg-ticker-track')?.style.transform ?? '';
  const m = /translateX\((-?[\d.]+)px\)/.exec(t);
  return m === null ? null : Number.parseFloat(m[1]!);
};

beforeEach(() => {
  document.body.innerHTML = '';
  document.body.className = '';
});
afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
  document.body.className = '';
});

describe('the hold renders as a repeating [contentStart → outPoint]', () => {
  it('the composition frame wraps to the content start at the loop end, over and over', async () => {
    const clock = makeClock();
    const r = createRuntime(scene([frameProbe('probe'), ticker('tick', 'infinite')]), {
      skipFontLoad: true,
      clock,
      tickerMeasure,
    });
    await r.play({});

    // Through the settle leg the frame rises 30 → 90 (opacity 0 → 1), reaching the
    // out-point at t = 1800 ms.
    await run(clock, 1780);
    expect(probeOpacity()).toBeGreaterThan(0.9);

    // The hold begins: the loop's first paint is the loop START, not the parked out-point.
    await run(clock, 40);
    expect(probeOpacity()).toBeLessThan(0.1);

    // Pass 1 runs to the loop end …
    await run(clock, 1140); // t ≈ 2960
    expect(probeOpacity()).toBeGreaterThan(0.9);
    // … and WRAPS.
    await run(clock, 80); // t ≈ 3040
    expect(probeOpacity()).toBeLessThan(0.1);

    // Pass 2, and the second wrap — the loop is not a one-shot replay.
    await run(clock, 1140); // t ≈ 4180
    expect(probeOpacity()).toBeGreaterThan(0.9);
    await run(clock, 80); // t ≈ 4260
    expect(probeOpacity()).toBeLessThan(0.1);
  });

  it('🔴 the wrap issues NO lifecycle call on ANY content driver — the item itself', async () => {
    const clock = makeClock();
    // Every content kind at once: whatever the wrap could reach, it is in this scene.
    const r = createRuntime(
      scene([
        frameProbe('probe'),
        ticker('tick', 'infinite'),
        countdownClock('cd'),
        infiniteSequence('seq'),
      ]),
      { skipFontLoad: true, clock, tickerMeasure },
    );

    const spies = [
      ...(['reset', 'start', 'stop', 'pause', 'resume'] as const).map((m) =>
        vi.spyOn(TickerDriver.prototype, m),
      ),
      ...(['reset', 'start', 'stop', 'pause', 'resume'] as const).map((m) =>
        vi.spyOn(ClockDriver.prototype, m),
      ),
      ...(['reset', 'start', 'stop', 'pause', 'resume'] as const).map((m) =>
        vi.spyOn(SequenceDriver.prototype, m),
      ),
    ];

    await r.play({});
    // Play + the content start at 600 ms legitimately reset+start every driver; run past
    // both and past the first loop paint, then take the baseline.
    await run(clock, 1900);
    const baseline = spies.map((s) => s.mock.calls.length);
    expect(baseline.some((n) => n > 0)).toBe(true); // the spies are live, not inert

    // Two full seams — COUNTED, not assumed. Without this the test would pass on a
    // controller that never loops at all (no wrap, no call, green), which is the shape of
    // a guarantee that quietly stops guarding anything.
    let wraps = 0;
    let prev = probeOpacity();
    await runSampling(clock, 2500, () => {
      // t ≈ 1900 → 4400: the wraps at 3000 and 4200
      const o = probeOpacity();
      if (o < prev - 0.5) wraps += 1;
      prev = o;
    });
    expect(wraps).toBe(2);

    // THE INVARIANT: the wrap is a re-render of the composition frame and nothing else.
    expect(spies.map((s) => s.mock.calls.length)).toEqual(baseline);
  });

  it('a ticker set to repeat 3× flows unbroken across two seams and consumes no repeat', async () => {
    const clock = makeClock();
    const r = createRuntime(scene([frameProbe('probe'), ticker('tick', 3)]), {
      skipFontLoad: true,
      clock,
      tickerMeasure,
    });
    let exitAt: number | null = null;
    r.on('stop.start', () => {
      exitAt = clock.now();
    });
    await r.play({});

    await run(clock, 1800); // to the hold entry

    // Sample the crawl through the HOLD ONLY (1800 → 5600, stopping short of the 5700 ms
    // exit, which legitimately resets the drivers). `crawlX` is `null` only when the track
    // carries no transform at all — i.e. after a `reset()` — so a null in this window IS
    // the restart the item forbids, observed rather than inferred.
    const xs: { t: number; x: number | null }[] = [];
    let wraps = 0;
    let prevOpacity = 1;
    await runSampling(clock, 3800, (t) => {
      xs.push({ t, x: crawlX() });
      const o = probeOpacity();
      if (o < prevOpacity - 0.5) wraps += 1; // a fall of ~1 → 0 is a seam
      prevOpacity = o;
    });

    // The fixture really did cross the seams it claims to.
    expect(wraps).toBeGreaterThanOrEqual(2);

    // The crawl never restarted and never went backwards: one continuous run across
    // every seam. (rtl ⇒ translateX grows with distance travelled.)
    expect(xs.every((s) => s.x !== null)).toBe(true);
    const values = xs.map((s) => s.x!);
    expect(values.every((v, i) => i === 0 || v >= values[i - 1]!)).toBe(true);

    await run(clock, 300); // t ≈ 5900 — past the ticker's own completion at 5700 ms

    // NO REPEAT WAS CONSUMED BY A WRAP — the ticker's three passes take exactly as long as
    // its own clock says (started at 600 ms, 1020 px at 200 px/s = 5100 ms), so the exit
    // falls where it would with no loop at all. A wrap that reset or advanced the run would
    // move this number; it is asserted against the ticker's arithmetic, not against itself.
    expect(exitAt).not.toBeNull();
    expect(exitAt!).toBeGreaterThanOrEqual(5700);
    expect(exitAt!).toBeLessThanOrEqual(5740); // one 20 ms sampling step of slack
  });

  it('the CONTROL: the same ticker with no loop to wrap exits at the SAME moment', async () => {
    // Identical scene minus the animation, so the range has nothing to replay and the hold
    // parks exactly as it did before D-133. If the two exit moments agreed only by
    // construction the previous test would be asserting the loop against itself; this is
    // the neighbour that makes the number mean something.
    const clock = makeClock();
    const r = createRuntime(scene([staticFurniture('probe'), ticker('tick', 3)]), {
      skipFontLoad: true,
      clock,
      tickerMeasure,
    });
    let exitAt: number | null = null;
    r.on('stop.start', () => {
      exitAt = clock.now();
    });
    await r.play({});
    await run(clock, 6000);
    expect(exitAt).not.toBeNull();
    expect(exitAt!).toBeGreaterThanOrEqual(5700);
    expect(exitAt!).toBeLessThanOrEqual(5740);
  });

  it("after the driver's Nth repeat, playback passes the loop end and the OUT phase runs", async () => {
    const clock = makeClock();
    const r = createRuntime(scene([frameProbe('probe'), ticker('tick', 3)]), {
      skipFontLoad: true,
      clock,
      tickerMeasure,
    });
    const events: string[] = [];
    r.on('stop.start', () => events.push('stop.start'));
    r.on('stop.end', () => events.push('stop.end'));
    await r.play({});

    // Just before the third pass completes the loop is still wrapping, not exiting.
    await run(clock, 5600);
    expect(events).toEqual([]);

    // The ticker completes at 5700 ms: playback leaves the loop instead of wrapping at
    // 6600 ms, and the OUT leg [90 → 100] runs — the probe falls from its out-point value
    // towards the exit, which no wrap could produce (a wrap paints the loop START, ~0,
    // and then RISES).
    await run(clock, 200); // t ≈ 5800 — inside the 200 ms outro
    expect(events).toContain('stop.start');
    const mid = probeOpacity();
    expect(mid).toBeLessThan(1);
    expect(mid).toBeGreaterThan(0.1);

    await run(clock, 300); // t ≈ 6100 — past the outro's end
    expect(events).toContain('stop.end');
    expect(document.body.classList.contains('cg-pending')).toBe(true);
  });
});

describe('the loop range is INERT wherever the hold is not content-driven', () => {
  it('a TIMED hold parks on the out-point and never wraps (§9.1, answer (a))', async () => {
    const clock = makeClock();
    const r = createRuntime(
      scene([frameProbe('probe'), ticker('tick', 'infinite')], {
        mode: 'auto-out',
        holdSource: 'timed',
        holdMs: 3000,
      }),
      { skipFontLoad: true, clock, tickerMeasure },
    );
    await r.play({});
    await run(clock, 1820); // the hold has begun
    // Parked on the out-point for the whole hold — across what WOULD have been two seams.
    for (let i = 0; i < 3; i += 1) {
      await run(clock, 900);
      expect(probeOpacity()).toBe(1);
    }
  });

  it('a MANUAL hold parks too — `holdSource` is ignored entirely in that mode', async () => {
    const clock = makeClock();
    const r = createRuntime(
      scene([frameProbe('probe'), ticker('tick', 'infinite')], {
        mode: 'manual',
        holdSource: 'content-driven',
      }),
      { skipFontLoad: true, clock, tickerMeasure },
    );
    await r.play({});
    await run(clock, 3200); // well past the first would-be seam at 3000 ms
    expect(probeOpacity()).toBe(1);
  });

  it('a content-driven hold with NOTHING frame-dependent in the range keeps the parked frame — the SAME predicate the legs collapse on', async () => {
    // B-032 resolves a driver-less `content-driven` back to `timed`, so both scenes keep a
    // real driver and differ ONLY in the animation: the range exists and is content-driven
    // in both, but in one of them every frame paints identically to the out-point, so
    // replaying it would burn an rAF to change nothing.
    //
    // Asserted on the MECHANISM — how many frame drivers the controller opened — because
    // the whole claim is that the hold loop asks the SAME question `playRange` asks before
    // collapsing a leg, through the one shared `frameDependent`. Two equal pixel readings
    // would pass against a second, drifting copy of that predicate; a driver count cannot.
    const holdDriverStarts = async (children: Element[]): Promise<number> => {
      const clock = makeClock();
      const start = vi.spyOn(FrameDriver.prototype, 'start');
      const r = createRuntime(scene(children), { skipFontLoad: true, clock, tickerMeasure });
      await r.play({});
      await run(clock, 3200); // t ≈ 3200: the hold is running, past the first would-be seam
      // The hold is live in BOTH scenes — the crawl is rolling — so a zero below can never
      // mean "nothing happened".
      expect(crawlX()).not.toBeNull();
      expect(crawlX()!).toBeGreaterThan(0);
      const n = start.mock.calls.length;
      start.mockRestore();
      document.body.innerHTML = '';
      document.body.className = '';
      return n;
    };

    // Animated: entrance leg + settle leg + THE HOLD LOOP.
    expect(await holdDriverStarts([frameProbe('probe'), ticker('tick', 'infinite')])).toBe(3);
    // Static: the entrance leg alone consumes duration (its content-start moment is
    // anchored); the settle leg collapses and the hold parks, exactly as before D-133.
    expect(await holdDriverStarts([staticFurniture('probe'), ticker('tick', 'infinite')])).toBe(1);
  });
});
