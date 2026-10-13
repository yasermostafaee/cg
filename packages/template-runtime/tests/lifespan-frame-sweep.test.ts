import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Element, Scene } from '@cg/shared-schema';
import { createRuntime } from '../src/runtime.js';

/**
 * B-088 — the COLLAPSED INTRO. `PlayoutController.playRange` short-circuits a whole leg to
 * a single `applyFrame(outF)` when `hasAnimation` is false. Since B-029 made the per-element
 * `lifespan` gate frame-dependent, that collapse evaluates the gate EXACTLY ONCE, so a
 * start-trimmed element in a composition with no keyframes is either never shown (the held
 * frame sits outside its lifespan) or shown from the very first paint (the held frame sits
 * inside it) — never at its in-point.
 *
 * The fix sweeps a leg frame-by-frame when a gate boundary falls INSIDE it, while keeping the
 * collapse for a genuinely static leg. These tests pin both halves: the sweep AND the
 * preserved optimisation (asserted by rAF count, not just visibility).
 */

/** A clock with rAF; `rafCount` proves whether a `FrameDriver` ran at all. */
function makeClock() {
  let ms = 0;
  const rafs = new Map<number, (ts: number) => void>();
  const timers: { id: number; due: number; cb: () => void }[] = [];
  let nextId = 1;
  let rafCount = 0;
  return {
    now: (): number => ms,
    raf: (cb: (ts: number) => void): number => {
      rafCount += 1;
      const id = nextId++;
      rafs.set(id, cb);
      return id;
    },
    cancel: (h: number): void => {
      rafs.delete(h);
    },
    setTimeout: (cb: () => void, delay: number): unknown => {
      const id = nextId++;
      timers.push({ id, due: ms + delay, cb });
      return id;
    },
    clearTimeout: (h: unknown): void => {
      const i = timers.findIndex((t) => t.id === h);
      if (i >= 0) timers.splice(i, 1);
    },
    get rafCount(): number {
      return rafCount;
    },
    /** Walk in 20 ms steps = one frame at 50 fps, flushing rAF each step. */
    advance: (deltaMs: number): void => {
      let left = deltaMs;
      while (left > 0) {
        const step = Math.min(20, left);
        ms += step;
        left -= step;
        const due = timers.filter((t) => t.due <= ms).sort((a, b) => a.due - b.due);
        for (const t of due) {
          const i = timers.indexOf(t);
          if (i >= 0) timers.splice(i, 1);
          t.cb();
        }
        const round = [...rafs.entries()];
        for (const [id] of round) rafs.delete(id);
        for (const [, cb] of round) cb(ms);
      }
    },
  };
}

const baseTransform = {
  position: { x: 0, y: 0 },
  size: { w: 400, h: 100 },
  scale: { x: 1, y: 1 },
  rotation: 0,
  anchor: { x: 0, y: 0 },
};

/** A plain TEXT element — no keyframes, so it contributes nothing to `scope.animated`. */
function subtitle(lifespan?: { in: number; out: number }): Element {
  return {
    id: 'sub',
    name: 'subtitle',
    type: 'text',
    transform: baseTransform,
    opacity: 1,
    visible: true,
    locked: false,
    zIndex: 0,
    text: 'subtitle',
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
    fitMode: 'fixed',
    overflow: 'ellipsis',
    ...(lifespan !== undefined ? { lifespan } : {}),
  } as unknown as Element;
}

/** A KEYFRAMED shape — the control: its presence makes `hasAnimation` true the old way. */
function keyframedShape(): Element {
  return {
    id: 'bg',
    name: 'bg',
    type: 'shape',
    shape: 'rect',
    fill: { kind: 'solid', color: '#123456' },
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
            { frame: 70, value: 1, easing: 'linear' },
          ],
        },
      },
    },
  } as unknown as Element;
}

function scene(children: Element[], outPoint: number): Scene {
  return {
    schemaVersion: 1,
    id: 's',
    name: 's',
    templateType: 'custom',
    resolution: { width: 1920, height: 1080 },
    frameRate: 50, // 20 ms per frame
    safeAreas: { title: 10, action: 5 },
    frameRange: { in: 0, out: 100 },
    activeRange: { in: 0, out: 100 },
    lifecycle: { outPoint },
    editorBackdrop: 'transparent',
    layers: [
      { id: 'pl', name: 'main', visible: true, locked: false, blendMode: 'normal', children },
    ],
    fields: [],
    bindings: [],
    fonts: [],
    compositions: [],
    metadata: { createdAt: '2026-07-18T00:00:00.000Z', updatedAt: '2026-07-18T00:00:00.000Z' },
  } as unknown as Scene;
}

const sub = (): HTMLElement | null =>
  document.querySelector<HTMLElement>('[data-cg-element-id="sub"]');
