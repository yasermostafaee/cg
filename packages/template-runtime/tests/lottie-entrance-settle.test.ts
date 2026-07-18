import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as LottieBridge from '@cg/lottie-bridge';
import type { Composition, Element, Playout, Scene } from '@cg/shared-schema';

/**
 * D-125 Phase 3a — the composition's ENTRANCE SETTLE derived from the LOTTIE's intro.
 *
 * The asymmetry this closes: when a designer keyframes a background themselves,
 * `entranceSettleFrame` derives the settle from those tracks and content starts at the
 * right moment automatically. A Lottie is deliberately OPAQUE and carries NO keyframes,
 * so `scope.animated` was empty, the settle was `outPoint` verbatim, and the operator had
 * to hand-trim every overlay element. Here the Lottie's OWN intro feeds the SAME
 * derivation — the animation still plays untouched at its authored speed (nothing is
 * rescaled; that was the rejected §D1.1 alternative, in the opposite direction).
 *
 * Timing arithmetic used throughout — clip `fr: 30`, composition `frameRate: 50`:
 *   introEnd 20 @ speed 1 → 20/30 = 0.667s → round(0.667 × 50) = comp frame 33 → 660 ms
 *   introEnd 20 @ speed 2 → 0.333s        → comp frame 17                     → 340 ms
 *   introEnd 40 @ speed 1 → 1.333s        → comp frame 67                     → 1340 ms
 */

const { handles } = vi.hoisted(() => ({
  handles: [] as { frames: number[]; destroyed: boolean }[],
}));

vi.mock('@cg/lottie-bridge', async (importOriginal) => {
  const actual = await importOriginal<typeof LottieBridge>();
  return {
    ...actual,
    createLottiePlayer: () => {
      const h = {
        frames: [] as number[],
        destroyed: false,
        play: () => undefined,
        pause: () => undefined,
        stop: () => undefined,
        destroy() {
          h.destroyed = true;
        },
        goToFrame(f: number) {
          h.frames.push(f);
        },
        get isAlive() {
          return !h.destroyed;
        },
      };
      handles.push(h);
      return h;
    },
  };
});

const { createRuntime } = await import('../src/runtime.js');

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

/**
 * The crawl track carries NO transform until the driver's first `step()`, which runs
 * synchronously on `start()`. A non-empty `translateX(...)` therefore means the ticker's
 * content run has STARTED. (Mirrors `content-start-hold-entry.test.ts`.)
 */
const tickerStarted = (): boolean => {
  const track = document.querySelector<HTMLElement>('.cg-ticker-track');
  return (track?.style.transform ?? '') !== '';
};

const baseTransform = {
  position: { x: 0, y: 0 },
  size: { w: 400, h: 60 },
  scale: { x: 1, y: 1 },
  rotation: 0,
  anchor: { x: 0, y: 0 },
};

/** One clip: `fr: 30`, 100 frames long. Phases are per-ELEMENT, so one asset serves all. */
const lottieAssets = { a: { ip: 0, op: 100, fr: 30, w: 400, h: 200, layers: [] } };

interface LottieOpts {
  introEnd?: number;
  speed?: number;
  visible?: boolean;
  /** Omit `phases` entirely — the marker-less clip. */
  noPhases?: boolean;
}

function lottie(id: string, o: LottieOpts = {}): Element {
  const el: Record<string, unknown> = {
    id,
    name: id,
    type: 'lottie',
    transform: baseTransform,
    opacity: 1,
    visible: o.visible ?? true,
    locked: false,
    zIndex: 0,
    assetId: 'a',
    speed: o.speed ?? 1,
    loopMode: 'none',
    holdBehavior: 'freeze',
  };
  if (o.noPhases !== true) {
    el['phases'] = { introEnd: o.introEnd ?? 20, outroStart: 90, source: 'markers' };
  }
  return el as unknown as Element;
}

