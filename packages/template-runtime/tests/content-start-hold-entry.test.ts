import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Composition, Element, Playout, Scene } from '@cg/shared-schema';
import { createRuntime } from '../src/runtime.js';

/**
 * D-104 follow-up — a composition's CONTENT (ticker / clock / sequence), DIRECT in the
 * comp OR inside a nested composition, must begin the moment the parent's INTRO completes
 * (its hold entry) and run through the whole hold — in EVERY hold mode (timed / auto-out,
 * content-driven, loop-cycle). It must NOT be tied to the out-point / hold exit.
 *
 * The bug: the intro played `[in → outPoint]`, so a graphic that ENTERED quickly (frame
 * 10 here) then held statically to a late out-point (frame 90) started its ticker only at
 * the out-point — near the outro — instead of at the entrance completion (frame 10). And
 * nested content under a non-coordinator (timed) parent self-started at the wrong time.
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

async function run(clock: ReturnType<typeof makeClock>, totalMs: number, step = 20): Promise<void> {
  let left = totalMs;
  while (left > 0) {
    const d = Math.min(step, left);
    clock.advance(d);
    left -= d;
    for (let i = 0; i < 6; i += 1) await Promise.resolve();
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

/** An entrance shape: opacity ramps 0→1 across [0, settle], then holds (static) after. */
function introShape(id: string, settle: number): Element {
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
            { frame: 0, value: 0, easing: 'linear' },
            { frame: settle, value: 1, easing: 'linear' },
          ],
        },
      },
    },
  } as unknown as Element;
}

/** An infinite crawl = the "subtitle"; it holds the graphic on air so we can observe it. */
function infiniteTicker(id: string): Element {
  return {
    id,
    name: id,
    type: 'ticker',
    transform: baseTransform,
    opacity: 1,
    visible: true,
    locked: false,
    zIndex: 0,
    font: {
      family: 'Vazirmatn',
      weight: 500,
      style: 'normal',
      size: 36,
      lineHeight: 1.4,
      letterSpacing: 0,
    },
    color: '#FFFFFF',
    direction: 'rtl',
    speed: 100,
    gap: 10,
    repeat: 'infinite',
    cycleBoundary: 'seamless',
    items: [{ id: 'a', text: 'aaaaaaaaaa' }],
  } as unknown as Element;
}

function instance(id: string, name: string, compositionId: string): Element {
  return {
    id,
    name,
    type: 'composition',
    compositionId,
    transform: baseTransform,
    opacity: 1,
    visible: true,
    locked: false,
    zIndex: 0,
  } as unknown as Element;
}

function comp(id: string, outPoint: number, children: Element[], playout?: Playout): Composition {
  return {
    id,
    name: id,
    resolution: { width: 400, height: 60 },
    frameRange: { in: 0, out: 100 },
    lifecycle: { outPoint },
    ...(playout !== undefined ? { playout } : {}),
    background: 'transparent',
    layers: [
      { id: `${id}-l`, name: 'main', visible: true, locked: false, blendMode: 'normal', children },
    ],
  } as unknown as Composition;
}

function scene(opts: {
  children: Element[];
  outPoint: number;
  playout: Playout;
  compositions?: Composition[];
}): Scene {
  return {
    schemaVersion: 1,
    id: 'root',
    name: 'root',
    templateType: 'custom',
    resolution: { width: 400, height: 120 },
    frameRate: 50, // 50fps ⇒ frame 10 = 200ms (entrance), frame 90 = 1800ms (out-point)
    safeAreas: { title: 10, action: 5 },
    frameRange: { in: 0, out: 100 },
    lifecycle: { outPoint: opts.outPoint },
    playout: opts.playout,
    background: 'transparent',
    layers: [
      {
        id: 'pl',
        name: 'main',
        visible: true,
        locked: false,
        blendMode: 'normal',
        children: opts.children,
      },
    ],
    fields: [],
    bindings: [],
    fonts: [],
    ...(opts.compositions !== undefined ? { compositions: opts.compositions } : {}),
    metadata: { createdAt: '2026-06-27T00:00:00.000Z', updatedAt: '2026-06-27T00:00:00.000Z' },
  } as unknown as Scene;
}

