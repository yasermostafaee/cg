import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Element, Scene } from '@cg/shared-schema';
import { createRuntime } from '../src/runtime.js';

/**
 * D-105 — split exit. `out()` fades the CONTENT (ticker / clock / sequence) off
 * FIRST, then plays the BACKGROUND outro (the keyframed `[outPoint → out]`), so the
 * background never closes over fully-visible content; `stop()` removes the content
 * IMMEDIATELY, then plays the background outro. Both settle into the cleared state.
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

async function run(
  clock: ReturnType<typeof makeClock>,
  totalMs: number,
  step = 100,
): Promise<void> {
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

/** A keyframed BACKGROUND shape: opacity 0→1 across frames [0, 40] (value = f/40). */
function bgShape(id: string): Element {
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
            { frame: 40, value: 1, easing: 'linear' },
          ],
        },
      },
    },
  } as unknown as Element;
}

/** A crawling ticker = CONTENT (marked `data-cg-content`). */
function ticker(id: string): Element {
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

/** Root scene: a keyframed background (`bg`) with an outro + a content ticker (`crawl`). */
function scene(): Scene {
  return {
    schemaVersion: 1,
    id: 'exit',
    name: 'exit',
    templateType: 'custom',
    resolution: { width: 400, height: 120 },
    frameRate: 50,
    safeAreas: { title: 10, action: 5 },
    frameRange: { in: 0, out: 40 },
    lifecycle: { outPoint: 20 }, // intro [0→20], hold @20, outro [20→40]
    background: 'transparent',
    layers: [
      {
        id: 'l',
        name: 'main',
        visible: true,
        locked: false,
        blendMode: 'normal',
        children: [bgShape('bg'), ticker('crawl')],
      },
    ],
    fields: [],
    bindings: [],
    fonts: [],
    metadata: { createdAt: '2026-06-27T00:00:00.000Z', updatedAt: '2026-06-27T00:00:00.000Z' },
  } as unknown as Scene;
}

const onAir = (): boolean => !document.body.classList.contains('cg-pending');
const content = (): HTMLElement | null => document.querySelector<HTMLElement>('[data-cg-content]');
const bgOpacity = (): number =>
  parseFloat(
    document.querySelector<HTMLElement>('[data-cg-element-id="bg"]')?.style.opacity ?? 'NaN',
  );

beforeEach(() => {
  document.body.innerHTML = '';
  document.body.className = '';
});
afterEach(() => {
  document.body.innerHTML = '';
  document.body.className = '';
});

describe('D-105 — split exit (out vs stop)', () => {
  it('out() fades the content off FIRST, then plays the background outro, then settles cleared', async () => {
    const clock = makeClock();
    const r = createRuntime(scene(), { skipFontLoad: true, clock, tickerMeasure });
    await r.play({});
    await run(clock, 1000); // intro → hold @ frame 20 (bg opacity 0.5), content crawling
    expect(onAir()).toBe(true);
    expect(content()?.style.opacity).not.toBe('0');
    const bgAtHold = bgOpacity();
    expect(bgAtHold).toBeCloseTo(0.5, 1);

    const outP = r.out();
    // content starts fading IMMEDIATELY (a CSS opacity transition to 0)…
    expect(content()?.style.opacity).toBe('0');
    expect(content()?.style.transition).toContain('opacity');
    // …and the background has NOT started its outro yet (content-first) — still on air.
    await run(clock, 200);
    expect(onAir()).toBe(true);
    expect(bgOpacity()).toBeCloseTo(bgAtHold, 1); // background still held, not closing

    // after the fade completes, the background plays its outro LAST and settles cleared.
    await run(clock, 2000);
    await outP;
    expect(onAir()).toBe(false);
    expect(bgOpacity()).toBeCloseTo(1, 1); // the background ran its [20→40] outro to the end
    r.remove();
  });

  it('stop() removes the content IMMEDIATELY, then plays the background outro, then settles cleared', async () => {
    const clock = makeClock();
    const r = createRuntime(scene(), { skipFontLoad: true, clock, tickerMeasure });
    await r.play({});
    await run(clock, 1000);
    expect(onAir()).toBe(true);

    await r.stop();
    // content is gone immediately (before the background moves)
    expect(content()?.style.opacity).toBe('0');
    expect(content()?.style.visibility).toBe('hidden');

    await run(clock, 2000); // the background then closes → cleared
    expect(onAir()).toBe(false);
    expect(bgOpacity()).toBeCloseTo(1, 1);
    r.remove();
  });

  it('a stop() during an in-flight out() supersedes the fade (hard clear, not stuck on air)', async () => {
    const clock = makeClock();
    const r = createRuntime(scene(), { skipFontLoad: true, clock, tickerMeasure });
    await r.play({});
    await run(clock, 1000);

    const outP = r.out();
    await run(clock, 100); // mid-fade
    await r.stop(); // supersede the in-flight out()
    await run(clock, 2000);
    await outP;
    expect(onAir()).toBe(false); // settled cleared, no stuck/hung exit
    r.remove();
  });

  it('a pause during an out() fade defers the background close until resume', async () => {
    const clock = makeClock();
    const r = createRuntime(scene(), { skipFontLoad: true, clock, tickerMeasure });
    await r.play({});
    await run(clock, 1000);

    const outP = r.out();
    await run(clock, 100); // mid-fade
    r.pause();
    await run(clock, 3000); // the fade timer fires, but paused ⇒ the outro is deferred
    await outP;
    expect(onAir()).toBe(true); // NOT closed while paused

    r.resume();
    await run(clock, 2000); // resume finishes the deferred background outro
    expect(onAir()).toBe(false);
    r.remove();
  });

  it('replay after an exit restores the content (cleared fade/hide does not persist)', async () => {
    const clock = makeClock();
    const r = createRuntime(scene(), { skipFontLoad: true, clock, tickerMeasure });
    await r.play({});
    await run(clock, 1000);
    await r.stop();
    await run(clock, 2000);
    expect(onAir()).toBe(false);

    await r.play({}); // re-play
    await run(clock, 1000);
    expect(onAir()).toBe(true);
    // the content is visible again — the exit's inline opacity/visibility was cleared.
    expect(content()?.style.opacity).not.toBe('0');
    expect(content()?.style.visibility).not.toBe('hidden');
    r.remove();
  });
});
