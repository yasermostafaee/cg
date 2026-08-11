import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Composition, Element, Scene } from '@cg/shared-schema';
import { createRuntime } from '../src/runtime.js';

/**
 * B-089 — a NESTED composition instance's element lifespans were never gated at all.
 *
 * B-029 made the per-element `lifespan` gate frame-dependent, and B-088 taught the
 * collapse to sweep a leg whose gate boundary falls inside it — but BOTH were wired
 * for the ROOT scope only: `collectLifespanGates` walked `scene.layers` against the
 * root `elementMap`, so an element living inside a nested comp (built into that
 * instance's OWN scope/elementMap) produced no gate, and the instance's controller
 * was handed `undefined` for the lifespan half of `needsFrameSweep`.
 *
 * The fix collects gates PER SCOPE at build time, and each scope's controller
 * evaluates its own gates at ITS OWN frame. That frame space is the authored one:
 * the Designer clamps a lifespan to `activeDocOf(scene).frameRange` — the frame
 * range of the composition being edited — so a child's trim is expressed in the
 * CHILD's frames, exactly where its own controller reads it.
 *
 * These tests pin the gate AND the preserved static-case collapse (by rAF count),
 * one scope down from B-088's.
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
  size: { w: 100, h: 100 },
  scale: { x: 1, y: 1 },
  rotation: 0,
  anchor: { x: 0, y: 0 },
};

/** A plain TEXT element — no keyframes, so it contributes nothing to `scope.animated`. */
function subtitle(
  id: string,
  opts: { lifespan?: { in: number; out: number }; visible?: boolean } = {},
): Element {
  return {
    id,
    name: id,
    type: 'text',
    transform: baseTransform,
    opacity: 1,
    visible: opts.visible ?? true,
    locked: false,
    zIndex: 0,
    text: id,
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
    ...(opts.lifespan !== undefined ? { lifespan: opts.lifespan } : {}),
  } as unknown as Element;
}

