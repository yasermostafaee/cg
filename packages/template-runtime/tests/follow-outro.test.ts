import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import type * as LottieBridge from '@cg/lottie-bridge';
import type { Element, Scene } from '@cg/shared-schema';

/**
 * Session V — the owner's defect: a FOLLOW-source video plays its intro, freezes at
 * `H`, and past the composition's out point NEVER plays its outro — on the canvas and
 * in the preview alike — while the SAME scene with manual phase marks plays intro AND
 * outro correctly.
 *
 * The fixtures here use the REAL attach seeds (`state/follow-attach.ts` writes
 * `outroStart: durationMs` as the claim-least stored decoy), not arbitrary decoy
 * numbers: under follow the stored phases are IGNORED by contract, so any code path
 * that still reads them must be caught by a fixture whose stored values are exactly
 * what the product writes.
 *
 * Owner's recipe: out point WITH ROOM AFTER IT (out at 72 of 150 @ 50 fps ⇒ the OUT
 * segment is 1.56 s), content start 25 (entrance 0.5 s), 5 s clip.
 * holdAt 3000 ⇒ window [2500 → 3000] / H 3000 / [3000 → 4560].
 * holdAt absent ⇒ H = entrance span 500 ⇒ [0 → 500] / 500 / [500 → 2060].
 */

const { handles } = vi.hoisted(() => ({
  handles: [] as { frames: number[]; destroyed: boolean; el: HTMLElement }[],
}));

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

const baseTransform = {
  position: { x: 0, y: 0 },
  size: { w: 400, h: 200 },
  scale: { x: 1, y: 1 },
  rotation: 0,
  anchor: { x: 0, y: 0 },
};

const DURATION_MS = 5000;

/** The product's own attach seeds: stored decoys under follow are `outroStart: durationMs`. */
function followVideo(id: string, o: { holdAt?: number; storedOutroStart?: number } = {}): Element {
  return {
    id,
    name: id,
    type: 'video',
    transform: baseTransform,
    opacity: 1,
    visible: true,
    locked: false,
    zIndex: 0,
    assetId: `asset-${id}`,
    durationMs: DURATION_MS,
    holdBehavior: 'loop',
    phases: {
      introEnd: 2500,
      outroStart: o.storedOutroStart ?? DURATION_MS,
      source: 'composition',
      ...(o.holdAt !== undefined ? { holdAt: o.holdAt } : {}),
    },
  } as unknown as Element;
}

/** The manual-phase CONTROL on the same clip — the configuration the owner proved works. */
function manualVideo(id: string): Element {
  return {
    id,
    name: id,
    type: 'video',
    transform: baseTransform,
    opacity: 1,
    visible: true,
    locked: false,
    zIndex: 0,
    assetId: `asset-${id}`,
    durationMs: DURATION_MS,
    holdBehavior: 'freeze',
    phases: { introEnd: 3000, outroStart: 3000, source: 'manual' },
  } as unknown as Element;
}

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
            { frame: 50, value: 1, easing: 'linear' },
          ],
        },
      },
    },
  } as unknown as Element;
}

/** Owner's composition: out at 72 of 150 @ 50 fps — the OUT segment is 1.56 s of room. */
function scene(children: Element[], over: Record<string, unknown> = {}): Scene {
  return {
    schemaVersion: 1,
    id: 's-follow-outro',
    name: 'follow-outro',
    templateType: 'custom',
    resolution: { width: 400, height: 200 },
    frameRate: 50,
    safeAreas: { title: 10, action: 5 },
    frameRange: { in: 0, out: 150 },
    activeRange: { in: 0, out: 150 },
    lifecycle: { outPoint: 72, contentStart: 25 },
    editorBackdrop: 'transparent',
    layers: [
      { id: 'pl', name: 'main', visible: true, locked: false, blendMode: 'normal', children },
    ],
    fields: [],
    bindings: [],
    fonts: [],
    metadata: { createdAt: '2026-08-13T00:00:00.000Z', updatedAt: '2026-08-13T00:00:00.000Z' },
    ...over,
  } as unknown as Scene;
}

const onAir = (): boolean => !document.body.classList.contains('cg-pending');
const tickerMeasure = (node: HTMLElement): number => (node.textContent?.length ?? 0) * 10;

/**
 * A LINEAR-playback media model against the injected clock (the same shape as
 * video-driver.test.ts's mockVideo, applied at the DOM node): unlike the plain
 * backing store the short-phase lifecycle tests use, this one ADVANCES while
 * playing — the owner's windows here are seconds long, and a non-advancing head
 * would trip the signed drift policy into re-basing the clock forever (an intro
 * longer than the resume grace would never complete, in ANY configuration).
 */
