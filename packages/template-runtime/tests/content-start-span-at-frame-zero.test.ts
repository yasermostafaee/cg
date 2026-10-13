import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Composition, Element, Playout, Scene } from '@cg/shared-schema';
import { createRuntime } from '../src/runtime.js';

/**
 * A content element whose SPAN STARTS AT FRAME 0 began its run at frame 0 instead of at
 * the composition's content start — while the same element with a span starting at frame
 * 1 waited correctly. One frame of difference flipped the behaviour; that is the owner's
 * own control, and it is reproduced here as a PAIR so a fix cannot pass by breaking the
 * neighbour.
 *
 * WHY the pair differs — the cause, stated once:
 *
 * `PlayoutController.playRange` collapses a leg to a single end-frame paint when nothing
 * in it is frame-dependent (`hasAnimation || needsFrameSweep(inF, outF)`), and a collapsed
 * leg calls its `onEnd` SYNCHRONOUSLY. For the ENTRANCE leg `[active.in -> holdEntry]` that
 * `onEnd` is `onContentStart()` — a TIMING seam, not a paint — so a collapsed entrance
 * starts the content at play.
 *
 * `needsFrameSweep`'s lifespan term is `lifespanGateChangesInRange`, which asks whether a
 * gate TRANSITION lands in `(inF, outF]` — strictly after `inF`. A span starting at frame
 * 0 is already ON at the leg's first frame, so it does not "change in range": no sweep,
 * collapsed leg, content at frame 0. A span starting at frame 1 transitions INSIDE the
 * leg: sweep, real duration, content at the content start. Exactly the one-frame control.
 *
 * These fixtures carry NO keyframes, because the owner's compositions do not: a VIDEO or
 * LOTTIE backdrop with an intro contributes no `scope.animated` entry, so `hasAnimation`
 * is false and the collapse decision falls entirely to `needsFrameSweep`. That is also why
 * both backdrop kinds behave identically — neither is what decides this.
 *
 * The gate is per-SCOPE, not per-element: the sweep is enabled by ANY span boundary inside
 * the leg, so in the owner's composition the ticker's own span was the only one that could
 * enable it. Assertions here are on WHEN THE RUN BEGINS (the driver's observable output),
 * never on visibility — the two are different, and conflating them is what made this look
 * like a backdrop-kind asymmetry.
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

type Span = { in: number; out: number } | undefined;

/**
 * The BACKDROP stand-in: furniture with NO keyframes, exactly like a video / Lottie
 * backdrop as far as `hasAnimation` is concerned (neither contributes `scope.animated`).
 */
function staticBackdrop(id: string): Element {
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

/** A keyframed entrance — the shape whose presence sets `hasAnimation`. */
function introShape(id: string, settle: number): Element {
  return {
    ...(staticBackdrop(id) as unknown as Record<string, unknown>),
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

const font = {
  family: 'Vazirmatn',
  weight: 500,
  style: 'normal',
  size: 36,
  lineHeight: 1.4,
  letterSpacing: 0,
};

function infiniteTicker(id: string, lifespan: Span): Element {
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
    speed: 100,
    gap: 10,
    repeat: 'infinite',
    cycleBoundary: 'seamless',
    items: [{ id: 'a', text: 'aaaaaaaaaa' }],
    ...(lifespan !== undefined ? { lifespan } : {}),
  } as unknown as Element;
}

function countdownClock(id: string, lifespan: Span): Element {
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
    target: { kind: 'duration', ms: 4000 },
    format: 'mm:ss',
    digits: 'latin',
    ...(lifespan !== undefined ? { lifespan } : {}),
  } as unknown as Element;
}

function twoItemSequence(id: string, lifespan: Span): Element {
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
    ...(lifespan !== undefined ? { lifespan } : {}),
  } as unknown as Element;
}

/**
 * 50fps: frame 30 = 600ms (the pinned content start), out-point frame 90 = 1800ms.
 * `contentStart: undefined` exercises the heuristic path instead.
 */
function scene(opts: {
  children: Element[];
  contentStart?: number | undefined;
  playout?: Playout;
  compositions?: Composition[];
}): Scene {
  return {
    schemaVersion: 1,
    id: 'root',
    name: 'root',
    templateType: 'custom',
    resolution: { width: 400, height: 120 },
    frameRate: 50,
    safeAreas: { title: 10, action: 5 },
    frameRange: { in: 0, out: 100 },
    lifecycle:
      opts.contentStart !== undefined
        ? { outPoint: 90, contentStart: opts.contentStart }
        : { outPoint: 90 },
    playout: opts.playout ?? { mode: 'auto-out', holdSource: 'content-driven' },
    editorBackdrop: 'transparent',
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
    metadata: { createdAt: '2026-08-13T00:00:00.000Z', updatedAt: '2026-08-13T00:00:00.000Z' },
  } as unknown as Scene;
}