/** A keyframed background: opacity ramps 0→1 across [0, settle], then holds STATIC. */
function introShape(id: string, settle: number): Element {
  return {
    id,
    name: id,
    type: 'shape',
    shape: 'rect',
    fill: { kind: 'solid', color: '#FF0000' },
    transform: baseTransform,
    opacity: 1,
    visible: true,
    locked: false,
    zIndex: 0,
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

/** The infinite crawl = the overlay content whose start moment is under test. */
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

function instance(id: string, compositionId: string, visible: boolean): Element {
  return {
    id,
    name: id,
    type: 'composition',
    compositionId,
    transform: baseTransform,
    opacity: 1,
    visible,
    locked: false,
    zIndex: 0,
  } as unknown as Element;
}

/** A child composition holding a VISIBLE Lottie — only the ANCESTOR instance is hidden. */
function childComp(): Composition {
  return {
    id: 'c1',
    name: 'child',
    resolution: { width: 400, height: 200 },
    frameRange: { in: 0, out: 100 },
    lifecycle: { outPoint: 90 },
    background: 'transparent',
    layers: [
      {
        id: 'cl',
        name: 'cl',
        visible: true,
        locked: false,
        blendMode: 'normal',
        children: [lottie('inner', { introEnd: 20 })],
      },
    ],
    fields: [],
    bindings: [],
  } as unknown as Composition;
}

function scene(opts: {
  children: Element[];
  outPoint?: number;
  contentStart?: number;
  compositions?: Composition[];
}): Scene {
  const outPoint = opts.outPoint ?? 90;
  return {
    schemaVersion: 1,
    id: 'root',
    name: 'root',
    templateType: 'custom',
    resolution: { width: 400, height: 120 },
    // 50 fps ⇒ comp frame 33 = 660 ms, frame 17 = 340 ms, frame 67 = 1340 ms.
    frameRate: 50,
    safeAreas: { title: 10, action: 5 },
    frameRange: { in: 0, out: 100 },
    lifecycle:
      opts.contentStart !== undefined
        ? { outPoint, contentStart: opts.contentStart }
        : { outPoint },
    playout: { mode: 'manual' } as unknown as Playout,
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
    metadata: { createdAt: '2026-07-18T00:00:00.000Z', updatedAt: '2026-07-18T00:00:00.000Z' },
  } as unknown as Scene;
}

function boot(s: Scene) {
  const clock = makeClock();
  const r = createRuntime(s, {
    skipFontLoad: true,
    installGlobals: false,
    lottieAssets,
    clock,
    tickerMeasure,
  });
  return { clock, r };
}

beforeEach(() => {
  document.body.innerHTML = '';
  document.body.className = '';
  handles.length = 0;
});
afterEach(() => {
  document.body.innerHTML = '';
  document.body.className = '';
});

describe('D-125 Phase 3a — the entrance settle derived from the Lottie intro', () => {
  it('THE CRUX: the ticker starts at ~frame 33 (the Lottie intro), NOT at play — no manual trim', async () => {
    // A Lottie + a ticker. NOTHING is keyframed and NO content-start marker is placed:
    // before this change the settle was `outPoint` verbatim, so content started at play.
    const { clock, r } = boot(scene({ children: [lottie('lot'), infiniteTicker('sub')] }));
    await r.play({});

    expect(tickerStarted()).toBe(false); // not at play…
    await run(clock, 400);
    expect(tickerStarted()).toBe(false); // …not mid-intro…
    await run(clock, 240); // t = 640 ms, just shy of the 660 ms settle
    expect(tickerStarted()).toBe(false);

    await run(clock, 100); // t = 740 ms — past the settle
    expect(tickerStarted()).toBe(true);
    r.remove();
  });

  it('MULTIPLE Lotties — the LATEST derived frame wins (the scope settles when EVERYTHING has)', async () => {
    const { clock, r } = boot(
      scene({
        children: [
          lottie('fast', { introEnd: 20 }), // → frame 33  (660 ms)
          lottie('slow', { introEnd: 40 }), // → frame 67 (1340 ms)
          infiniteTicker('sub'),
        ],
      }),
    );
    await r.play({});
    await run(clock, 800); // past the FAST one's settle…
    expect(tickerStarted()).toBe(false); // …but the slow one has not settled
    await run(clock, 620); // t = 1420 ms — past the slow one
    expect(tickerStarted()).toBe(true);
    r.remove();
  });

  it('MIXED with keyframes — the settle is the MAX (Lottie later than the keyframe tail)', async () => {
    // Keyframed background settles at frame 10 (200 ms); the Lottie needs frame 33.
    const { clock, r } = boot(
      scene({ children: [introShape('bg', 10), lottie('lot'), infiniteTicker('sub')] }),
    );
    await r.play({});
    await run(clock, 400); // well past the keyframe settle
    expect(tickerStarted()).toBe(false); // the Lottie still governs
    await run(clock, 340); // t = 740 ms
    expect(tickerStarted()).toBe(true);
    r.remove();
  });

  it('MIXED with keyframes — the settle is the MAX (keyframe tail later than the Lottie)', async () => {
    // Keyframed background settles at frame 60 (1200 ms); the Lottie only needs 33.
    const { clock, r } = boot(
      scene({ children: [introShape('bg', 60), lottie('lot'), infiniteTicker('sub')] }),
    );
    await r.play({});
    await run(clock, 800); // past the Lottie's 660 ms…
    expect(tickerStarted()).toBe(false); // …the background is still moving
    await run(clock, 500); // t = 1300 ms
    expect(tickerStarted()).toBe(true);
    r.remove();
  });

  it('a MANUAL content-start marker STILL WINS over the derived value (no regression)', async () => {
    // Marker at frame 10 (200 ms) with a Lottie that would derive frame 33 (660 ms).
    const { clock, r } = boot(
      scene({ children: [lottie('lot'), infiniteTicker('sub')], contentStart: 10 }),
    );
    await r.play({});
    await run(clock, 100);
    expect(tickerStarted()).toBe(false);
    await run(clock, 160); // t = 260 ms — past the MARKER, long before the Lottie settle
    expect(tickerStarted()).toBe(true);
    r.remove();
  });

  it('a HIDDEN Lottie contributes NOTHING — the B-034 inert gate extends to the settle', async () => {
    const { clock, r } = boot(
      scene({ children: [lottie('lot', { visible: false }), infiniteTicker('sub')] }),
    );
    await r.play({});
    // No contribution ⇒ no settle ⇒ hold entry is the out-point and the leg collapses,
    // exactly as before this change: content starts at play.
    expect(tickerStarted()).toBe(true);
    await run(clock, 20);
    expect(tickerStarted()).toBe(true);
    r.remove();
  });

  it('a Lottie under a HIDDEN ANCESTOR contributes nothing to the parent settle', async () => {
    const { clock, r } = boot(
      scene({
        children: [instance('inst', 'c1', false), infiniteTicker('sub')],
        compositions: [childComp()],
      }),
    );
    await r.play({});
    expect(tickerStarted()).toBe(true); // the hidden subtree is inert for the ROOT settle
    await run(clock, 20);
    expect(tickerStarted()).toBe(true);
    r.remove();
  });

  it('phases ABSENT (a marker-less clip) contributes nothing — the whole clip is NOT an authored intro', async () => {
    const { clock, r } = boot(
      scene({ children: [lottie('lot', { noPhases: true }), infiniteTicker('sub')] }),
    );
    await r.play({});
    expect(tickerStarted()).toBe(true); // unchanged from pre-D-125 behaviour
    await run(clock, 20);
    expect(tickerStarted()).toBe(true);
    r.remove();
  });

  it('SPEED 2 halves the derived frame — the settle tracks the authored speed', async () => {
    const { clock, r } = boot(
      scene({ children: [lottie('lot', { speed: 2 }), infiniteTicker('sub')] }),
    );
    await r.play({});
    await run(clock, 280); // t = 280 ms, before the 340 ms settle (frame 17)
    expect(tickerStarted()).toBe(false);
    await run(clock, 120); // t = 400 ms
    expect(tickerStarted()).toBe(true);
    r.remove();
  });

  it('a derived settle PAST the out-point is CLAMPED to the out-point (never beyond)', async () => {
    // The owner's exact case: the intro needs frame 33, the out-point is at 30 (600 ms).
    const { clock, r } = boot(
      scene({ children: [lottie('lot'), infiniteTicker('sub')], outPoint: 30 }),
    );
    await r.play({});
    await run(clock, 560);
    expect(tickerStarted()).toBe(false); // still swept, not collapsed
    // t = 620 ms — past the CLAMPED settle (frame 30 = 600 ms). An UNCLAMPED settle would
    // be frame 33 = 660 ms and the ticker would still be waiting here, so this pins the clamp.
    await run(clock, 60);
    expect(tickerStarted()).toBe(true);
    r.remove();
  });

  it('REGRESSION: a comp with NO Lottie keeps its keyframe-derived settle exactly as before', async () => {
    const { clock, r } = boot(scene({ children: [introShape('bg', 10), infiniteTicker('sub')] }));
    await r.play({});
    expect(tickerStarted()).toBe(false);
    await run(clock, 100);
    expect(tickerStarted()).toBe(false); // frame 10 = 200 ms
    await run(clock, 160); // t = 260 ms
    expect(tickerStarted()).toBe(true);
    r.remove();
  });
});