function spyVideoTimes(clock: { now: () => number }): Map<string, () => number> {
  const getters = new Map<string, () => number>();
  document.querySelectorAll<HTMLVideoElement>('video[data-cg-element-id]').forEach((v) => {
    let pos = 0;
    let playing = false;
    let anchor = 0;
    const at = (): number => (playing ? pos + (clock.now() - anchor) / 1000 : pos);
    Object.defineProperty(v, 'currentTime', {
      get: at,
      set: (x: number) => {
        pos = x;
        anchor = clock.now();
      },
      configurable: true,
    });
    Object.defineProperty(v, 'play', {
      value: () => {
        pos = at();
        anchor = clock.now();
        playing = true;
        return Promise.resolve();
      },
      configurable: true,
    });
    Object.defineProperty(v, 'pause', {
      value: () => {
        pos = at();
        playing = false;
      },
      configurable: true,
    });
    getters.set(v.dataset['cgElementId']!, at);
  });
  return getters;
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

describe('session V — a FOLLOW video plays its OUTRO on exit (the preview path)', () => {
  it('holdAt set: out() advances the clip from H toward H + outSpan, then clears', async () => {
    const clock = makeClock();
    const r = createRuntime(scene([bgShape('bg'), followVideo('v', { holdAt: 3000 })]), {
      skipFontLoad: true,
      installGlobals: false,
      clock,
      tickerMeasure,
    });
    const times = spyVideoTimes(clock);
    await r.play({});
    await run(clock, 900); // intro [2500 → 3000] is 500 ms; settle the freeze at H
    expect(times.get('v')!()).toBeCloseTo(3.0, 2); // parked at H — the intro half WORKS

    const outP = r.out();
    await run(clock, 400); // mid-outro (outro span is 1560 ms)
    // The background exit must be WAITING on the video's element outro.
    expect(onAir()).toBe(true);

    await run(clock, 1400); // outro completes
    await outP;
    await run(clock, 2000); // the background OUT segment [72 → 150] is 1.56 s
    // The decisive assertion: the clip ADVANCED from H through the derived outro
    // window and the final paint clamps to its end — never a freeze at H forever.
    expect(times.get('v')!()).toBeCloseTo(4.56, 2); // H + outSpan = 3000 + 1560
    expect(onAir()).toBe(false);
    r.remove();
  });

  it('holdAt absent: the outro continues from H = entrance span', async () => {
    const clock = makeClock();
    const r = createRuntime(scene([bgShape('bg'), followVideo('v')]), {
      skipFontLoad: true,
      installGlobals: false,
      clock,
      tickerMeasure,
    });
    const times = spyVideoTimes(clock);
    await r.play({});
    await run(clock, 900); // intro [0 → 500], then freeze at H = 500
    expect(times.get('v')!()).toBeCloseTo(0.5, 2);

    const outP = r.out();
    await run(clock, 1800); // outro [500 → 2060] completes
    await outP;
    await run(clock, 1000);
    expect(times.get('v')!()).toBeCloseTo(2.06, 2);
    r.remove();
  });

  it('CONTROL — the manual-phase configuration of the same clip plays its outro', async () => {
    const clock = makeClock();
    const r = createRuntime(scene([bgShape('bg'), manualVideo('v')]), {
      skipFontLoad: true,
      installGlobals: false,
      clock,
      tickerMeasure,
    });
    const times = spyVideoTimes(clock);
    await r.play({});
    await run(clock, 3400); // intro [0 → 3000], freeze at 3.0
    expect(times.get('v')!()).toBeCloseTo(3.0, 2);

    const outP = r.out();
    await run(clock, 2400); // outro [3000 → 5000] completes
    await outP;
    await run(clock, 1000);
    expect(times.get('v')!()).toBeCloseTo(5.0, 2);
    r.remove();
  });
});

describe('session V — a FOLLOW video maps the OUTRO window under the playhead (the canvas path)', () => {
  it('holdAt set: ticks past the out point advance through (H, H + outSpan]', () => {
    const r = createRuntime(scene([followVideo('v', { holdAt: 3000 })]), {
      skipFontLoad: true,
      installGlobals: false,
    });
    const times = spyVideoTimes({ now: () => 0 });
    r.tick(72); // the out point — the outro's own start is H
    expect(times.get('v')!()).toBeCloseTo(3.0, 2);
    r.tick(80); // 160 ms into the OUT
    expect(times.get('v')!()).toBeCloseTo(3.16, 2);
    r.tick(150); // the active end — the outro window's end
    expect(times.get('v')!()).toBeCloseTo(4.56, 2);
    r.remove();
  });

  it('holdAt absent: the same, from H = entrance span', () => {
    const r = createRuntime(scene([followVideo('v')]), {
      skipFontLoad: true,
      installGlobals: false,
    });
    const times = spyVideoTimes({ now: () => 0 });
    r.tick(80);
    expect(times.get('v')!()).toBeCloseTo(0.66, 2); // 500 + 160
    r.remove();
  });
});

/** The lottie mirror: 1 s clip at fr 100 (10 ms/frame); follow with holdAt frame 60 ⇒ H 600 ms. */
const lottieAssets = { a: { ip: 0, op: 100, fr: 100, w: 400, h: 200, layers: [] } };
function followLottie(id: string): Element {
  return {
    id,
    name: id,
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
    // The product's attach decoys (outroStart = op) + an authored holdAt, both clip frames.
    phases: { introEnd: 50, outroStart: 100, source: 'composition', holdAt: 60 },
  } as unknown as Element;
}

describe('session V — the LOTTIE mirror: the same wiring plays the follow outro on exit', () => {
  it('out() drives the clip frames from the hold frame through the derived outro window', async () => {
    const clock = makeClock();
    const r = createRuntime(scene([bgShape('bg'), followLottie('lot')]), {
      skipFontLoad: true,
      installGlobals: false,
      clock,
      tickerMeasure,
      lottieAssets,
    });
    await r.play({});
    await run(clock, 900); // intro [100 → 600] ms settles the freeze at frame 60 (H)
    const held = handles[0]!.frames.at(-1);
    expect(held).toBe(60);

    const outP = r.out();
    // Derived outro: outSpan 1.56 s ⇒ outroEnd clamps at the 1 s clip end ⇒ frames [60 → 100].
    await run(clock, 600);
    await outP;
    await run(clock, 2000);
    expect(handles[0]!.frames.at(-1)).toBe(100); // advanced THROUGH the window, not frozen at 60
    expect(onAir()).toBe(false);
    r.remove();
  });
});

describe('session V — the FOUND SEAM, pinned: outPoint at the active end ⇒ NO OUT segment ⇒ no outro', () => {
  // The owner's scene shape, reconstructed by instrumentation: "out at 72 of 150" where the
  // 150 is the RULER (frameRange) and the ACTIVE range ends at 72 — reachable by ordinary
  // authoring (shrink-then-regrow pins active.out; the out-marker drag clamps at it). The
  // derived outSpan is 0, so the follow window has NO outro: outroEndMs === holdMs. This is
  // the STANDING RULE (the OUT on air plays [outPoint → active.out]; zero room, zero outro),
  // pinned here so it can never silently change shape — the operator-facing fix is the
  // `noOutSegment` clamp flag + Inspector hint, and the store now re-clamps so the range
  // cannot STRAND (store-scene-active-region.test.ts). If the outro should instead follow
  // the ROOM AFTER the out point on the ruler, that is a RULE change — the owner's call.
  const sceneC = (children: Element[]): Scene =>
    scene(children, {
      activeRange: { in: 0, out: 72 },
      lifecycle: { outPoint: 72, contentStart: 25 },
    });

  it('canvas: ticks past the out point hold H — the degenerate outro takes the intro mapping', () => {
    const r = createRuntime(sceneC([followVideo('v', { holdAt: 3000 })]), {
      skipFontLoad: true,
      installGlobals: false,
    });
    const times = spyVideoTimes({ now: () => 0 });
    r.tick(72);
    expect(times.get('v')!()).toBeCloseTo(3.0, 2);
    r.tick(100); // the ruler's room after the out point — INERT on air, so the held look stands
    expect(times.get('v')!()).toBeCloseTo(3.0, 2);
    r.tick(150);
    expect(times.get('v')!()).toBeCloseTo(3.0, 2);
    r.remove();
  });

  it('preview: the exit completes WITHOUT a video outro — held look through the fade, never a wedge', async () => {
    const clock = makeClock();
    const r = createRuntime(sceneC([bgShape('bg'), followVideo('v', { holdAt: 3000 })]), {
      skipFontLoad: true,
      installGlobals: false,
      clock,
      tickerMeasure,
    });
    const times = spyVideoTimes(clock);
    await r.play({});
    await run(clock, 900);
    expect(times.get('v')!()).toBeCloseTo(3.0, 2); // parked at H

    const outP = r.out();
    await run(clock, 1000); // content fade (400 ms) + the ZERO-length background OUT
    await outP;
    await run(clock, 500);
    expect(times.get('v')!()).toBeCloseTo(3.0, 2); // no outro was played — by rule, not by loss
    expect(onAir()).toBe(false); // and the exit is clean: nothing waited on a phantom outro
    r.remove();
  });

  it('lottie: the same zero-OUT-segment rule through the same window', () => {
    const r = createRuntime(sceneC([followLottie('lot')]), {
      skipFontLoad: true,
      installGlobals: false,
      lottieAssets,
    });
    r.tick(100); // past the out point on the ruler
    expect(handles[0]!.frames.at(-1)).toBe(60); // held at H's frame — no outro window exists
    r.remove();
  });
});
