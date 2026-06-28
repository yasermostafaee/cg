import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Composition, Element, Playout, Scene } from '@cg/shared-schema';
import { createRuntime } from '../src/runtime.js';

/**
 * B-033 — a content-driven hold must re-arm on every play. The first play waits on content
 * correctly, but a REPLAY (calling `play()` again without re-creating the runtime) used to close
 * instantly for a NESTED CONTENT-DRIVEN (coordinator) child: the child's `whenSettled` deferred
 * (B-031) is created once and resolves on the first play, so the parent — which captures
 * `whenSettled()` fresh at each hold entry — saw an already-resolved settle and stopped waiting.
 * `play()` now re-arms every scope's self-settle deferred before the controller cascade.
 *
 * OWN / non-coordinator-nested content already re-armed (their drivers' `whenComplete` is re-minted
 * by `reset()`); the OWN test here is a regression guard.
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

const baseTransform = {
  position: { x: 0, y: 0 },
  size: { w: 400, h: 60 },
  scale: { x: 1, y: 1 },
  rotation: 0,
  anchor: { x: 0, y: 0 },
};

/** A countdown clock that completes after `ms` of active (hold) time. */
function countdownClock(id: string, ms: number): Element {
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
      size: 24,
      lineHeight: 1.2,
      letterSpacing: 0,
    },
    color: '#FFFFFF',
    align: 'center',
    mode: 'countdown',
    format: 'mm:ss',
    digits: 'latin',
    target: { kind: 'duration', ms },
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
    frameRange: { in: 0, out: 50 },
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
  playout?: Playout;
}): Scene {
  return {
    schemaVersion: 1,
    id: 'parent',
    name: 'parent',
    templateType: 'custom',
    resolution: { width: 400, height: 120 },
    frameRate: 50,
    safeAreas: { title: 10, action: 5 },
    frameRange: { in: 0, out: 50 },
    ...(opts.lifecycle !== undefined ? { lifecycle: opts.lifecycle } : {}),
    ...(opts.playout !== undefined ? { playout: opts.playout } : {}),
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
    compositions: opts.compositions,
    metadata: { createdAt: '2026-06-28T00:00:00.000Z', updatedAt: '2026-06-28T00:00:00.000Z' },
  } as unknown as Scene;
}

const onAir = (): boolean => !document.body.classList.contains('cg-pending');

beforeEach(() => {
  document.body.innerHTML = '';
  document.body.className = '';
});
afterEach(() => {
  document.body.innerHTML = '';
  document.body.className = '';
});

describe('B-033 — a content-driven hold re-arms on replay', () => {
  it('OWN content: replay holds again for the content (regression guard)', async () => {
    const clock = makeClock();
    const scene = parentScene({
      compositions: [],
      children: [countdownClock('clk', 1000)],
      lifecycle: { outPoint: 25 },
      playout: { mode: 'auto-out', holdSource: 'content-driven' },
    });
    const r = createRuntime(scene, { skipFontLoad: true, clock });

    await r.play({});
    await run(clock, 600);
    expect(onAir()).toBe(true); // first play holds for the countdown
    await run(clock, 2000);
    expect(onAir()).toBe(false); // settles on completion

    await r.play({}); // REPLAY
    await run(clock, 600);
    expect(onAir()).toBe(true); // still holding — the hold re-armed
    await run(clock, 2000);
    expect(onAir()).toBe(false);
    r.remove();
  });

  it('NESTED coordinator: replay re-arms the hold (the B-033 bug)', async () => {
    const clock = makeClock();
    // The parent waits on the nested CONTENT-DRIVEN child's self-settle (B-031). On the 2nd play the
    // child's `whenSettled` used to be already-resolved → the parent closed instantly. It must wait.
    const child = comp('child', 25, [countdownClock('clk', 1000)], {
      mode: 'auto-out',
      holdSource: 'content-driven',
    });
    const scene = parentScene({
      compositions: [child],
      children: [instance('i1', 'inst1', 'child')],
      lifecycle: { outPoint: 25 },
      playout: { mode: 'auto-out', holdSource: 'content-driven' },
    });
    const r = createRuntime(scene, { skipFontLoad: true, clock });

    await r.play({});
    await run(clock, 600);
    expect(onAir()).toBe(true); // first play holds for the nested countdown
    await run(clock, 2500); // child self-settles → parent settles
    expect(onAir()).toBe(false);

    await r.play({}); // REPLAY without reopening
    await run(clock, 600);
    expect(onAir()).toBe(true); // B-033 — re-armed; WITHOUT the fix this closed instantly
    await run(clock, 2500);
    expect(onAir()).toBe(false); // settles again on the fresh nested countdown
    r.remove();
  });
});
