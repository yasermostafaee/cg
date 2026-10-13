import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import type * as LottieBridge from '@cg/lottie-bridge';
import type { Composition, Element, Playout, Scene } from '@cg/shared-schema';

/**
 * D-125 Phase 2 — the LIFECYCLE crux on the injected `RuntimeClock`: the composition
 * IN / HOLD / OUT mapped onto the element's own frame space (§D1), the ELEMENT-OUTRO
 * SEAM (§D6.2 — `out()`/`stop()` play the Lottie outro BEFORE the background), the
 * opt-in `drivesHold` contribution (§D6.3), and the B-030..B-034 risk defenses (§D6.4)
 * including the explicit B-034 hidden/visible gate on the NEW collections.
 *
 * The `@cg/lottie-bridge` player is mocked with a recording handle, so every assertion
 * is on the exact frames the driver painted — deterministic, no real `lottie_light`.
 */

const { handles } = vi.hoisted(() => ({
  handles: [] as { frames: number[]; destroyed: boolean; el: HTMLElement }[],
}));

// Only the PLAYER is stubbed; the module's pure helpers (`lottieClipMeta` /
// `lottieTiming` — the frame-space conversion the runtime derives the entrance settle
// from) are kept REAL, so this suite exercises the same arithmetic as production.
vi.mock('@cg/lottie-bridge', async (importOriginal) => ({
  ...(await importOriginal<typeof LottieBridge>()),
  createLottiePlayer: (container: HTMLElement) => {
    const h = {
      element: container,
      el: container,
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
}));

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

const baseTransform = {
  position: { x: 0, y: 0 },
  size: { w: 400, h: 200 },
  scale: { x: 1, y: 1 },
  rotation: 0,
  anchor: { x: 0, y: 0 },
};

/**
 * The animation's own frame space. `fr: 100` ⇒ 1 frame every 10 ms, so every phase
 * below converts to a round number of milliseconds on the fake clock:
 *   intro  [0 → 10]   = 100 ms
 *   idle   [10 → 20]  = 100 ms per loop
 *   outro  [20 → 100] = 800 ms  (deliberately LONGER than the 400 ms content fade,
 *                                so the background provably waits on the LOTTIE)
 */
const lottieAssets = { a: { ip: 0, op: 100, fr: 100, w: 400, h: 200, layers: [] } };
const INTRO_END = 10;
const OUTRO_START = 20;
const OP = 100;
/** ms to drive the outro `[20 → 100]` at fr 100 × speed 1. */
const OUTRO_MS = ((OP - OUTRO_START) / 100) * 1000;

interface LottieOpts {
  visible?: boolean;
  drivesHold?: boolean;
  holdBehavior?: 'freeze' | 'idle-loop';
  /** Omit the `phases` object entirely — the marker-less / degenerate-outro case. */
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
    speed: 1,
    loopMode: 'none',
    holdBehavior: o.holdBehavior ?? 'freeze',
  };
  if (o.drivesHold !== undefined) el['drivesHold'] = o.drivesHold;
  if (o.noPhases !== true) {
    el['phases'] = { introEnd: INTRO_END, outroStart: OUTRO_START, source: 'markers' };
  }
  return el as unknown as Element;
}

/** A keyframed background: NOT content, so it is the thing that must move LAST. */
function bgShape(id: string): Element {
  return {
    id,
    name: id,
    type: 'shape',
    shape: 'rect',
    fill: { kind: 'solid', color: '#123456' },
    transform: baseTransform,
    opacity: 0,
    visible: true,
    locked: false,
    zIndex: 0,
    animation: {
      tracks: {
        opacity: {
          keyframes: [
            { frame: 0, value: 0, easing: 'linear' },
            { frame: 25, value: 0.5, easing: 'linear' },
            { frame: 50, value: 1, easing: 'linear' },
          ],
        },
      },
    },
  } as unknown as Element;
}

/** An infinite ticker — the native content that DRIVES the hold while the Lottie holds beneath. */
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

/**
 * A child composition whose Lottie is VISIBLE at the leaf — only the ANCESTOR instance is
 * hidden. This is the subtle case a leaf-only B-034 gate misses.
 */
function hiddenAncestorChild(): Composition {
  return {
    id: 'c1',
    name: 'child',
    resolution: { width: 400, height: 200 },
    frameRange: { in: 0, out: 50 },
    activeRange: { in: 0, out: 50 },
    lifecycle: { outPoint: 25 },
    editorBackdrop: 'transparent',
    layers: [
      {
        id: 'cl',
        name: 'cl',
        visible: true,
        locked: false,
        blendMode: 'normal',
        children: [lottie('inner', { drivesHold: true, holdBehavior: 'idle-loop' })],
      },
    ],
    fields: [],
    bindings: [],
  } as unknown as Composition;
}

function instance(id: string, name: string, compositionId: string, visible = true): Element {
  return {
    id,
    name,
    type: 'composition',
    compositionId,
    transform: baseTransform,
    opacity: 1,
    visible,
    locked: false,
    zIndex: 0,
  } as unknown as Element;
}

function scene(children: Element[], playout?: Playout, compositions: Composition[] = []): Scene {
  return {
    schemaVersion: 1,
    id: 's',
    name: 's',
    templateType: 'custom',
    resolution: { width: 400, height: 200 },
    frameRate: 50,
    safeAreas: { title: 10, action: 5 },
    frameRange: { in: 0, out: 50 },
    activeRange: { in: 0, out: 50 },
    // intro [0→25] (500 ms), hold @25, background outro [25→50] (500 ms)
    lifecycle: { outPoint: 25 },
    ...(playout !== undefined ? { playout } : {}),
    editorBackdrop: 'transparent',
    layers: [
      { id: 'pl', name: 'main', visible: true, locked: false, blendMode: 'normal', children },
    ],
    fields: [],
    bindings: [],
    fonts: [],
    compositions,
    metadata: { createdAt: '2026-07-18T00:00:00.000Z', updatedAt: '2026-07-18T00:00:00.000Z' },
  } as unknown as Scene;
}

const onAir = (): boolean => !document.body.classList.contains('cg-pending');
const frames = (i = 0): number[] => handles[i]?.frames ?? [];
const lastFrame = (i = 0): number | undefined => frames(i).at(-1);
/** Frames painted INSIDE the outro span — the proof `playOutro()` actually ran. */
const outroFrames = (i = 0): number[] => frames(i).filter((f) => f > OUTRO_START);

beforeEach(() => {
  document.body.innerHTML = '';
  document.body.className = '';
  handles.length = 0;
});
afterEach(() => {
  document.body.innerHTML = '';
  document.body.className = '';
});

describe('D-125 §D1/§D6 — the Lottie IN / HOLD / OUT lifecycle', () => {
  it('out(): intro once → freeze hold → a ticker drives the hold → LOTTIE OUTRO → background LAST → CLEARED', async () => {
    const clock = makeClock();
    const r = createRuntime(
      // content-driven: the infinite TICKER drives the hold; the Lottie holds beneath it
      // (`drivesHold` absent ⇒ opt-OUT by the D-125 inverse default).
      scene([bgShape('bg'), lottie('lot'), infiniteTicker('crawl')], {
        mode: 'auto-out',
        holdSource: 'content-driven',
      } as unknown as Playout),
      { skipFontLoad: true, installGlobals: false, lottieAssets, clock, tickerMeasure },
    );
    await r.play({});

    // IN — the intro plays ONCE from `ip`, driven by the injected clock.
    expect(lastFrame()).toBe(0);
    await run(clock, 50);
    expect(lastFrame()).toBe(5); // 50 ms × fr 100 = frame 5, mid-intro

    // HOLD — freeze at `introEnd` and STAY there while the ticker drives the hold.
    await run(clock, 1000);
    expect(lastFrame()).toBe(INTRO_END);
    expect(onAir()).toBe(true);
    expect(outroFrames()).toHaveLength(0); // no outro before out()

    // OUT — the element outro plays; the background must NOT close over it.
    const outP = r.out();
    await run(clock, 400); // the 400 ms content fade has elapsed, the 800 ms outro has NOT
    expect(onAir()).toBe(true); // background still waiting on the LOTTIE
    const midOutro = lastFrame() ?? 0;
    expect(midOutro).toBeGreaterThan(OUTRO_START); // outro genuinely advancing
    expect(midOutro).toBeLessThan(OP);

    // The outro reaches `op`, THEN the background plays its own outro and settles CLEARED.
    await run(clock, OUTRO_MS);
    await outP;
    expect(lastFrame()).toBe(OP); // clamped to the last frame
    await run(clock, 1000);
    expect(onAir()).toBe(false); // CLEARED
    const afterSettle = frames().length;
    await run(clock, 500);
    expect(frames()).toHaveLength(afterSettle); // halted — no driver left ticking
    r.remove();
  });

  it('stop() ALSO plays the Lottie outro before the background, settling CLEARED', async () => {
    const clock = makeClock();
    const r = createRuntime(scene([bgShape('bg'), lottie('lot')]), {
      skipFontLoad: true,
      installGlobals: false,
      lottieAssets,
      clock,
      tickerMeasure,
    });
    await r.play({});
    await run(clock, 1000); // intro → freeze hold
    expect(lastFrame()).toBe(INTRO_END);

    const stopP = r.stop();
    await run(clock, 200); // mid-outro
    expect(onAir()).toBe(true); // the background has NOT closed over the Lottie
    expect(lastFrame()).toBeGreaterThan(OUTRO_START);

    await run(clock, OUTRO_MS);
    await stopP;
    expect(lastFrame()).toBe(OP);
    await run(clock, 1000);
    expect(onAir()).toBe(false);
    r.remove();
  });

  it('EYE-VERIFIABLE: freeze stays motionless on introEnd while idle-loop advances and WRAPS', async () => {
    // The owner could not see a freeze-vs-idle-loop difference in Phase 1. This asserts the
    // distinction the PREVIEW must now show: same clock, same ticks, two different holds.
    const clock = makeClock();
    const r = createRuntime(
      scene([bgShape('bg'), lottie('freeze'), lottie('idle', { holdBehavior: 'idle-loop' })]),
      { skipFontLoad: true, installGlobals: false, lottieAssets, clock, tickerMeasure },
    );
    await r.play({});
    await run(clock, 100); // both intros complete (100 ms)

    const frozenAtHold = lastFrame(0);
    expect(frozenAtHold).toBe(INTRO_END);

    // N ticks INTO the hold…
    await run(clock, 250);
    // …the FREEZE driver has not moved: still the hold frame, and it stopped painting.
    expect(lastFrame(0)).toBe(INTRO_END);
    // …while the IDLE-LOOP driver has advanced and wrapped WITHIN [idleIn, idleOut].
    // idle span defaults to [introEnd, outroStart] = [10, 20].
    const idleNow = lastFrame(1) ?? -1;
    expect(idleNow).toBeGreaterThanOrEqual(INTRO_END);
    expect(idleNow).toBeLessThan(OUTRO_START);
    const idlePaints = frames(1).filter((f) => f >= INTRO_END && f < OUTRO_START);
    expect(idlePaints.length).toBeGreaterThan(5); // continuously repainting = visibly looping
    // It genuinely WRAPPED (came back down), not merely advanced past the span.
    const wrapped = idlePaints.some((f, i) => i > 0 && f < (idlePaints[i - 1] ?? 0));
    expect(wrapped).toBe(true);
    r.remove();
  });
});

describe('D-125 §D6.3 — drivesHold is OPT-IN (the inverse default)', () => {
  it('drivesHold ABSENT: the Lottie does NOT gate the content-driven hold', async () => {
    const clock = makeClock();
    const r = createRuntime(
      // An IDLE-LOOP Lottie NEVER completes. With the correct OPT-IN default it is not a
      // driver at all ⇒ B-032 falls the content-driven hold back to `timed` (holdMs 0) and
      // the scene exits on its own. Reading `drivesHold` as `!== false` (the opt-OUT default
      // of the ticker/clock/sequence) would make it an infinite driver and hang this scene
      // on air forever — which is exactly what this asserts against.
      scene([bgShape('bg'), lottie('lot', { holdBehavior: 'idle-loop' })], {
        mode: 'auto-out',
        holdSource: 'content-driven',
        holdMs: 0,
      } as unknown as Playout),
      { skipFontLoad: true, installGlobals: false, lottieAssets, clock, tickerMeasure },
    );
    await r.play({});
    await run(clock, 3000);
    // Not held open by the Lottie: the composition reached its own exit.
    expect(onAir()).toBe(false);
    r.remove();
  });

  it('drivesHold TRUE + freeze: the intro completion GATES the hold (a self-contained sting)', async () => {
    const clock = makeClock();
    const r = createRuntime(
      scene([bgShape('bg'), lottie('lot', { drivesHold: true })], {
        mode: 'auto-out',
        holdSource: 'content-driven',
      } as unknown as Playout),
      { skipFontLoad: true, installGlobals: false, lottieAssets, clock, tickerMeasure },
    );
    await r.play({});
    // The background intro is 500 ms; the Lottie intro completes at 100 ms. Before the
    // background even reaches its hold the Lottie has completed — but the graphic is held
    // on air by the composition's own intro, so it is still on air here.
    await run(clock, 200);
    expect(onAir()).toBe(true);
    // The hold is gated by the Lottie's completion, which HAS resolved ⇒ the composition
    // proceeds through its background outro and settles rather than holding forever.
    await run(clock, 2000);
    expect(onAir()).toBe(false);
    r.remove();
  });

  it('a content-driven AUTO-exit (the self-contained sting) PLAYS the element outro before the background', async () => {
    // FLIPPED in Phase 3b-2. Until then this was a CHARACTERIZATION test pinning the
    // Phase-2 boundary as shipped: `expect(lastFrame()).toBe(INTRO_END)` ("parked on the
    // hold frame") and `expect(outroFrames()).toHaveLength(0)` ("the element outro NOT
    // played") — the composition ended its own hold through
    // `PlayoutController.startOutro()`, which bypassed the out()/stop() seam entirely,
    // so the furniture snapped off. Those assertions described a DEFECT (tasks 7.6,
    // design §D6.2 BOUNDARY note), deliberately deferred out of Phase 2. §D6.2b routes
    // every path into `startOutro()` through the one-shot outro ledger, so the sting
    // now closes exactly like an operator exit: element outro → background → CLEARED.
    const clock = makeClock();
    const r = createRuntime(
      scene([bgShape('bg'), lottie('lot', { drivesHold: true })], {
        mode: 'auto-out',
        holdSource: 'content-driven',
      } as unknown as Playout),
      { skipFontLoad: true, installGlobals: false, lottieAssets, clock, tickerMeasure },
    );
    await r.play({});
    // The intro freezes at 100 ms; the (zero-length) content hold ends at the intro end
    // (~500 ms) and the AUTO-exit begins: the 800 ms element outro must be driving.
    await run(clock, 1000);
    expect(onAir()).toBe(true); // background must NOT have closed over the outro
    const mid = lastFrame() ?? 0;
    expect(mid).toBeGreaterThan(OUTRO_START); // outro genuinely advancing…
    expect(mid).toBeLessThan(OP); // …and not yet done
    // Outro completes (~1300 ms), THEN the background outro (500 ms), then CLEARED.
    await run(clock, 1500);
    expect(lastFrame()).toBe(OP); // clamped to the last frame — the outro finished
    expect(onAir()).toBe(false); // settled CLEARED
    const after = frames().length;
    await run(clock, 400);
    expect(frames()).toHaveLength(after); // halted — no driver left ticking
    r.remove();
  });

  it('drivesHold TRUE + idle-loop: never completes — holds until stop() (an infinite driver)', async () => {
    const clock = makeClock();
    const r = createRuntime(
      scene([bgShape('bg'), lottie('lot', { drivesHold: true, holdBehavior: 'idle-loop' })], {
        mode: 'auto-out',
        holdSource: 'content-driven',
      } as unknown as Playout),
      { skipFontLoad: true, installGlobals: false, lottieAssets, clock, tickerMeasure },
    );
    await r.play({});
    await run(clock, 3000);
    expect(onAir()).toBe(true); // still holding — the idle loop never completes
    const stopP = r.stop();
    await run(clock, OUTRO_MS + 1000);
    await stopP;
    expect(onAir()).toBe(false);
    r.remove();
  });
});

describe('D-125 §D6.4 — B-030..B-034 risk defenses', () => {
  it('DEGENERATE outro (no phases) resolves immediately — the exit never strands', async () => {
    const clock = makeClock();
    const r = createRuntime(scene([bgShape('bg'), lottie('lot', { noPhases: true })]), {
      skipFontLoad: true,
      installGlobals: false,
      lottieAssets,
      clock,
      tickerMeasure,
    });
    await r.play({});
    await run(clock, 1000);

    const outP = r.out();
    // Only the 400 ms content fade gates the background — there is no outro to wait for.
    await run(clock, 500);
    await outP;
    await run(clock, 1000);
    expect(onAir()).toBe(false); // settled CLEARED, never hung on an unresolved outro
    r.remove();
  });

  it('a superseding out() mid-outro does not strand, and a REPLAY re-arms (B-033)', async () => {
    const clock = makeClock();
    const r = createRuntime(scene([bgShape('bg'), lottie('lot', { drivesHold: true })]), {
      skipFontLoad: true,
      installGlobals: false,
      lottieAssets,
      clock,
      tickerMeasure,
    });
    await r.play({});
    await run(clock, 1000);

    const firstOut = r.out();
    await run(clock, 200); // mid-outro
    const secondOut = r.out(); // supersede
    await run(clock, OUTRO_MS + 1000);
    // BOTH settle — neither promise is left hanging on a superseded outro.
    await expect(Promise.all([firstOut, secondOut])).resolves.toBeDefined();
    expect(onAir()).toBe(false);

    // B-033 — a REPLAY re-mints the completion deferred: the 2nd play's hold must NOT
    // close instantly on last run's already-resolved signal.
    await r.play({});
    expect(onAir()).toBe(true);
    expect(lastFrame()).toBe(0); // reset back to `ip` — the intro plays from the start
    await run(clock, 50);
    expect(lastFrame()).toBe(5); // and it is genuinely advancing again
    r.remove();
  });

  it('a play() mid-outro supersedes it and re-opens the graphic (no strand)', async () => {
    const clock = makeClock();
    const r = createRuntime(scene([bgShape('bg'), lottie('lot')]), {
      skipFontLoad: true,
      installGlobals: false,
      lottieAssets,
      clock,
      tickerMeasure,
    });
    await r.play({});
    await run(clock, 1000);

    const outP = r.out();
    await run(clock, 200); // mid-outro
    await r.play({}); // supersede with a fresh play
    expect(lastFrame()).toBe(0); // reset to `ip` by the new play
    // The new play() re-mints the driver, which SETTLES the in-flight outro promise (the
    // strand defense). Advance past the superseded fade timer so out() reaches its gen
    // check — where it must bail instead of closing the freshly re-opened graphic.
    await run(clock, 500);
    await outP; // the superseded out() must RESOLVE, not hang forever
    await run(clock, 1000);
    expect(onAir()).toBe(true); // the graphic is open again, not closed by the stale out()
    r.remove();
  });

  it('pause mid-outro holds the half-played frame; resume finishes it and the background closes', async () => {
    const clock = makeClock();
    const r = createRuntime(scene([bgShape('bg'), lottie('lot')]), {
      skipFontLoad: true,
      installGlobals: false,
      lottieAssets,
      clock,
      tickerMeasure,
    });
    await r.play({});
    await run(clock, 1000);

    const outP = r.out();
    await run(clock, 200); // mid-outro
    r.pause();
    const atPause = lastFrame();
    expect(atPause).toBeGreaterThan(OUTRO_START);
    expect(atPause).toBeLessThan(OP);

    await run(clock, 2000); // time passes, but the scene is PAUSED
    expect(lastFrame()).toBe(atPause); // frozen on the half-played outro frame
    expect(onAir()).toBe(true); // and the graphic did NOT close while paused

    r.resume();
    await run(clock, OUTRO_MS + 1000);
    await outP;
    expect(lastFrame()).toBe(OP); // the outro completed after resume
    await run(clock, 1000);
    expect(onAir()).toBe(false);
    r.remove();
  });

  it('remove() is a SYNCHRONOUS hard kill — no outro awaited (the panic path)', async () => {
    const clock = makeClock();
    const r = createRuntime(scene([bgShape('bg'), lottie('lot')]), {
      skipFontLoad: true,
      installGlobals: false,
      lottieAssets,
      clock,
      tickerMeasure,
    });
    await r.play({});
    await run(clock, 1000);

    const before = frames().length;
    r.remove(); // synchronous — returns void, nothing to await
    expect(handles[0]?.destroyed).toBe(true);
    // No outro frames were driven on the way out.
    expect(frames()).toHaveLength(before);
    expect(outroFrames()).toHaveLength(0);
  });
});

describe('D-125 + B-034 — a HIDDEN Lottie is fully inert on the NEW collections', () => {
  it('a hidden Lottie is NOT awaited on out(): the exit does not stall by its outro', async () => {
    const clock = makeClock();
    const r = createRuntime(scene([bgShape('bg'), lottie('lot', { visible: false })]), {
      skipFontLoad: true,
      installGlobals: false,
      lottieAssets,
      clock,
      tickerMeasure,
    });
    await r.play({});
    await run(clock, 1000);

    const outP = r.out();
    // Only the 400 ms fade gates the background — the hidden Lottie's 800 ms outro must
    // NOT be awaited (it would stall the exit for something nobody can see). Reverting the
    // gate makes the scene still be on air here.
    await run(clock, 500);
    await outP;
    await run(clock, 1000);
    expect(onAir()).toBe(false);
    // …and its outro was never driven at all.
    expect(outroFrames()).toHaveLength(0);
    r.remove();
  });

  it('a hidden Lottie with drivesHold:true does NOT gate the hold (the hard gate wins)', async () => {
    const clock = makeClock();
    const r = createRuntime(
      // An idle-loop Lottie that opts in would NEVER complete — if the hidden gate did not
      // win over `drivesHold`, this scene would hang on air forever.
      scene(
        [
          bgShape('bg'),
          lottie('lot', { visible: false, drivesHold: true, holdBehavior: 'idle-loop' }),
        ],
        { mode: 'auto-out', holdSource: 'content-driven', holdMs: 0 } as unknown as Playout,
      ),
      { skipFontLoad: true, installGlobals: false, lottieAssets, clock, tickerMeasure },
    );
    await r.play({});
    await run(clock, 3000);
    expect(onAir()).toBe(false); // not held open by the hidden opted-in Lottie
    r.remove();
  });

  it('HIDDEN ANCESTOR: a visible Lottie inside a hidden instance has NO outro awaited', async () => {
    const clock = makeClock();
    // The root holds MANUALLY (no playout ⇒ holds the out-point until out()/stop()), so the
    // scene is provably still on air when out() is called — otherwise this test would be
    // vacuous (an auto-exited scene makes out() a no-op and every assertion trivially true).
    const r = createRuntime(
      scene([bgShape('bg'), instance('inst', 'home', 'c1', false)], undefined, [
        hiddenAncestorChild(),
      ]),
      { skipFontLoad: true, installGlobals: false, lottieAssets, clock, tickerMeasure },
    );
    await r.play({});
    await run(clock, 1000);
    // The inner Lottie WAS built + mounted (the hidden gate is about the lifecycle
    // collections, not about skipping the build) …
    expect(handles.length).toBeGreaterThan(0);
    expect(onAir()).toBe(true); // …and the scene is genuinely on air — out() will do work.

    const outP = r.out();
    await run(clock, 500); // past the 400 ms fade, well short of the 800 ms outro
    await outP;
    // The hidden subtree's outro was never driven — not one frame inside the outro span.
    expect(outroFrames()).toHaveLength(0);
    await run(clock, 600);
    expect(onAir()).toBe(false); // settled CLEARED, never stalled by the hidden subtree
    r.remove();
  });

  it('HIDDEN ANCESTOR: a visible opted-in Lottie inside a hidden instance gates NO hold', async () => {
    const clock = makeClock();
    // The inner Lottie is `drivesHold: true` + idle-loop — it NEVER completes. If the hidden
    // ancestor did not make it inert, this content-driven scene would hang on air forever.
    const r = createRuntime(
      scene(
        [bgShape('bg'), instance('inst', 'home', 'c1', false)],
        { mode: 'auto-out', holdSource: 'content-driven', holdMs: 0 } as unknown as Playout,
        [hiddenAncestorChild()],
      ),
      { skipFontLoad: true, installGlobals: false, lottieAssets, clock, tickerMeasure },
    );
    await r.play({});
    await run(clock, 3000);
    expect(onAir()).toBe(false); // exited on its own — the hidden subtree contributed nothing
    r.remove();
  });
});

/**
 * D-125 §D6.2b (Phase 3b-2) — the AUTO-exit seam. A composition that ends its OWN hold
 * (auto-out expiry, content completion, a zero-length hold, each loop-cycle boundary)
 * exits through `PlayoutController.startOutro()`; every such path now routes the scope
 * subtree's element outros through the ONE-SHOT ledger before the background leg — the
 * same contract out()/stop() have had since Phase 2, with double-play structurally
 * impossible (a second trigger in the same episode awaits or no-ops, never re-drives).
 *
 * Timing map used throughout (comp 50 fps, outPoint 25, active out 50, clip fr 100):
 *   background intro 500 ms · background outro [25→50] = 500 ms
 *   element outro [20→100] = 800 ms (OUTRO_MS) · element intro [0→10] = 100 ms
 */
describe('D-125 §D6.2b — AUTO-exit routes through the element-outro seam', () => {
  const opCount = (i = 0): number => frames(i).filter((f) => f === OP).length;
  /** Frames strictly inside the outro span, in paint order — a re-drive would restart low. */
  const outroSeq = (i = 0): number[] => frames(i).filter((f) => f > OUTRO_START);
  const isMonotonic = (xs: number[]): boolean => xs.every((v, j) => j === 0 || v >= xs[j - 1]!);

  function autoComp(id: string, children: Element[], playout: Playout): Composition {
    return {
      id,
      name: id,
      resolution: { width: 400, height: 200 },
      frameRange: { in: 0, out: 50 },
      activeRange: { in: 0, out: 50 },
      lifecycle: { outPoint: 25 },
      playout,
      editorBackdrop: 'transparent',
      layers: [
        { id: `${id}-l`, name: 'l', visible: true, locked: false, blendMode: 'normal', children },
      ],
      fields: [],
      bindings: [],
    } as unknown as Composition;
  }

  it('AUTO-OUT (timed): the element outro plays to completion, THEN the background — CLEARED', async () => {
    const clock = makeClock();
    const r = createRuntime(
      scene([bgShape('bg'), lottie('lot')], {
        mode: 'auto-out',
        holdSource: 'timed',
        holdMs: 200,
      } as unknown as Playout),
      { skipFontLoad: true, installGlobals: false, lottieAssets, clock, tickerMeasure },
    );
    await r.play({});
    // Hold expires at 700 ms; the 800 ms element outro runs [700 → 1500].
    await run(clock, 1000);
    expect(onAir()).toBe(true);
    const mid = lastFrame() ?? 0;
    expect(mid).toBeGreaterThan(OUTRO_START);
    expect(mid).toBeLessThan(OP);
    // Pre-fix the scene settled at ~1200 ms (background only). At 1700 ms the element
    // outro has finished but the BACKGROUND outro [1500 → 2000] is still playing — the
    // exit consumed the element outro's duration first.
    await run(clock, 700);
    expect(lastFrame()).toBe(OP);
    expect(onAir()).toBe(true); // background still closing — not snapped
    await run(clock, 700);
    expect(onAir()).toBe(false); // CLEARED at ~2000 ms
    expect(opCount()).toBe(1); // the outro was DRIVEN exactly once
    expect(isMonotonic(outroSeq())).toBe(true); // single pass — never restarted
    r.remove();
  });

  it('zero-length content hold (no content elements): the outro still plays — no snap, no strand', async () => {
    const clock = makeClock();
    const r = createRuntime(
      // No ticker/clock/sequence and the Lottie does NOT drive the hold ⇒ waitForContent
      // is null ⇒ a zero-length hold: the earliest possible auto-exit path.
      scene([bgShape('bg'), lottie('lot')], {
        mode: 'auto-out',
        holdSource: 'content-driven',
      } as unknown as Playout),
      { skipFontLoad: true, installGlobals: false, lottieAssets, clock, tickerMeasure },
    );
    await r.play({});
    await run(clock, 2400); // 500 intro + 0 hold + 800 outro + 500 background + slack
    expect(onAir()).toBe(false);
    expect(opCount()).toBe(1); // the outro played…
    expect(outroFrames().length).toBeGreaterThan(1); // …and was genuinely driven
    r.remove();
  });

  it('NO STRAND (B-030): a degenerate/absent outro settles at background speed — nothing awaited', async () => {
    const clock = makeClock();
    const r = createRuntime(
      scene([bgShape('bg'), lottie('lot', { noPhases: true })], {
        mode: 'auto-out',
        holdSource: 'timed',
        holdMs: 200,
      } as unknown as Playout),
      { skipFontLoad: true, installGlobals: false, lottieAssets, clock, tickerMeasure },
    );
    await r.play({});
    // Exit at 700 ms + background 500 ms — CLEARED by ~1200 ms. A (buggy) await on the
    // marker-less clip would push settle past 2000 ms, so the 1600 ms check bites.
    // (No frame assertion here: a marker-less clip's WHOLE clip plays as the intro, so
    // high frame numbers are legitimate intro paints — the timing is the strand proof.)
    await run(clock, 1600);
    expect(onAir()).toBe(false);
    r.remove();
  });

  it('LOOP-CYCLE ×3: the outro plays and RE-ARMS on every cycle; the intro replays each cycle', async () => {
    const clock = makeClock();
    const r = createRuntime(
      // Cycle = 500 intro + 100 hold + 800 element outro + 500 background = 1900 ms.
      scene([bgShape('bg'), lottie('lot')], {
        mode: 'loop-cycle',
        holdSource: 'timed',
        holdMs: 100,
        repeat: 3,
      } as unknown as Playout),
      { skipFontLoad: true, installGlobals: false, lottieAssets, clock, tickerMeasure },
    );
    await r.play({});
    await run(clock, 2100); // inside cycle 2's intro
    expect(opCount()).toBe(1); // cycle 1's outro DROVE to op — once
    // The cycle boundary re-armed the furniture: cycle 2 replays the INTRO (without the
    // §D6.2b re-arm the driver would sit parked at `op`, invisible, for every later cycle).
    // Cycle 2 spans 1900→3800: its Lottie intro (1900→2000) froze at the hold frame, and
    // its exit begins at 2500 — so probe at 2400, safely inside the frozen hold.
    await run(clock, 300); // ~2400 ms
    expect(lastFrame()).toBe(INTRO_END);
    await run(clock, 1600); // ~4000 ms: cycle 2's outro (2500→3300) finished
    expect(opCount()).toBe(2);
    await run(clock, 2000); // ~6000 ms: cycle 3 (3800→5700) fully done
    expect(opCount()).toBe(3); // one outro drive per cycle — exactly three
    expect(onAir()).toBe(false); // settled CLEARED after the final cycle
    r.remove();
  });

  it('LOOP-CYCLE + content-driven + drivesHold (B-033): cycle 2 re-mints completion AND replays the outro', async () => {
    const clock = makeClock();
    const r = createRuntime(
      // The sting, cycled: each cycle's hold gates on the Lottie's freeze. Without the
      // boundary re-arm the ledger still holds cycle 1's mark AND whenComplete stays
      // resolved — cycle 2 would close instantly WITH NO OUTRO (the exact B-033 shape).
      scene([bgShape('bg'), lottie('lot', { drivesHold: true })], {
        mode: 'loop-cycle',
        holdSource: 'content-driven',
        repeat: 2,
      } as unknown as Playout),
      { skipFontLoad: true, installGlobals: false, lottieAssets, clock, tickerMeasure },
    );
    await r.play({});
    // Cycle ≈ 500 intro + ~0 hold (froze at 100 ms) + 800 outro + 500 background = 1800 ms.
    await run(clock, 2000); // inside cycle 2
    expect(opCount()).toBe(1);
    await run(clock, 2200); // cycle 2 complete
    expect(opCount()).toBe(2); // the outro DROVE again on cycle 2
    expect(onAir()).toBe(false);
    r.remove();
  });

  it('NESTED scope: an auto-exiting nested comp awaits ITS OWN Lottie — the root sibling is untouched', async () => {
    const clock = makeClock();
    const r = createRuntime(
      scene(
        [bgShape('bg'), lottie('rootLot'), instance('inst', 'n', 'c1')],
        { mode: 'manual' } as unknown as Playout,
        [
          autoComp('c1', [lottie('inner')], {
            mode: 'auto-out',
            holdSource: 'timed',
            holdMs: 200,
          } as unknown as Playout),
        ],
      ),
      { skipFontLoad: true, installGlobals: false, lottieAssets, clock, tickerMeasure },
    );
    await r.play({});
    // Nested lifecycle: 500 + 200 + 800 (element outro) + 500 (background) ≈ 2000 ms.
    await run(clock, 2300);
    // Identify by behaviour, not wiring order: exactly ONE driver played an outro.
    const nestedIdx = handles.findIndex((h) => h.frames.some((f) => f > OUTRO_START));
    expect(nestedIdx).toBeGreaterThanOrEqual(0);
    const rootIdx = nestedIdx === 0 ? 1 : 0;
    expect(opCount(nestedIdx)).toBe(1); // the nested outro played, once
    expect(outroFrames(rootIdx)).toHaveLength(0); // the ROOT sibling was NOT driven
    expect(onAir()).toBe(true); // the manual root stays on air
    // The later operator stop() plays the ROOT outro fresh but must NOT re-drive the
    // nested one (its one-shot mark is spent for this run).
    const stopP = r.stop();
    await run(clock, 900); // root element outro (800 ms)
    await run(clock, 700); // background outro
    await stopP;
    expect(onAir()).toBe(false);
    expect(opCount(rootIdx)).toBe(1); // root outro driven exactly once
    expect(opCount(nestedIdx)).toBe(1); // nested outro NOT re-driven
    r.remove();
  });

  it('NO DOUBLE-PLAY: a stop() during a nested AUTO-exit outro awaits it — never re-drives it', async () => {
    const clock = makeClock();
    const r = createRuntime(
      scene(
        [bgShape('bg'), lottie('rootLot'), instance('inst', 'n', 'c1')],
        { mode: 'manual' } as unknown as Playout,
        [
          autoComp('c1', [lottie('inner')], {
            mode: 'auto-out',
            holdSource: 'timed',
            holdMs: 200,
          } as unknown as Playout),
        ],
      ),
      { skipFontLoad: true, installGlobals: false, lottieAssets, clock, tickerMeasure },
    );
    await r.play({});
    await run(clock, 1100); // the nested outro is MID-FLIGHT (started at ~700 ms)
    const nestedIdx = handles.findIndex((h) => h.frames.some((f) => f > OUTRO_START));
    expect(nestedIdx).toBeGreaterThanOrEqual(0);
    const rootIdx = nestedIdx === 0 ? 1 : 0;
    const stopP = r.stop(); // arrives mid-auto-outro: must AWAIT it, not restart it
    await run(clock, 1000); // nested finishes (~1500); root outro runs (~1100 → 1900)
    await run(clock, 1100); // background
    await stopP;
    expect(onAir()).toBe(false);
    // The DRIVE-exactly-once proof: op painted once per driver, and the nested outro
    // sequence is a single monotonic pass — a re-drive would restart at outroStart.
    expect(opCount(nestedIdx)).toBe(1);
    expect(isMonotonic(outroSeq(nestedIdx))).toBe(true);
    expect(opCount(rootIdx)).toBe(1);
    r.remove();
  });

  it('SUPERSEDE (B-031/B-033): a play() during an auto-exit outro re-arms — no stale settle, next exit intact', async () => {
    const clock = makeClock();
    const r = createRuntime(
      scene([bgShape('bg'), lottie('lot')], {
        mode: 'auto-out',
        holdSource: 'timed',
        holdMs: 200,
      } as unknown as Playout),
      { skipFontLoad: true, installGlobals: false, lottieAssets, clock, tickerMeasure },
    );
    await r.play({});
    await run(clock, 1000); // auto-exit outro mid-flight (700 → 1500)
    await r.play({}); // supersede: the new run owns the scene (bumps gen, resets, re-arms)
    await run(clock, 200);
    expect(onAir()).toBe(true);
    expect(lastFrame()).toBeLessThanOrEqual(INTRO_END); // the intro is REPLAYING from ip
    // If the superseded exit's gate resolution leaked a stale background leg, the scene
    // would settle near +1000 ms. It must still be on air deep into the second run.
    await run(clock, 1300); // +1500 into run 2 (its own outro is running: 700 → 1500)
    expect(onAir()).toBe(true);
    await run(clock, 900); // run 2 completes: outro → background → CLEARED (~2000)
    expect(onAir()).toBe(false);
    expect(opCount()).toBe(1); // run 1's outro was superseded before op; run 2's drove once
    r.remove();
  });

  it('PAUSE mid-auto-exit-outro freezes with the scene; resume finishes outro THEN background (D-105 parity)', async () => {
    const clock = makeClock();
    const r = createRuntime(
      scene([bgShape('bg'), lottie('lot')], {
        mode: 'auto-out',
        holdSource: 'timed',
        holdMs: 200,
      } as unknown as Playout),
      { skipFontLoad: true, installGlobals: false, lottieAssets, clock, tickerMeasure },
    );
    await r.play({});
    await run(clock, 1000); // outro at ~300/800 ms
    r.pause();
    const frozenAt = frames().length;
    await run(clock, 800); // would have completed the outro — must not move
    expect(frames().length).toBe(frozenAt);
    expect(onAir()).toBe(true);
    r.resume();
    await run(clock, 700); // remaining ~500 ms of the element outro
    expect(lastFrame()).toBe(OP);
    await run(clock, 700); // background outro
    expect(onAir()).toBe(false);
    expect(opCount()).toBe(1);
    expect(isMonotonic(outroSeq())).toBe(true);
    r.remove();
  });

  it('B-034 on the auto path: hidden Lotties (leaf AND under a hidden ancestor) are neither played nor awaited', async () => {
    const clock = makeClock();
    const r = createRuntime(
      scene(
        [bgShape('bg'), lottie('hid', { visible: false }), instance('inst', 'n', 'c1', false)],
        { mode: 'auto-out', holdSource: 'timed', holdMs: 200 } as unknown as Playout,
        [hiddenAncestorChild()],
      ),
      { skipFontLoad: true, installGlobals: false, lottieAssets, clock, tickerMeasure },
    );
    await r.play({});
    // Exit at 700 ms + background 500 ms ⇒ CLEARED by ~1200 ms. If either hidden outro
    // were awaited the settle would slip past 700 + 800 + 500 = 2000 ms — 1600 ms bites.
    await run(clock, 1600);
    expect(onAir()).toBe(false);
    for (let i = 0; i < handles.length; i += 1) {
      expect(outroFrames(i)).toHaveLength(0); // no hidden outro was ever DRIVEN
    }
    r.remove();
  });
  it('OPERATOR stop() during a LOOP-CYCLE boundary outro finalizes the cycle — no double-drive, no restart', async () => {
    // The adversarially-found race (verified by repro pre-fix): the boundary's gate and
    // stop() await the SAME ledger promise, and the boundary's continuation runs first.
    // With NO out-point the background leg is an EMPTY range (synchronous), so pre-fix
    // the boundary re-armed (onCycleRestart) before the cascade could force the last
    // cycle — and the cascaded stop() re-drove the whole element outro on air. stop()
    // now cascades markFinalCycle() BEFORE awaiting, so the in-flight boundary resolves
    // as the FINAL exit: one drive, no intro replay, clean settle.
    const noOutPointScene = {
      ...scene([bgShape('bg'), lottie('lot')], {
        mode: 'loop-cycle',
        holdSource: 'timed',
        holdMs: 100,
        repeat: 'infinite',
      } as unknown as Playout),
      lifecycle: undefined,
    } as unknown as Scene;
    const clock = makeClock();
    const r = createRuntime(noOutPointScene, {
      skipFontLoad: true,
      installGlobals: false,
      lottieAssets,
      clock,
      tickerMeasure,
    });
    await r.play({});
    // No out-point ⇒ intro spans the whole active range [0→50] = 1000 ms; hold 100 ms;
    // the boundary's element outro runs [1100 → 1900] with an EMPTY background leg.
    await run(clock, 1500); // boundary outro mid-flight
    expect(lastFrame() ?? 0).toBeGreaterThan(OUTRO_START);
    const stopP = r.stop(); // lands during the boundary outro — the exact race window
    await run(clock, 600); // outro completes (~1900)
    await run(clock, 400); // settle slack (empty background leg is instant)
    await stopP;
    expect(onAir()).toBe(false); // settled — the finalized boundary WAS the exit
    expect(opCount()).toBe(1); // driven exactly once — the pre-fix repro drove it twice
    expect(isMonotonic(outroSeq())).toBe(true); // never restarted from outroStart
    // …and no cycle restart happened after stop(): no fresh intro paint post-stop.
    const afterSettle = frames().length;
    await run(clock, 400);
    expect(frames()).toHaveLength(afterSettle); // halted, not looping again
    r.remove();
  });

  it('LOOP-CYCLE boundary exits OWN-scope furniture only; a nested Lottie persists and plays on the FINAL exit', async () => {
    // The adversarially-found asymmetry: pre-fix the boundary gate drove the whole
    // SUBTREE's outros but re-armed only its own scope — a nested comp's furniture
    // animated off at cycle 1's boundary and stayed blank (parked at `op`, ledger
    // spent) for every later cycle AND the final exit. Boundaries are now own-scope;
    // the final exit takes the subtree.
    const clock = makeClock();
    const r = createRuntime(
      scene(
        [bgShape('bg'), lottie('parentLot'), instance('inst', 'n', 'c1')],
        {
          mode: 'loop-cycle',
          holdSource: 'timed',
          holdMs: 100,
          repeat: 2,
        } as unknown as Playout,
        [
          // The nested comp just HOLDS (manual): its furniture must survive the
          // parent's cycle boundaries untouched.
          autoComp('c1', [lottie('inner')], { mode: 'manual' } as unknown as Playout),
        ],
      ),
      { skipFontLoad: true, installGlobals: false, lottieAssets, clock, tickerMeasure },
    );
    await r.play({});
    // Parent cycle 1: intro 500 + hold 100 + own outro 800 + background 500 = 1900 ms.
    await run(clock, 2100); // inside cycle 2
    const parentIdx = handles.findIndex((h) => h.frames.some((f) => f > OUTRO_START));
    expect(parentIdx).toBeGreaterThanOrEqual(0);
    const innerIdx = parentIdx === 0 ? 1 : 0;
    expect(opCount(parentIdx)).toBe(1); // the parent's own outro played at the boundary
    expect(outroFrames(innerIdx)).toHaveLength(0); // the NESTED furniture was untouched
    await run(clock, 300); // ~2400 ms: mid-cycle-2 hold window
    expect(lastFrame(innerIdx)).toBe(INTRO_END); // still holding, visible — not at op
    // Cycle 2 is the FINAL cycle: its exit takes the whole subtree off air.
    await run(clock, 1800); // cycle 2 completes (~3800)
    expect(onAir()).toBe(false);
    expect(opCount(parentIdx)).toBe(2); // own outro on both cycles
    expect(opCount(innerIdx)).toBe(1); // nested outro played ONCE — on the final exit
    r.remove();
  });
});
