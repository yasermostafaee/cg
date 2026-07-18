import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
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

vi.mock('@cg/lottie-bridge', () => ({
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
    background: 'transparent',
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
    background: 'transparent',
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

  it('BOUNDARY: a content-driven AUTO-exit plays the background outro WITHOUT the element outro', async () => {
    // Characterization of a real Phase-2 boundary, pinned so it cannot regress silently.
    // The element-outro seam lives in `out()` / `stop()` (design §D6.2). A composition that
    // ends its own content-driven hold exits through `PlayoutController.startOutro()`
    // instead, which never routes through the seam — so the Lottie is left on its hold
    // frame while the background closes. Extending the seam to the controller's auto-exit
    // is deliberately NOT in Phase 2 (it touches the B-030..B-034-hardened exit machinery
    // and was not in the signed-off design); tracked for Phase 3.
    const clock = makeClock();
    const r = createRuntime(
      scene([bgShape('bg'), lottie('lot', { drivesHold: true })], {
        mode: 'auto-out',
        holdSource: 'content-driven',
      } as unknown as Playout),
      { skipFontLoad: true, installGlobals: false, lottieAssets, clock, tickerMeasure },
    );
    await r.play({});
    await run(clock, 3000);
    expect(onAir()).toBe(false); // it DOES settle CLEARED — no strand, no hang
    expect(lastFrame()).toBe(INTRO_END); // …but parked on the hold frame
    expect(outroFrames()).toHaveLength(0); // …with the element outro NOT played
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
