import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as LottieBridge from '@cg/lottie-bridge';
import type { Element, Scene } from '@cg/shared-schema';

/**
 * D-135 — THE PLAYHEAD DRIVES THE CANVAS (the Lottie half), and the carve-out that
 * deliberately does not follow it.
 *
 * The Designer canvas is an iframe hosting this runtime, and the playhead reaches it as
 * exactly ONE message (`{ action: 'scrub', frame }` → `runtime.tick(frame)`). Timeline
 * PLAY is a STREAM of that same message — the transport advances the store's
 * `currentFrame` and nothing else, and the canvas never receives a `play` action at all.
 * So "scrub" and "play" are not two mechanisms to reconcile here: they are the same call,
 * and these tests assert that they cannot disagree rather than checking that they happen
 * to agree.
 *
 * The CARVE-OUT (ticker / sequence / clock) is asserted in its own describe below, on
 * BOTH halves: the canvas's ticks, and a PLAYING host receiving ticks.
 */

const { handles } = vi.hoisted(() => ({
  handles: [] as { frames: number[]; destroyed: boolean; el: HTMLElement }[],
}));

// Only the PLAYER is stubbed; the module's pure helpers (`lottieClipMeta` /
// `lottieTiming`) stay REAL so the wiring reads the same frame metadata as production.
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
      applyOverride() {
        return true;
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
  let rafQueue: ((ts: number) => void)[] = [];
  return {
    now: () => ms,
    raf: (cb: (ts: number) => void) => {
      rafQueue.push(cb);
      return rafQueue.length;
    },
    cancel: () => {
      rafQueue = [];
    },
    advance: (delta: number) => {
      ms += delta;
      const cbs = rafQueue;
      rafQueue = [];
      for (const cb of cbs) cb(ms);
    },
  };
}

const baseTransform = {
  position: { x: 0, y: 0 },
  size: { w: 400, h: 200 },
  scale: { x: 1, y: 1 },
  rotation: 0,
  anchor: { x: 0, y: 0 },
};

/**
 * The numbers are chosen so every expected frame below is exact, never rounded:
 * composition 25 fps (1 frame = 40 ms) against a clip at `fr` 50 × `speed` 1 (1 clip
 * frame = 20 ms) ⇒ **2 clip frames per composition frame**. With `introEnd` 40 the intro
 * runs composition frames [0, 20); with `outroStart` 60 and `op` 100 the outro runs 40
 * clip frames = 20 composition frames from the out-point.
 */
const CLIP = { ip: 0, op: 100, fr: 50, w: 400, h: 200, layers: [] };
const lottieAssets = { a: CLIP };

function lottieElement(over: Record<string, unknown> = {}): Element {
  return {
    id: 'lot',
    name: 'furniture',
    type: 'lottie',
    transform: baseTransform,
    opacity: 1,
    visible: true,
    locked: false,
    zIndex: 0,
    assetId: 'a',
    speed: 1,
    loopMode: 'none',
    holdBehavior: 'freeze',
    phases: { introEnd: 40, outroStart: 60, source: 'markers' },
    ...over,
  } as unknown as Element;
}

/** An infinite crawl — a content driver on its OWN clock, never the playhead's. */
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

/** A wall clock — a time-driven element with no frame N to show. */
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

/** A 2-item sequence — stepped by dwell on its own clock, never by the playhead. */
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
    defaultDwellMs: 300,
    advance: 'auto',
    transitionIn: 'bottom',
    transitionOut: 'top',
    transitionTiming: 'simultaneous',
    transitionMs: 100,
    repeat: 'infinite',
  } as unknown as Element;
}

function scene(children: Element[], over: Record<string, unknown> = {}): Scene {
  return {
    schemaVersion: 1,
    id: 'scene-playhead',
    name: 'playhead',
    templateType: 'custom',
    resolution: { width: 1920, height: 1080 },
    frameRate: 25,
    safeAreas: { title: 10, action: 5 },
    frameRange: { in: 0, out: 100 },
    editorBackdrop: 'transparent',
    layers: [
      {
        id: 'L1',
        name: 'layer',
        visible: true,
        locked: false,
        blendMode: 'normal',
        children,
      },
    ],
    fields: [],
    bindings: [],
    fonts: [],
    metadata: { createdAt: '2026-08-12T00:00:00.000Z', updatedAt: '2026-08-12T00:00:00.000Z' },
    ...over,
  } as unknown as Scene;
}