/** A KEYFRAMED shape — the control: its presence makes a scope's `hasAnimation` true. */
function keyframedShape(id: string): Element {
  return {
    id,
    name: id,
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

function instance(id: string, compositionId: string, visible = true): Element {
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

function comp(id: string, outPoint: number, children: Element[]): Composition {
  return {
    id,
    name: id,
    resolution: { width: 100, height: 100 },
    frameRange: { in: 0, out: 100 },
    activeRange: { in: 0, out: 100 },
    lifecycle: { outPoint },
    editorBackdrop: 'transparent',
    layers: [
      { id: `${id}-l`, name: 'main', visible: true, locked: false, blendMode: 'normal', children },
    ],
    fields: [],
    bindings: [],
  } as unknown as Composition;
}

function parentScene(compositions: Composition[], children: Element[], outPoint: number): Scene {
  return {
    schemaVersion: 1,
    id: 'parent',
    name: 'parent',
    templateType: 'custom',
    resolution: { width: 200, height: 200 },
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
    compositions,
    metadata: { createdAt: '2026-07-19T00:00:00.000Z', updatedAt: '2026-07-19T00:00:00.000Z' },
  } as unknown as Scene;
}

/** Address a node by the chain of instance ids → element id (scoped to the instance). */
function nodeAt(...chain: string[]): HTMLElement | null {
  const selector = chain.map((id) => `[data-cg-element-id="${id}"]`).join(' ');
  return document.querySelector<HTMLElement>(selector);
}
const hiddenAt = (...chain: string[]): boolean => nodeAt(...chain)?.style.display === 'none';

beforeEach(() => {
  document.body.innerHTML = '';
  document.body.className = '';
});
afterEach(() => {
  document.body.innerHTML = '';
  document.body.className = '';
});

describe('B-089 — a nested element honours its lifespan during PLAY', () => {
  it('nested [33,60], no keyframes anywhere: hidden at 0/10, VISIBLE at 40', async () => {
    const clock = makeClock();
    const child = comp('child', 70, [subtitle('sub', { lifespan: { in: 33, out: 60 } })]);
    const r = createRuntime(parentScene([child], [instance('i', 'child')], 70), {
      skipFontLoad: true,
      installGlobals: false,
      clock,
    });
    await r.play({});
    expect(hiddenAt('i', 'sub')).toBe(true); // frame 0 — before the in-point
    clock.advance(200); // → frame 10, still before it
    expect(hiddenAt('i', 'sub')).toBe(true);
    clock.advance(600); // → frame 40, inside [33,60]
    expect(hiddenAt('i', 'sub')).toBe(false);
    r.remove();
  });

  it('nested [33,90]: NOT visible from frame zero (the opposite collapse error)', async () => {
    // The child's held frame (70) sits INSIDE [33,90] — the case a single collapsed
    // paint gets wrong in the other direction, revealing the element at play.
    const clock = makeClock();
    const child = comp('child', 70, [subtitle('sub', { lifespan: { in: 33, out: 90 } })]);
    const r = createRuntime(parentScene([child], [instance('i', 'child')], 70), {
      skipFontLoad: true,
      installGlobals: false,
      clock,
    });
    await r.play({});
    expect(hiddenAt('i', 'sub')).toBe(true);
    clock.advance(200); // → frame 10
    expect(hiddenAt('i', 'sub')).toBe(true);
    clock.advance(600); // → frame 40
    expect(hiddenAt('i', 'sub')).toBe(false);
    clock.advance(2000); // held at 70, still inside [33,90]
    expect(hiddenAt('i', 'sub')).toBe(false);
    r.remove();
  });

  it('nested trims are honoured while SCRUBBING too (tick, not only play)', () => {
    const clock = makeClock();
    const child = comp('child', 70, [subtitle('sub', { lifespan: { in: 33, out: 60 } })]);
    const r = createRuntime(parentScene([child], [instance('i', 'child')], 70), {
      skipFontLoad: true,
      installGlobals: false,
      clock,
    });
    r.tick(10);
    expect(hiddenAt('i', 'sub')).toBe(true);
    r.tick(40);
    expect(hiddenAt('i', 'sub')).toBe(false);
    r.tick(80);
    expect(hiddenAt('i', 'sub')).toBe(true);
    r.remove();
  });

  it('ROOT and NESTED trims coexist in one scene (no B-029 regression)', async () => {
    const clock = makeClock();
    const child = comp('child', 70, [subtitle('inner', { lifespan: { in: 33, out: 60 } })]);
    const r = createRuntime(
      parentScene(
        [child],
        [subtitle('outer', { lifespan: { in: 20, out: 80 } }), instance('i', 'child')],
        70,
      ),
      { skipFontLoad: true, installGlobals: false, clock },
    );
    await r.play({});
    expect(hiddenAt('outer')).toBe(true); // root trim, before 20
    expect(hiddenAt('i', 'inner')).toBe(true); // nested trim, before 33
    clock.advance(500); // → frame 25: root in, nested still out
    expect(hiddenAt('outer')).toBe(false);
    expect(hiddenAt('i', 'inner')).toBe(true);
    clock.advance(300); // → frame 40: both in
    expect(hiddenAt('outer')).toBe(false);
    expect(hiddenAt('i', 'inner')).toBe(false);
    r.remove();
  });

  it('B-034 — a HIDDEN nested element stays inert (the gate never reveals it)', async () => {
    const clock = makeClock();
    const child = comp('child', 70, [
      subtitle('sub', { lifespan: { in: 33, out: 60 }, visible: false }),
    ]);
    const r = createRuntime(parentScene([child], [instance('i', 'child')], 70), {
      skipFontLoad: true,
      installGlobals: false,
      clock,
    });
    await r.play({});
    expect(hiddenAt('i', 'sub')).toBe(true);
    clock.advance(800); // → frame 40, INSIDE the lifespan — must stay hidden anyway
    expect(hiddenAt('i', 'sub')).toBe(true);
    r.remove();
  });
});

/**
 * A STAMPED scope — a repeater row — is the case a walk of the D-025 namespace tree cannot
 * reach: `buildRepeaterRows` mints a fresh scope that is deliberately NEVER in
 * `scope.children` (only the wiring tree sees it). Its controller nonetheless runs, so a
 * gate whose `naturalDisplay` was left unset would write `display: ''` on entering the trim
 * — un-hiding a `visible:false` element and flattening a `flex`/`grid` one to `block`.
 */
function repeaterRowComp(children: Element[]): Composition {
  return {
    id: 'rowc',
    name: 'rowc',
    resolution: { width: 100, height: 50 },
    frameRange: { in: 0, out: 100 },
    activeRange: { in: 0, out: 100 },
    lifecycle: { outPoint: 70 },
    editorBackdrop: 'transparent',
    layers: [
      { id: 'rl', name: 'main', visible: true, locked: false, blendMode: 'normal', children },
    ],
    fields: [],
    bindings: [],
  } as unknown as Composition;
}

function repeaterEl(): Element {
  return {
    id: 'rep',
    name: 'rep',
    type: 'repeater',
    compositionId: 'rowc',
    direction: 'column',
    flow: 'rtl',
    gap: 0,
    items: [{ id: 'r1' }, { id: 'r2' }],
    transform: baseTransform,
    opacity: 1,
    visible: true,
    locked: false,
    zIndex: 0,
  } as unknown as Element;
}

const rowNodes = (id: string): HTMLElement[] => [
  ...document.querySelectorAll<HTMLElement>(`[data-cg-repeater-row] [data-cg-element-id="${id}"]`),
];

describe('B-089 — a STAMPED scope (repeater row) gates without corrupting display', () => {
  it('a HIDDEN trimmed element in a row stays hidden INSIDE its trim (B-034 holds)', async () => {
    const clock = makeClock();
    const child = repeaterRowComp([
      subtitle('hid', { lifespan: { in: 33, out: 60 }, visible: false }),
    ]);
    const r = createRuntime(parentScene([child], [repeaterEl()], 70), {
      skipFontLoad: true,
      installGlobals: false,
      clock,
    });
    await r.play({});
    expect(rowNodes('hid').length).toBeGreaterThan(0); // rows really stamped
    expect(rowNodes('hid').every((n) => n.style.display === 'none')).toBe(true);
    clock.advance(800); // → frame 40, INSIDE [33,60] — must NOT be revealed
    expect(rowNodes('hid').every((n) => n.style.display === 'none')).toBe(true);
    r.remove();
  });

  it('a trimmed element in a row restores its BUILT display, not the empty string', async () => {
    const clock = makeClock();
    // A text element with `verticalAlign` builds as `display: flex`; the gate must restore
    // exactly that, or the row loses its vertical centring on re-entering the trim.
    const flexText = {
      ...subtitle('vt', { lifespan: { in: 33, out: 60 } }),
      verticalAlign: 'middle',
    } as unknown as Element;
    const child = repeaterRowComp([flexText]);
    const r = createRuntime(parentScene([child], [repeaterEl()], 70), {
      skipFontLoad: true,
      installGlobals: false,
      clock,
    });
    const built = rowNodes('vt').map((n) => n.style.display);
    expect(built.length).toBeGreaterThan(0);
    expect(built.every((d) => d === 'flex')).toBe(true);
    await r.play({});
    clock.advance(800); // → frame 40, inside the trim
    expect(rowNodes('vt').every((n) => n.style.display === 'flex')).toBe(true);
    clock.advance(600); // → past lifespan.out
    expect(rowNodes('vt').every((n) => n.style.display === 'none')).toBe(true);
    r.remove();
  });

  it('SCRUB gates a row element too, so the canvas agrees with playback', () => {
    const clock = makeClock();
    const child = repeaterRowComp([subtitle('sub', { lifespan: { in: 33, out: 60 } })]);
    const r = createRuntime(parentScene([child], [repeaterEl()], 70), {
      skipFontLoad: true,
      installGlobals: false,
      clock,
    });
    r.tick(10);
    expect(rowNodes('sub').every((n) => n.style.display === 'none')).toBe(true);
    r.tick(40);
    expect(rowNodes('sub').every((n) => n.style.display !== 'none')).toBe(true);
    r.tick(80);
    expect(rowNodes('sub').every((n) => n.style.display === 'none')).toBe(true);
    r.remove();
  });
});

describe('B-089 — the static-case collapse is PRESERVED one scope down', () => {
  it('nested scene with no keyframes and NO lifespan: one paint, no FrameDriver', async () => {
    const clock = makeClock();
    const child = comp('child', 70, [subtitle('sub')]);
    const r = createRuntime(parentScene([child], [instance('i', 'child')], 70), {
      skipFontLoad: true,
      installGlobals: false,
      clock,
    });
    await r.play({});
    expect(clock.rafCount).toBe(0);
    expect(hiddenAt('i', 'sub')).toBe(false);
    r.remove();
  });

  it('a nested lifespan SPANNING the whole leg still collapses (no boundary crossed)', async () => {
    const clock = makeClock();
    const child = comp('child', 70, [subtitle('sub', { lifespan: { in: 0, out: 100 } })]);
    const r = createRuntime(parentScene([child], [instance('i', 'child')], 70), {
      skipFontLoad: true,
      installGlobals: false,
      clock,
    });
    await r.play({});
    expect(clock.rafCount).toBe(0);
    expect(hiddenAt('i', 'sub')).toBe(false);
    r.remove();
  });

  it('CONTROL — a keyframed sibling in the child comp keeps the nested trim correct', async () => {
    const clock = makeClock();
    const child = comp('child', 70, [
      keyframedShape('bg'),
      subtitle('sub', { lifespan: { in: 33, out: 60 } }),
    ]);
    const r = createRuntime(parentScene([child], [instance('i', 'child')], 70), {
      skipFontLoad: true,
      installGlobals: false,
      clock,
    });
    await r.play({});
    expect(hiddenAt('i', 'sub')).toBe(true);
    clock.advance(800); // → frame 40
    expect(hiddenAt('i', 'sub')).toBe(false);
    r.remove();
  });
});