const hidden = (): boolean => sub()?.style.display === 'none';

beforeEach(() => {
  document.body.innerHTML = '';
  document.body.className = '';
});
afterEach(() => {
  document.body.innerHTML = '';
  document.body.className = '';
});

describe('B-088 — a start-trimmed element is honoured during PLAY with no keyframes', () => {
  it('lifespan [33,60], no keyframes: hidden at frames 0/10, VISIBLE at 40', async () => {
    const clock = makeClock();
    const r = createRuntime(scene([subtitle({ in: 33, out: 60 })], 70), {
      skipFontLoad: true,
      installGlobals: false,
      clock,
    });
    await r.play({});
    expect(hidden()).toBe(true); // frame 0 — before the in-point
    clock.advance(200); // → frame 10, still before it
    expect(hidden()).toBe(true);
    clock.advance(600); // → frame 40, inside [33,60]
    expect(hidden()).toBe(false);
    r.remove();
  });

  it('lifespan [33,90], no keyframes: hidden at 0/10 then visible at 40 — NOT visible from zero', async () => {
    // The held frame (70) sits INSIDE [33,90], which is precisely the case the collapse got
    // wrong in the opposite direction: it revealed the element at the first paint.
    const clock = makeClock();
    const r = createRuntime(scene([subtitle({ in: 33, out: 90 })], 70), {
      skipFontLoad: true,
      installGlobals: false,
      clock,
    });
    await r.play({});
    expect(hidden()).toBe(true); // NOT visible from frame 0
    clock.advance(200); // → frame 10
    expect(hidden()).toBe(true);
    clock.advance(600); // → frame 40
    expect(hidden()).toBe(false);
    clock.advance(2000); // held at 70, still inside [33,90]
    expect(hidden()).toBe(false);
    r.remove();
  });

  it('CONTROL — the same scene WITH a keyframed shape still behaves correctly (no regression)', async () => {
    const clock = makeClock();
    const r = createRuntime(scene([keyframedShape(), subtitle({ in: 33, out: 60 })], 70), {
      skipFontLoad: true,
      installGlobals: false,
      clock,
    });
    await r.play({});
    expect(hidden()).toBe(true);
    clock.advance(200); // → frame 10
    expect(hidden()).toBe(true);
    clock.advance(600); // → frame 40
    expect(hidden()).toBe(false);
    r.remove();
  });
});

describe('B-088 — the static-case collapse is PRESERVED (the optimisation must not regress)', () => {
  it('no keyframes and NO lifespan at all: one paint, no FrameDriver (rAF never requested)', async () => {
    const clock = makeClock();
    const r = createRuntime(scene([subtitle()], 70), {
      skipFontLoad: true,
      installGlobals: false,
      clock,
    });
    await r.play({});
    // Nothing in the leg is frame-dependent ⇒ the leg collapses to a single applyFrame.
    // A FrameDriver would schedule rAF; none must be scheduled.
    expect(clock.rafCount).toBe(0);
    expect(hidden()).toBe(false);
    r.remove();
  });

  it('a lifespan that SPANS the whole leg still collapses (no boundary is crossed)', async () => {
    // [0,100] contains every frame of the intro leg [0,70], so the gate never changes value
    // inside it — sweeping would paint the same thing 70 times. Must still collapse.
    const clock = makeClock();
    const r = createRuntime(scene([subtitle({ in: 0, out: 100 })], 70), {
      skipFontLoad: true,
      installGlobals: false,
      clock,
    });
    await r.play({});
    expect(clock.rafCount).toBe(0);
    expect(hidden()).toBe(false);
    r.remove();
  });
});

describe('B-088 — the OUTRO leg is swept too', () => {
  it('a gate boundary inside the outro is honoured', async () => {
    // outPoint 40, active.out 100, lifespan [0,60]. The INTRO leg [0,40] crosses no boundary
    // (so it still collapses — visible throughout), but the OUTRO leg [40,100] crosses the
    // turn-OFF at 61, so it must be swept: visible through 60, hidden from 61.
    const clock = makeClock();
    const r = createRuntime(scene([subtitle({ in: 0, out: 60 })], 40), {
      skipFontLoad: true,
      installGlobals: false,
      clock,
    });
    await r.play({});
    expect(hidden()).toBe(false); // held at 40, inside [0,60]
    expect(clock.rafCount).toBe(0); // the intro leg genuinely collapsed

    await r.stop(); // plays the outro [40 → 100]
    expect(hidden()).toBe(false); // frame 40 — still inside the lifespan
    clock.advance(400); // → frame 60, the last frame inside
    expect(hidden()).toBe(false);
    clock.advance(20); // → frame 61, past lifespan.out
    expect(hidden()).toBe(true);
    r.remove();
  });
});