/**
 * The crawl track carries NO transform until the driver's first `step()`, which runs
 * synchronously on `start()`. A non-empty `translateX(...)` therefore means the ticker's
 * content run has STARTED (the static authoring layout is removed earlier, at the play
 * reset, so it is not a start signal).
 */
const tickerStarted = (): boolean => {
  const track = document.querySelector<HTMLElement>('.cg-ticker-track');
  return (track?.style.transform ?? '') !== '';
};

beforeEach(() => {
  document.body.innerHTML = '';
  document.body.className = '';
});
afterEach(() => {
  document.body.innerHTML = '';
  document.body.className = '';
});

describe('D-104 follow-up — content starts at the entrance completion (hold entry), every mode', () => {
  it('(timed, direct) the subtitle starts at the entrance settle (~200ms), not near the out-point (1800ms)', async () => {
    // entrance settles at frame 10 (200ms); out-point at frame 90 (1800ms); manual = a
    // long timed hold [10 → 90]. The subtitle is DIRECT in the comp.
    const clock = makeClock();
    const r = createRuntime(
      scene({
        children: [introShape('bg', 10), infiniteTicker('sub')],
        outPoint: 90,
        playout: { mode: 'manual' },
      }),
      { skipFontLoad: true, clock, tickerMeasure },
    );
    await r.play({});
    expect(tickerStarted()).toBe(false); // pre-settle: still the static authoring layout

    await run(clock, 120); // ~120ms: still mid-entrance (settle is at 200ms)
    expect(tickerStarted()).toBe(false);

    await run(clock, 200); // ~320ms: past the entrance settle (200ms), long before 1800ms
    expect(tickerStarted()).toBe(true); // STARTED at the entrance completion — the fix
    r.remove();
  });

  it('(content-driven, direct) the subtitle still starts at the entrance settle', async () => {
    const clock = makeClock();
    const r = createRuntime(
      scene({
        children: [introShape('bg', 10), infiniteTicker('sub')],
        outPoint: 90,
        playout: { mode: 'auto-out', holdSource: 'content-driven' },
      }),
      { skipFontLoad: true, clock, tickerMeasure },
    );
    await r.play({});
    await run(clock, 120);
    expect(tickerStarted()).toBe(false); // mode-independent: the late start was not the hold mode
    await run(clock, 200);
    expect(tickerStarted()).toBe(true);
    r.remove();
  });

  it('(timed parent, NESTED) the subtitle starts at the PARENT hold entry — not at play, not the out-point', async () => {
    // The parent is TIMED (manual); its only content is a ticker inside a non-coordinator
    // nested comp. Pre-fix that nested ticker self-started at PLAY (the nested comp has no
    // intro). It must instead start at the PARENT's entrance settle (~200ms).
    const clock = makeClock();
    const child = comp('subcomp', 50, [infiniteTicker('sub')], { mode: 'manual' });
    const r = createRuntime(
      scene({
        children: [introShape('bg', 10), instance('i-sub', 'sub', 'subcomp')],
        outPoint: 90,
        playout: { mode: 'manual' },
        compositions: [child],
      }),
      { skipFontLoad: true, clock, tickerMeasure },
    );
    await r.play({});
    await run(clock, 120); // before the PARENT settle (200ms)
    expect(tickerStarted()).toBe(false); // NOT self-started at play (the bug-2 regression guard)
    await run(clock, 200); // past the parent settle
    expect(tickerStarted()).toBe(true); // driven by the parent at its hold entry
    r.remove();
  });

  it('(no early settle) an entrance that animates to the out-point keeps content at the out-point', async () => {
    // The entrance animates across the WHOLE [0 → outPoint=90]; there is no static tail, so
    // content stays at the out-point (1800ms) — today's behavior, unchanged.
    const clock = makeClock();
    const r = createRuntime(
      scene({
        children: [introShape('bg', 90), infiniteTicker('sub')],
        outPoint: 90,
        playout: { mode: 'manual' },
      }),
      { skipFontLoad: true, clock, tickerMeasure },
    );
    await r.play({});
    await run(clock, 600); // 600ms: still deep in the entrance — content NOT started early
    expect(tickerStarted()).toBe(false);
    await run(clock, 1400); // ~2000ms: past the out-point (1800ms)
    expect(tickerStarted()).toBe(true);
    r.remove();
  });
});
