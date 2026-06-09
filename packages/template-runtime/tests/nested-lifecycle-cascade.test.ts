import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Composition, Element, Playout, Scene } from '@cg/shared-schema';
import { createRuntime } from '../src/runtime.js';

/**
 * D-026 — nested-lifecycle CASCADE. `play/stop/pause/resume` on the parent cascade
 * to a PARALLEL controller tree (one per composition instance), so each nested
 * child runs its OWN in→hold→out independently, all on the single project fps.
 */

/**
 * Fake rAF + timer clock so cascade timing is deterministic. rAF handles are
 * UNIQUE and `cancel()` removes only that one callback — the cascade runs many
 * FrameDrivers concurrently, so a single driver finishing (and cancelling its own
 * rAF) must NOT kill the others' pending callbacks.
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
      // Snapshot + clear the current round; callbacks reschedule into the fresh map.
      const round = [...rafs.entries()];
      for (const [id] of round) rafs.delete(id);
      for (const [, cb] of round) cb(ms);
    },
  };
}

const baseTransform = {
  position: { x: 0, y: 0 },
  size: { w: 100, h: 100 },
  scale: { x: 1, y: 1 },
  rotation: 0,
  anchor: { x: 0, y: 0 },
};

/** A shape whose opacity ramps 0→1 linearly across frames [0, 40] (value = f/40). */
function animShape(id: string): Element {
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

function comp(
  id: string,
  outPoint: number,
  children: Element[],
  playout?: Playout,
): Composition {
  return {
    id,
    name: id,
    resolution: { width: 100, height: 100 },
    frameRange: { in: 0, out: 40 },
    lifecycle: { outPoint },
    ...(playout !== undefined ? { playout } : {}),
    background: 'transparent',
    layers: [
      { id: `${id}-l`, name: 'main', visible: true, locked: false, blendMode: 'normal', children },
    ],
  } as unknown as Composition;
}

function parentScene(opts: {
  compositions: Composition[];
  children: Element[];
  lifecycle?: { outPoint: number };
}): Scene {
  return {
    schemaVersion: 1,
    id: 'parent',
    name: 'parent',
    templateType: 'custom',
    resolution: { width: 200, height: 100 },
    frameRate: 50,
    safeAreas: { title: 10, action: 5 },
    frameRange: { in: 0, out: 40 },
    ...(opts.lifecycle !== undefined ? { lifecycle: opts.lifecycle } : {}),
    background: 'transparent',
    layers: [
      { id: 'pl', name: 'main', visible: true, locked: false, blendMode: 'normal', children: opts.children },
    ],
    fields: [],
    bindings: [],
    fonts: [],
    compositions: opts.compositions,
    metadata: { createdAt: '2026-06-09T00:00:00.000Z', updatedAt: '2026-06-09T00:00:00.000Z' },
  } as unknown as Scene;
}

/** Opacity of a nested element addressed by the chain of instance ids → element id. */
function opacityAt(...chain: string[]): number {
  const selector = chain.map((id) => `[data-cg-element-id="${id}"]`).join(' ');
  const node = document.querySelector<HTMLElement>(selector);
  return parseFloat(node?.style.opacity ?? 'NaN');
}

/** Advance the clock in small steps so the rAF-driven FrameDrivers progress. */
function run(clock: ReturnType<typeof makeClock>, totalMs: number, step = 20): void {
  for (let t = 0; t < totalMs; t += step) clock.advance(step);
}

beforeEach(() => {
  document.body.innerHTML = '';
  document.body.className = '';
});
afterEach(() => {
  document.body.innerHTML = '';
  document.body.className = '';
});

describe('D-026 — nested-lifecycle cascade', () => {
  it('(a) parent play → each child holds at its OWN outPoint independently', async () => {
    const clock = makeClock();
    const scene = parentScene({
      compositions: [comp('fast', 10, [animShape('fx')]), comp('slow', 30, [animShape('sx')])],
      children: [instance('i-fast', 'fast', 'fast'), instance('i-slow', 'slow', 'slow')],
    });
    const r = createRuntime(scene, { skipFontLoad: true, clock });
    await r.play({});
    run(clock, 2000); // let both children finish their intros and hold

    // fast holds at frame 10 → 10/40 = 0.25; slow holds at frame 30 → 30/40 = 0.75.
    expect(opacityAt('i-fast', 'fx')).toBeCloseTo(0.25);
    expect(opacityAt('i-slow', 'sx')).toBeCloseTo(0.75);

    // Frozen — holding does not advance further.
    run(clock, 5000);
    expect(opacityAt('i-fast', 'fx')).toBeCloseTo(0.25);
    expect(opacityAt('i-slow', 'sx')).toBeCloseTo(0.75);
    r.remove();
  });

  it('(b) parent stop → each child runs its own exit (outro) and the root settles', async () => {
    const clock = makeClock();
    const scene = parentScene({
      compositions: [comp('fast', 10, [animShape('fx')]), comp('slow', 30, [animShape('sx')])],
      children: [instance('i-fast', 'fast', 'fast'), instance('i-slow', 'slow', 'slow')],
    });
    const r = createRuntime(scene, { skipFontLoad: true, clock });
    await r.play({});
    run(clock, 2000);
    expect(opacityAt('i-fast', 'fx')).toBeCloseTo(0.25); // held at its outPoint

    await r.stop();
    // Root has no outro of its own → settles immediately (cg-pending re-added).
    expect(document.body.classList.contains('cg-pending')).toBe(true);

    run(clock, 2000); // each child plays its OWN outro [outPoint → active.out=40] → frame 40
    expect(opacityAt('i-fast', 'fx')).toBeCloseTo(1); // fast's outro ran 0.25 → 1.0
    expect(opacityAt('i-slow', 'sx')).toBeCloseTo(1); // slow's outro ran 0.75 → 1.0
    r.remove();
  });

  it('(c) parent pause/resume cascades to each child controller', async () => {
    const clock = makeClock();
    // One child whose intro spans the whole [0, 40] so we can pause mid-intro.
    const scene = parentScene({
      compositions: [comp('child', 40, [animShape('cx')])],
      children: [instance('i-child', 'child', 'child')],
    });
    const r = createRuntime(scene, { skipFontLoad: true, clock });
    await r.play({});
    run(clock, 200); // mid-intro
    const mid = opacityAt('i-child', 'cx');
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1);

    r.pause();
    run(clock, 5000); // paused — the child's driver is frozen
    expect(opacityAt('i-child', 'cx')).toBeCloseTo(mid);

    r.resume();
    run(clock, 2000); // continues to its outPoint (40) and holds
    expect(opacityAt('i-child', 'cx')).toBeCloseTo(1);
    r.remove();
  });

  it('(d) parent with its OWN outPoint applies to direct elements AND cascades to children', async () => {
    const clock = makeClock();
    // Parent has a DIRECT animated element + its own out-point (20 → 0.5), plus a
    // nested child holding at its own out-point (10 → 0.25).
    const scene = parentScene({
      compositions: [comp('fast', 10, [animShape('fx')])],
      children: [animShape('direct'), instance('i-fast', 'fast', 'fast')],
      lifecycle: { outPoint: 20 },
    });
    const r = createRuntime(scene, { skipFontLoad: true, clock });
    await r.play({});
    run(clock, 2000);

    // Direct element holds at the parent's out-point (frame 20 → 0.5).
    expect(parseFloat(document.querySelector<HTMLElement>('[data-cg-element-id="direct"]')!.style.opacity)).toBeCloseTo(0.5);
    // Nested child holds at ITS own out-point (frame 10 → 0.25).
    expect(opacityAt('i-fast', 'fx')).toBeCloseTo(0.25);
    r.remove();
  });

  it('(e) cascade reaches arbitrary depth (parent → child → grandchild)', async () => {
    const clock = makeClock();
    const grandchild = comp('gc', 20, [animShape('gx')]); // holds at 20 → 0.5
    const child = comp('child', 40, [instance('i-g', 'g', 'gc')]); // no direct animation
    const scene = parentScene({
      compositions: [grandchild, child],
      children: [instance('i-c', 'c', 'child')],
    });
    const r = createRuntime(scene, { skipFontLoad: true, clock });
    await r.play({});
    run(clock, 2000);

    expect(opacityAt('i-c', 'i-g', 'gx')).toBeCloseTo(0.5);
    r.remove();
  });
});