/** The frames this run has painted on the (single) mounted Lottie player. */
const painted = (): number[] => handles[0]?.frames ?? [];
const lastFrame = (): number | undefined => painted().at(-1);
/** The crawl track carries NO transform until the ticker's first `step()`. */
const tickerTransform = (): string =>
  document.querySelector<HTMLElement>('.cg-ticker-track')?.style.transform ?? '';
const elText = (id: string): string =>
  document.querySelector<HTMLElement>(`[data-cg-element-id="${id}"]`)?.textContent ?? '';
const elDisplay = (id: string): string =>
  document.querySelector<HTMLElement>(`[data-cg-element-id="${id}"]`)?.style.display ?? 'MISSING';

beforeEach(() => {
  document.body.innerHTML = '';
  document.body.className = '';
  handles.length = 0;
});

describe('D-135 — the playhead positions every Lottie on the canvas', () => {
  it('SCRUB positions the clip at the frame its phase mapping assigns to the playhead', () => {
    const runtime = createRuntime(scene([lottieElement()]), {
      skipFontLoad: true,
      installGlobals: false,
      lottieAssets,
    });
    // Before any tick the canvas shows the D-125 poster (the marked hold frame) — a
    // PRE-TICK transient now, not a resting state: the first tick owns the frame.
    expect(lastFrame()).toBe(40);

    // AT the in-point the mapping wins like everywhere else: `ip`.
    runtime.tick(0);
    expect(lastFrame()).toBe(0);

    // 2 clip frames per composition frame (25 fps against fr 50 × speed 1).
    runtime.tick(5);
    expect(lastFrame()).toBe(10);
    runtime.tick(19);
    expect(lastFrame()).toBe(38);
    // Past the intro the clip HOLDS on `introEnd` — the driver's own phase mapping,
    // not a second one written for the canvas.
    runtime.tick(20);
    expect(lastFrame()).toBe(40);
    runtime.tick(50);
    expect(lastFrame()).toBe(40);
  });

  it('PLAY animates it — and lands on exactly the frame a single scrub to that frame gives', () => {
    // The canvas has no `play()` path: the transport advances the store frame and the
    // canvas posts one scrub per change, so PLAY is this stream. Motion is the point —
    // assert the successive frames, not just the endpoint.
    const runtime = createRuntime(scene([lottieElement()]), {
      skipFontLoad: true,
      installGlobals: false,
      lottieAssets,
    });
    const before = painted().length;
    for (let f = 0; f <= 10; f += 1) runtime.tick(f);
    expect(painted().slice(before)).toEqual([0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20]);
    // The SAME frame reached by a single scrub — no accumulated state, no drift between
    // the two halves of the acceptance, because there is only one call to disagree with.
    handles.length = 0;
    document.body.innerHTML = '';
    const scrubbed = createRuntime(scene([lottieElement()]), {
      skipFontLoad: true,
      installGlobals: false,
      lottieAssets,
    });
    scrubbed.tick(10);
    expect(lastFrame()).toBe(20);
  });

  it('the OUT phase maps from the out-point, at the clip’s own rate (never rescaled)', () => {
    const runtime = createRuntime(scene([lottieElement()], { lifecycle: { outPoint: 60 } }), {
      skipFontLoad: true,
      installGlobals: false,
      lottieAssets,
    });
    // Before the out-point: still the held intro end.
    runtime.tick(59);
    expect(lastFrame()).toBe(40);
    // At and past it: `[outroStart → op]`, advancing at the authored `fr × speed` —
    // the element owns its own outro timing (§D1.1), so this is NOT stretched to fit
    // `[outPoint, active.out]`.
    runtime.tick(60);
    expect(lastFrame()).toBe(60);
    runtime.tick(70);
    expect(lastFrame()).toBe(80);
    // Clamped at `op`: overshooting would ask lottie-web for a frame that does not exist.
    runtime.tick(80);
    expect(lastFrame()).toBe(100);
    runtime.tick(95);
    expect(lastFrame()).toBe(100);
  });

  it('a Lottie that is NOT a hold driver follows the playhead exactly as an opted-in one does', () => {
    // §9.4 (a) — `drivesHold` answers "does this gate the HOLD", not "does the canvas
    // show this element's frame". Conflating them is what would leave a logo animation
    // frozen while the composition plays, which is the misrepresentation D-135 removes.
    for (const drivesHold of [false, true]) {
      handles.length = 0;
      document.body.innerHTML = '';
      const runtime = createRuntime(scene([lottieElement({ drivesHold })]), {
        skipFontLoad: true,
        installGlobals: false,
        lottieAssets,
      });
      runtime.tick(7);
      expect(lastFrame()).toBe(14);
    }
  });

  it('outside its lifespan the resting state is unchanged — under scrub and under the play stream', () => {
    const runtime = createRuntime(scene([lottieElement({ lifespan: { in: 10, out: 20 } })]), {
      skipFontLoad: true,
      installGlobals: false,
      lottieAssets,
    });
    // A single scrub outside the span: the element rests hidden, exactly as today.
    runtime.tick(30);
    expect(elDisplay('lot')).toBe('none');
    // The play stream reaches the same resting state, not a different one.
    for (let f = 21; f <= 30; f += 1) runtime.tick(f);
    expect(elDisplay('lot')).toBe('none');

    // INSIDE the span the clip is positioned from the composition's ACTIVE IN, not from
    // the trim: on air `play()` starts every Lottie regardless of a start-trimmed
    // lifespan, and the canvas must agree with what goes on air.
    runtime.tick(15);
    expect(elDisplay('lot')).not.toBe('none');
    expect(lastFrame()).toBe(30);
  });

  it('🔴 THE IN-POINT IS NOT SPECIAL — it maps like every other frame, never to the poster', () => {
    // The defect this pins: the in-point was the ONE frame that showed the D-125 poster
    // instead of its mapped frame, and it did so DETERMINISTICALLY (an explicit branch,
    // not a race — which is why scrubbing away and back never healed it).
    //
    // The fixture is MARKER-LESS on purpose, so `posterFrame` is the clip MIDPOINT (50)
    // and can never coincide with `ip` (0). With `phases` present the two can collide and
    // the assertion passes vacuously — which is exactly how the boundary went unnoticed.
    const runtime = createRuntime(scene([lottieElement({ phases: undefined })]), {
      skipFontLoad: true,
      installGlobals: false,
      lottieAssets,
    });
    expect(handles[0]?.frames.at(-1)).toBe(50); // the pre-tick poster, so the test can tell them apart

    runtime.tick(0); // THE BOUNDARY — `ip`, not the poster
    expect(lastFrame()).toBe(0);
    runtime.tick(1); // the CONTROL: this frame was always correct
    expect(lastFrame()).toBe(2);
    runtime.tick(50); // scrub away…
    expect(lastFrame()).toBe(100);
    runtime.tick(0); // …and back: still mapped, because it never depended on history
    expect(lastFrame()).toBe(0);
  });

  it('the in-point is the ACTIVE in-point, not frame 0, and before it the clip clamps to `ip`', () => {
    const runtime = createRuntime(
      scene([lottieElement({ phases: undefined })], { activeRange: { in: 10, out: 90 } }),
      { skipFontLoad: true, installGlobals: false, lottieAssets },
    );
    runtime.tick(10); // the in-point maps to `ip`
    expect(lastFrame()).toBe(0);
    runtime.tick(0); // BEFORE it: clamped to the clip start, still never the poster
    expect(lastFrame()).toBe(0);
    runtime.tick(15); // 5 composition frames in = 10 clip frames
    expect(lastFrame()).toBe(10);
  });
  it('🔴 a DEGENERATE outro holds its settled frame past the out-point — it does not vanish', () => {
    // The defect: `outroStart` defaults to `op` for a clip with no outro marker, so every
    // frame at or past the composition's out-point asked for the OUT phase of a clip that
    // HAS no out phase. The mapping clamped to `op` — the frame a furniture clip has
    // animated OFF to — and the element disappeared from the canvas from the out-point on.
    //
    // The fixture is deliberately NOT marker-less: `introEnd` (40) must differ from BOTH
    // `op` (100) and `ip` (0), or the assertion cannot tell the settled frame from the
    // blank one and passes vacuously. `outroStart: 100 === op` is what makes it degenerate.
    const runtime = createRuntime(
      scene([lottieElement({ phases: { introEnd: 40, outroStart: 100, source: 'markers' } })], {
        lifecycle: { outPoint: 60 },
      }),
      { skipFontLoad: true, installGlobals: false, lottieAssets },
    );
    for (const frame of [60, 70, 100]) {
      runtime.tick(frame);
      expect(lastFrame()).toBe(40);
    }
    // `op` must not appear ONCE across the whole sweep — a single frame of it is the bug.
    expect(painted()).not.toContain(100);
  });

  it('a clip that HAS an outro still maps the OUT phase — the guard is not a blanket opt-out', () => {
    // The control. Without it the cheapest wrong fix — never use the outro mapping —
    // passes the test above and silently deletes the OUT phase for every marked clip.
    const runtime = createRuntime(
      scene([lottieElement({ phases: { introEnd: 40, outroStart: 60, source: 'markers' } })], {
        lifecycle: { outPoint: 60 },
      }),
      { skipFontLoad: true, installGlobals: false, lottieAssets },
    );
    runtime.tick(59); // before the out-point: the held intro end
    expect(lastFrame()).toBe(40);
    runtime.tick(70); // 10 composition frames past it = 20 clip frames into the outro
    expect(lastFrame()).toBe(80);
  });

  it('an idle-loop hold with a degenerate outro keeps cycling past the out-point', () => {
    // Matching air: an idle-loop clip never settles, so the composition's out-point is not
    // a boundary for it either.
    const runtime = createRuntime(
      scene(
        [
          lottieElement({
            // `idle` lives INSIDE `phases` — the runtime reads `phases?.idle?.[0]`. As a
            // sibling it is silently ignored and `idleOut` falls back to `outroStart`.
            phases: { introEnd: 40, outroStart: 100, idle: [40, 60], source: 'markers' },
            holdBehavior: 'idle-loop',
          }),
        ],
        { lifecycle: { outPoint: 60 } },
      ),
      { skipFontLoad: true, installGlobals: false, lottieAssets },
    );
    // advanced = 2 × frame; idleFrames = advanced − (introEnd − ip); wrapped into [40, 60).
    runtime.tick(60);
    expect(lastFrame()).toBe(40);
    runtime.tick(65);
    expect(lastFrame()).toBe(50);
    runtime.tick(70);
    expect(lastFrame()).toBe(40);
    expect(painted()).not.toContain(100);
  });

  it('⚠ a MARKER-LESS clip settles on `op` — the canvas agrees with air, and both are blank', () => {
    // The limit of the fix above, pinned so nobody reads it as broken and "fixes" it into
    // disagreeing with air. With NO `phases` the runtime resolves `introEnd = op`, so the
    // settled frame IS the clip's last frame. The canvas now shows exactly what the driver
    // holds on air — which for a furniture clip that animates OFF at its end is blank.
    //
    // That a marker-less clip ends blank AT ALL is a real product finding (design §4.4),
    // and it is NOT a canvas defect: it is what the shipped hold does on every surface.
    const runtime = createRuntime(
      scene([lottieElement({ phases: undefined })], { lifecycle: { outPoint: 60 } }),
      { skipFontLoad: true, installGlobals: false, lottieAssets },
    );
    runtime.tick(70);
    expect(lastFrame()).toBe(100); // === op === introEnd for a marker-less clip
    // …and the frames BEFORE the clip runs out are its real content, not the blank end.
    runtime.tick(10);
    expect(lastFrame()).toBe(20);
  });

  it('a LIVE driver owns the frame — a tick reaching a PLAYING host never fights it', async () => {
    // The canvas never sends `play`, but the SAME host page serves the Preview, which
    // does. A stray tick there must not yank a clip out from under its own driver.
    const clock = makeClock();
    const runtime = createRuntime(scene([lottieElement()]), {
      skipFontLoad: true,
      installGlobals: false,
      lottieAssets,
      clock,
    });
    await runtime.ready;
    await runtime.play({});
    clock.advance(200); // 200ms at fr 50 → clip frame 10
    expect(lastFrame()).toBe(10);
    const count = painted().length;
    runtime.tick(0);
    runtime.tick(90);
    expect(painted()).toHaveLength(count);
    expect(lastFrame()).toBe(10);
  });
});