/**
 * The crawl track carries NO transform until the driver's first `step()`, which runs
 * synchronously on `start()` — so a non-empty `translateX(...)` means the RUN has begun.
 * (The static authoring layout is removed earlier, at the play reset, so it is not a
 * start signal.)
 */
const tickerStarted = (): boolean =>
  (document.querySelector<HTMLElement>('.cg-ticker-track')?.style.transform ?? '') !== '';

/** The rendered text of a built element — the countdown's remaining time / the sequence's item. */
const elText = (id: string): string =>
  document.querySelector<HTMLElement>(`[data-cg-element-id="${id}"]`)?.textContent ?? '';

beforeEach(() => {
  document.body.innerHTML = '';
  document.body.className = '';
});
afterEach(() => {
  document.body.innerHTML = '';
  document.body.className = '';
});

describe("a content element's span starting at frame 0 must not start its run at frame 0", () => {
  // — TICKER: the owner's own reproduction, and its one-frame control ——————————

  it('(ticker, span at frame 0) the crawl begins at the content start, NOT at frame 0', async () => {
    const clock = makeClock();
    const r = createRuntime(
      scene({
        children: [staticBackdrop('bg'), infiniteTicker('sub', { in: 0, out: 100 })],
        contentStart: 30, // 600ms
      }),
      { skipFontLoad: true, clock, tickerMeasure },
    );
    await r.play({});
    expect(tickerStarted()).toBe(false); // at play — the entrance has not run yet

    await run(clock, 400); // 400ms: still before the 600ms content start
    expect(tickerStarted()).toBe(false); // <-- FAILED pre-fix: the crawl was already running

    await run(clock, 400); // 800ms: past the content start
    expect(tickerStarted()).toBe(true);
    r.remove();
  });

  it('(ticker, span at frame 1) THE CONTROL — unchanged, still begins at the content start', async () => {
    const clock = makeClock();
    const r = createRuntime(
      scene({
        children: [staticBackdrop('bg'), infiniteTicker('sub', { in: 1, out: 100 })],
        contentStart: 30,
      }),
      { skipFontLoad: true, clock, tickerMeasure },
    );
    await r.play({});
    expect(tickerStarted()).toBe(false);
    await run(clock, 400);
    expect(tickerStarted()).toBe(false);
    await run(clock, 400);
    expect(tickerStarted()).toBe(true);
    r.remove();
  });

  it('(ticker, NO span at all) the same rule — an untrimmed element is not a special case', async () => {
    // No `lifespan` anywhere ⇒ no gates ⇒ `needsFrameSweep` is `undefined` outright. This is
    // the SAME collapsed-entrance defect reached by a different door, so it must be fixed by
    // the same change rather than by anything span-shaped.
    const clock = makeClock();
    const r = createRuntime(
      scene({
        children: [staticBackdrop('bg'), infiniteTicker('sub', undefined)],
        contentStart: 30,
      }),
      { skipFontLoad: true, clock, tickerMeasure },
    );
    await r.play({});
    await run(clock, 400);
    expect(tickerStarted()).toBe(false);
    await run(clock, 400);
    expect(tickerStarted()).toBe(true);
    r.remove();
  });

  // — SEQUENCE: the same path, the same pair ————————————————————————————

  it('(sequence, span at frame 0) item 1 dwells from the content start, NOT from frame 0', async () => {
    const clock = makeClock();
    const r = createRuntime(
      scene({
        children: [staticBackdrop('bg'), twoItemSequence('seq', { in: 0, out: 100 })],
        contentStart: 30,
      }),
      { skipFontLoad: true, clock, tickerMeasure },
    );
    await r.play({});
    // Dwell is 500ms. Started at the content start (600ms) the first advance is at ~1100ms;
    // started at frame 0 it is at ~500ms. Sample at 800ms — between the two.
    await run(clock, 800);
    expect(elText('seq')).toContain('ONE'); // <-- FAILED pre-fix: already advanced to TWO
    await run(clock, 500); // 1300ms: past the real first advance
    expect(elText('seq')).toContain('TWO');
    r.remove();
  });

  it('(sequence, span at frame 1) THE CONTROL — unchanged', async () => {
    const clock = makeClock();
    const r = createRuntime(
      scene({
        children: [staticBackdrop('bg'), twoItemSequence('seq', { in: 1, out: 100 })],
        contentStart: 30,
      }),
      { skipFontLoad: true, clock, tickerMeasure },
    );
    await r.play({});
    await run(clock, 800);
    expect(elText('seq')).toContain('ONE');
    await run(clock, 500);
    expect(elText('seq')).toContain('TWO');
    r.remove();
  });

  // — COUNTDOWN CLOCK: the third kind through the same path ————————————————

  it('(countdown, span at frame 0) the count begins at the content start, NOT at frame 0', async () => {
    const clock = makeClock();
    const r = createRuntime(
      scene({
        children: [staticBackdrop('bg'), countdownClock('cd', { in: 0, out: 100 })],
        contentStart: 30,
      }),
      { skipFontLoad: true, clock, tickerMeasure },
    );
    await r.play({});
    // A 4000ms countdown. Started at the content start (600ms), 1300ms in leaves 3300ms
    // remaining ⇒ '00:04'; started at frame 0 it leaves 2700ms ⇒ '00:03'.
    await run(clock, 1300);
    expect(elText('cd')).toBe('00:04'); // <-- FAILED pre-fix: '00:03', the count ran early
    r.remove();
  });

  it('(countdown, span at frame 1) THE CONTROL — unchanged', async () => {
    const clock = makeClock();
    const r = createRuntime(
      scene({
        children: [staticBackdrop('bg'), countdownClock('cd', { in: 1, out: 100 })],
        contentStart: 30,
      }),
      { skipFontLoad: true, clock, tickerMeasure },
    );
    await r.play({});
    await run(clock, 1300);
    expect(elText('cd')).toBe('00:04');
    r.remove();
  });

  // — THE HEURISTIC (marker-less) PATH ————————————————————————————————

  it('(heuristic, span at frame 0) a keyframed entrance was ALREADY correct — `hasAnimation` masked this', async () => {
    // No `contentStart` marker: the hold entry is `entranceSettleFrame`, which can only be
    // later than `active.in` because of keyframes or a Lottie settle — and BOTH already force
    // the sweep (`hasAnimation`, and the D-125 Phase 3a lottie term). So the marker-less path
    // is unaffected, and this test pins that: it passed before the fix and must keep passing.
    const clock = makeClock();
    const r = createRuntime(
      scene({
        children: [introShape('bg', 30), infiniteTicker('sub', { in: 0, out: 100 })],
        contentStart: undefined,
      }),
      { skipFontLoad: true, clock, tickerMeasure },
    );
    await r.play({});
    await run(clock, 400);
    expect(tickerStarted()).toBe(false);
    await run(clock, 400);
    expect(tickerStarted()).toBe(true);
    r.remove();
  });
});

