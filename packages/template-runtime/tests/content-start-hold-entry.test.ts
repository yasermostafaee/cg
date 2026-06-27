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
  contentStart?: number;
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
    lifecycle:
      opts.contentStart !== undefined
        ? { outPoint: opts.outPoint, contentStart: opts.contentStart }
        : { outPoint: opts.outPoint },
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

/** A WALL clock (absolute) — the play path used to start it ticking before the marker. */
function wallClock(id: string): Element {
  return {
    id,
    name: id,
    type: 'clock',
    transform: baseTransform,
    opacity: 1,
    visible: true,
    locked: false,
    zIndex: 0,
    font: {
      family: 'Vazirmatn',
      weight: 600,
      style: 'normal',
      size: 48,
      lineHeight: 1.2,
      letterSpacing: 0,
    },
    color: '#FFFFFF',
    align: 'center',
    mode: 'wall',
    format: 'ss',
    digits: 'latin',
  } as unknown as Element;
}

/** A 2-item now/next sequence (infinite) with a short dwell. */
function twoItemSequence(id: string): Element {
  return {
    id,
    name: id,
    type: 'sequence',
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
    transitionMs: 400,
    repeat: 'infinite',
  } as unknown as Element;
}

/** The rendered text of a built element (the clock's time / the sequence's current item). */
const elText = (id: string): string =>
  document.querySelector<HTMLElement>(`[data-cg-element-id="${id}"]`)?.textContent ?? '';