describe('D-135 — the carve-out: ticker, sequence and clock do NOT follow the playhead', () => {
  it('a ticker ignores the playhead under scrub, and under the canvas’s play stream', () => {
    const runtime = createRuntime(scene([lottieElement(), infiniteTicker('sub')]), {
      skipFontLoad: true,
      installGlobals: false,
      lottieAssets,
    });
    const before = tickerTransform();
    runtime.tick(12); // a scrub
    expect(tickerTransform()).toBe(before);
    for (let f = 0; f <= 40; f += 1) runtime.tick(f); // the play stream
    expect(tickerTransform()).toBe(before);
    // ...while the Lottie DID follow it, so this is not a test that nothing happened.
    expect(lastFrame()).toBe(40);
  });

  it('a PLAYING ticker keeps running on real time and is untouched by the playhead', async () => {
    const clock = makeClock();
    const runtime = createRuntime(
      scene([lottieElement(), infiniteTicker('sub')], {
        lifecycle: { outPoint: 90 },
        playout: { mode: 'manual', holdSource: 'content-driven' },
      }),
      { skipFontLoad: true, installGlobals: false, lottieAssets, clock },
    );
    await runtime.ready;
    await runtime.play({});
    // The Lottie's marked intro is 40 clip frames at fr 50 = 800ms, which is this
    // scope's entrance settle; the ticker starts at that hold entry.
    clock.advance(900);
    clock.advance(100);
    const crawling = tickerTransform();
    expect(crawling).not.toBe('');

    // Ticks arrive (the canvas half of the same host page). The crawl is a function of
    // REAL time, so they must neither advance it nor reset it.
    runtime.tick(0);
    runtime.tick(45);
    runtime.tick(90);
    expect(tickerTransform()).toBe(crawling);

    // The observable is LIVE: the clock still moves it. Without this the assertion
    // above would pass just as well on a ticker that had stopped.
    clock.advance(200);
    expect(tickerTransform()).not.toBe(crawling);
  });

  it('a sequence and a clock are unaffected by either half', async () => {
    const clock = makeClock();
    const runtime = createRuntime(
      scene([lottieElement(), twoItemSequence('seq'), wallClock('clk')], {
        lifecycle: { outPoint: 90 },
        playout: { mode: 'manual' },
      }),
      { skipFontLoad: true, installGlobals: false, lottieAssets, clock },
    );
    await runtime.ready;
    const seqBefore = elText('seq');
    const clkBefore = elText('clk');
    // Scrub, then the play stream — neither steps the sequence nor moves the clock.
    runtime.tick(30);
    for (let f = 0; f <= 60; f += 1) runtime.tick(f);
    expect(elText('seq')).toBe(seqBefore);
    expect(elText('clk')).toBe(clkBefore);

    // And on a PLAYING host, ticks leave them where their own clocks put them.
    await runtime.play({});
    clock.advance(1000);
    const seqPlaying = elText('seq');
    const clkPlaying = elText('clk');
    runtime.tick(5);
    runtime.tick(88);
    expect(elText('seq')).toBe(seqPlaying);
    expect(elText('clk')).toBe(clkPlaying);
  });
});