/**
 * 🔴 OPEN — the MIRROR of the defect above, on the MARKER-LESS path. NOT fixed here, and
 * these two tests are deliberately NOT an endorsement of what they assert.
 *
 * With no `contentStart` marker and no keyframes, `entranceSettleFrame` returns `outPoint`
 * — the "there is no entrance" sentinel — and the entrance leg is the WHOLE `[0 → outPoint]`.
 * Whether that leg collapses is then decided by the same paint predicate, so a TRIM ALONE
 * moves the content start by the whole composition:
 *
 *   untrimmed ⇒ leg collapses ⇒ the crawl starts AT PLAY (0ms)
 *   trimmed   ⇒ a gate boundary falls inside the leg ⇒ it sweeps ⇒ the crawl starts at
 *               the OUT-POINT (1800ms here)
 *
 * Both readings have a claim to being right — `holdEntry === outPoint` semantically says
 * "content starts at the out-point" (the sibling suite's "no early settle" test asserts
 * exactly that for a keyframed entrance), while "content at play" is the long-standing
 * behaviour every static scene relies on. Choosing between them changes static-scene
 * semantics repo-wide, which is the owner's call and not this session's scope.
 *
 * They are pinned HERE, as an asymmetry, so the inconsistency is VISIBLE rather than
 * protected: whoever settles it will see these fail and be sent to this note. (Session N's
 * lesson — a test written to encode a decision makes that decision un-falsifiable.)
 */
describe('OPEN, not fixed here — marker-less: a trim ALONE moves the content start', () => {
  it('untrimmed ⇒ the crawl starts at PLAY', async () => {
    const clock = makeClock();
    const r = createRuntime(
      scene({
        children: [staticBackdrop('bg'), infiniteTicker('sub', undefined)],
        contentStart: undefined,
      }),
      { skipFontLoad: true, clock, tickerMeasure },
    );
    await r.play({});
    expect(tickerStarted()).toBe(true); // 0ms
    r.remove();
  });

  it('trimmed from frame 5 ⇒ the SAME scene defers the crawl to the out-point', async () => {
    const clock = makeClock();
    const r = createRuntime(
      scene({
        children: [staticBackdrop('bg'), infiniteTicker('sub', { in: 5, out: 100 })],
        contentStart: undefined,
      }),
      { skipFontLoad: true, clock, tickerMeasure },
    );
    await r.play({});
    expect(tickerStarted()).toBe(false); // 0ms — the one difference is the trim
    await run(clock, 400);
    expect(tickerStarted()).toBe(false);
    await run(clock, 1600); // 2000ms — past the out-point (frame 90 = 1800ms)
    expect(tickerStarted()).toBe(true);
    r.remove();
  });
});