/** The inline display of a built element's HOST — what the content-start visibility gate drives. */
const hostDisplay = (id: string): string =>
  document.querySelector<HTMLElement>(`[data-cg-element-id="${id}"]`)?.style.display ?? 'MISSING';

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

  it('(marker) an explicit content-start marker OVERRIDES the heuristic — content starts at the marker frame', async () => {
    // The entrance settles at frame 10 (200ms) — the heuristic — but the designer pinned a
    // marker at frame 30 (600ms). Content must start at the MARKER, not the heuristic, not 90.
    const clock = makeClock();
    const r = createRuntime(
      scene({
        children: [introShape('bg', 10), infiniteTicker('sub')],
        outPoint: 90,
        contentStart: 30,
        playout: { mode: 'manual' },
      }),
      { skipFontLoad: true, clock, tickerMeasure },
    );
    await r.play({});
    await run(clock, 400); // 400ms: PAST the heuristic (200ms) but BEFORE the marker (600ms)
    expect(tickerStarted()).toBe(false); // the marker governs, not entranceSettleFrame
    await run(clock, 400); // ~800ms: past the marker (600ms)
    expect(tickerStarted()).toBe(true);
    r.remove();
  });

  it('(marker earlier) a marker BEFORE the heuristic also wins — content starts earlier', async () => {
    // Entrance settles at frame 40 (800ms heuristic); a marker pins content to frame 10 (200ms).
    const clock = makeClock();
    const r = createRuntime(
      scene({
        children: [introShape('bg', 40), infiniteTicker('sub')],
        outPoint: 90,
        contentStart: 10,
        playout: { mode: 'manual' },
      }),
      { skipFontLoad: true, clock, tickerMeasure },
    );
    await r.play({});
    await run(clock, 120); // 120ms: before the marker (200ms)
    expect(tickerStarted()).toBe(false);
    await run(clock, 200); // ~320ms: past the marker (200ms) but well before the heuristic (800ms)
    expect(tickerStarted()).toBe(true); // the marker (not the later heuristic) governs
    r.remove();
  });

  it('(marker, clock) an absolute wall clock is HELD through the entrance, then ticks from the marker', async () => {
    // Marker at frame 100 (2000ms); entrance settles at frame 10 (200ms). The wall clock used
    // to tick from PLAY (ignoring the marker) — now it is held until the marker, like the ticker.
    const clock = makeClock();
    const r = createRuntime(
      scene({
        children: [introShape('bg', 10), wallClock('clk')],
        outPoint: 150,
        contentStart: 100,
        playout: { mode: 'manual' },
      }),
      { skipFontLoad: true, clock },
    );
    await r.play({});
    const atPlay = elText('clk');
    await run(clock, 1200); // 1200ms: well past the heuristic (200ms), before the marker (2000ms)
    expect(elText('clk')).toBe(atPlay); // HELD — the wall clock did NOT tick before the marker
    await run(clock, 1000); // ~2200ms: past the marker — started + ticking
    const t1 = elText('clk');
    await run(clock, 1000); // +1s of wall time
    expect(elText('clk')).not.toBe(t1); // ticking, having started at the marker
    r.remove();
  });

  it('(marker, sequence) the now/next rotation begins at the marker — item 1 before, advances after', async () => {
    const clock = makeClock();
    const r = createRuntime(
      scene({
        children: [introShape('bg', 10), twoItemSequence('seq')],
        outPoint: 150,
        contentStart: 100,
        playout: { mode: 'manual' },
      }),
      { skipFontLoad: true, clock },
    );
    await r.play({});
    await run(clock, 1500); // 1500ms: past the heuristic (200ms), before the marker (2000ms)
    expect(elText('seq')).toContain('ONE');
    expect(elText('seq')).not.toContain('TWO'); // rotation has NOT begun — held on item 1
    await run(clock, 1500); // ~3000ms: past the marker (2000) + dwell (500) + transition (400)
    expect(elText('seq')).toContain('TWO'); // rotation began at the marker → advanced
    r.remove();
  });

  it('(marker, visibility) the clock + sequence HOSTS are HIDDEN before the marker, revealed at/after it', async () => {
    // The REAL "startout works for clock/sequence too" behaviour, distinct from the freeze
    // (textContent) the two tests above check: before the marker the clock/sequence HOST must
    // NOT show its frozen static content (a clock's "00", a sequence's item 1) — it is
    // display:none, matching the ticker's empty band — and at/after the marker frame it is
    // revealed (the driver also starts there). Marker at frame 60 (1200ms @50fps).
    const clock = makeClock();
    const r = createRuntime(
      scene({
        children: [introShape('bg', 10), wallClock('clk'), twoItemSequence('seq')],
        outPoint: 150,
        contentStart: 60,
        playout: { mode: 'manual' },
      }),
      { skipFontLoad: true, clock },
    );
    await r.play({});
    await run(clock, 600); // ~frame 30: BEFORE the marker (frame 60)
    expect(hostDisplay('clk')).toBe('none'); // host hidden — NOT showing the frozen time
    expect(hostDisplay('seq')).toBe('none'); // host hidden — NOT showing item 1
    await run(clock, 800); // ~frame 70: AT/AFTER the marker
    expect(hostDisplay('clk')).toBe('flex'); // revealed at the content-start frame
    expect(hostDisplay('seq')).toBe('grid'); // revealed at the content-start frame
    r.remove();
  });

  it('(heuristic, visibility) with NO marker the hosts are hidden until the entrance-settle heuristic', async () => {
    // No marker → holdEntry is the entranceSettleFrame heuristic (here frame 40 = 800ms, where
    // the entrance opacity reaches its held value). The clock + sequence hosts stay hidden until
    // that fallback frame, then are revealed — the gate keys off `holdEntry`, marker or not.
    const clock = makeClock();
    const r = createRuntime(
      scene({
        children: [introShape('bg', 40), wallClock('clk'), twoItemSequence('seq')],
        outPoint: 150,
        playout: { mode: 'manual' },
      }),
      { skipFontLoad: true, clock },
    );
    await r.play({});
    await run(clock, 600); // ~frame 30: before the heuristic settle (frame 40)
    expect(hostDisplay('clk')).toBe('none');
    expect(hostDisplay('seq')).toBe('none');
    await run(clock, 600); // ~frame 60: past the heuristic settle
    expect(hostDisplay('clk')).toBe('flex');
    expect(hostDisplay('seq')).toBe('grid');
    r.remove();
  });
});
