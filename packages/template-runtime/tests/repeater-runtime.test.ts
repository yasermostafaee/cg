import { beforeEach, describe, expect, it } from 'vitest';
import type { Composition, Element, Playout, Scene } from '@cg/shared-schema';
import { createRuntime } from '../src/runtime.js';
import { buildScene } from '../src/scene-builder.js';

/**
 * D-030 — repeater: stamped rows are REAL nested scopes (D-025/D-026 by
 * reuse); values live mid-hold, count stamped per fresh play (model B).
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
    /** Leak checks: nothing scheduled after a full teardown. */
    pendingRafs: () => rafs.size,
    pendingTimers: () => timers.length,
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
  size: { w: 400, h: 300 },
  scale: { x: 1, y: 1 },
  rotation: 0,
  anchor: { x: 0, y: 0 },
};
const baseElProps = {
  transform: baseTransform,
  opacity: 1,
  visible: true,
  locked: false,
  zIndex: 0,
};

/** A shape whose opacity ramps 0→1 across frames [0, 40] (value = f/40). */
function animShape(id: string): Element {
  return {
    ...baseElProps,
    id,
    name: id,
    type: 'shape',
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

/** The row child: a bound text + an animated shape, out-point at 10. */
function rowComp(opts?: { playout?: Playout; extra?: Element[]; outPoint?: number }): Composition {
  return {
    id: 'rowc',
    name: 'Row',
    resolution: { width: 200, height: 50 },
    frameRange: { in: 0, out: 40 },
    lifecycle: { outPoint: opts?.outPoint ?? 10 },
    ...(opts?.playout !== undefined ? { playout: opts.playout } : {}),
    background: 'transparent',
    layers: [
      {
        id: 'rl',
        name: 'main',
        visible: true,
        locked: false,
        blendMode: 'normal',
        children: [
          {
            ...baseElProps,
            id: 'tn',
            name: 'row-name',
            type: 'text',
            text: 'default',
            font: {
              family: 'Vazirmatn',
              weight: 400,
              style: 'normal',
              size: 24,
              lineHeight: 1.2,
              letterSpacing: 0,
            },
            color: '#FFFFFF',
            align: 'start',
            direction: 'rtl',
            fitMode: 'autosize',
            overflow: 'ellipsis',
          } as unknown as Element,
          animShape('ax'),
          ...(opts?.extra ?? []),
        ],
      },
    ],
    fields: [
      { id: 'name', label: 'Name', required: false, type: 'text', default: 'default' },
      { id: 'score', label: 'Score', required: false, type: 'number', default: 0, min: 0 },
    ],
    bindings: [{ fieldId: 'name', target: { kind: 'text', elementId: 'tn' } }],
  } as unknown as Composition;
}

function repeaterEl(overrides: Record<string, unknown> = {}): Element {
  return {
    ...baseElProps,
    id: 'rep',
    name: 'Repeater',
    type: 'repeater',
    compositionId: 'rowc',
    direction: 'column',
    flow: 'rtl',
    gap: 10,
    items: [
      { id: 'r1', text: undefined, name: 'اول' },
      { id: 'r2', name: 'دوم' },
      { id: 'r3', name: 'سوم' },
    ],
    ...overrides,
  } as unknown as Element;
}

function repeaterScene(opts?: {
  element?: Record<string, unknown>;
  comp?: Composition;
  playout?: Playout;
  fields?: Scene['fields'];
  bindings?: Scene['bindings'];
}): Scene {
  return {
    schemaVersion: 1,
    id: 'scene-rep',
    name: 'leaderboard',
    templateType: 'custom',
    resolution: { width: 800, height: 600 },
    frameRate: 50,
    safeAreas: { title: 10, action: 5 },
    frameRange: { in: 0, out: 40 },
    background: 'transparent',
    ...(opts?.playout !== undefined ? { playout: opts.playout } : {}),
    layers: [
      {
        id: 'pl',
        name: 'main',
        visible: true,
        locked: false,
        blendMode: 'normal',
        children: [repeaterEl(opts?.element ?? {})],
      },
    ],
    fields: opts?.fields ?? [],
    bindings: opts?.bindings ?? [],
    fonts: [],
    compositions: [opts?.comp ?? rowComp()],
    metadata: { createdAt: '2026-06-11T00:00:00.000Z', updatedAt: '2026-06-11T00:00:00.000Z' },
  } as unknown as Scene;
}

const BOUND = {
  fields: [
    {
      id: 'rows',
      label: 'Rows',
      required: false,
      type: 'list' as const,
      default: [
        { id: 'r1', name: 'اول' },
        { id: 'r2', name: 'دوم' },
        { id: 'r3', name: 'سوم' },
      ],
    },
  ],
  bindings: [{ fieldId: 'rows', target: { kind: 'repeater-items' as const, elementId: 'rep' } }],
};

function host(): HTMLElement {
  const el = document.querySelector<HTMLElement>('[data-cg-element-id="rep"]');
  if (el === null) throw new Error('repeater host not rendered');
  return el;
}

function cells(): HTMLElement[] {
  return [...host().querySelectorAll<HTMLElement>('[data-cg-repeater-row]')];
}

function visibleCells(): HTMLElement[] {
  return cells().filter((c) => c.style.display !== 'none');
}

function rowTexts(): string[] {
  return visibleCells().map(
    (c) => c.querySelector<HTMLElement>('[data-cg-element-id="tn"]')?.textContent ?? '',
  );
}

beforeEach(() => {
  document.body.innerHTML = '';
  document.body.className = '';
});

describe('repeater — stamping and layout (D-030)', () => {
  it('buildScene stamps the authored row COUNT statically (no runtime needed)', () => {
    const built = buildScene(repeaterScene());
    const h = built.elementMap.get('rep');
    expect(h?.querySelectorAll('[data-cg-repeater-row]')).toHaveLength(3);
    // Registered for the runtime, but NOT in the namespace tree.
    expect(built.scopeTree.repeaters).toHaveLength(1);
    expect(built.scopeTree.children).toHaveLength(0);
  });

  it('the runtime applies authored row VALUES on the canvas (no play needed)', () => {
    createRuntime(repeaterScene(), { skipFontLoad: true, clock: makeClock() });
    expect(rowTexts()).toEqual(['اول', 'دوم', 'سوم']);
  });

  it('column cells fill the width (aspect preserved) and stack with gap', () => {
    createRuntime(repeaterScene(), { skipFontLoad: true, clock: makeClock() });
    // Box 400 wide; child 200×50 ⇒ scale 2 ⇒ cell 400×100; gap 10.
    const cs = cells();
    expect(cs[0]?.style.width).toBe('400px');
    expect(cs[0]?.style.height).toBe('100px');
    expect(cs[0]?.style.top).toBe('0px');
    expect(cs[1]?.style.top).toBe('110px');
    expect(cs[2]?.style.top).toBe('220px');
    expect(cs[0]?.querySelector<HTMLElement>('.cg-comp-inner')?.style.transform).toBe(
      'scale(2, 2)',
    );
  });

  it("row cells fill the height and lay along the row axis ordered by flow ('rtl' default)", () => {
    createRuntime(repeaterScene({ element: { direction: 'row' } }), {
      skipFontLoad: true,
      clock: makeClock(),
    });
    // Box 400×300; child 200×50 ⇒ scale 6 ⇒ cell 1200×300 — clipped; rtl
    // lays row 1 at the RIGHT edge: left = 400 − 1200 − i*(1200+10).
    const cs = cells();
    expect(cs[0]?.style.height).toBe('300px');
    expect(cs[0]?.style.left).toBe('-800px');
    expect(cs[1]?.style.left).toBe('-2010px');
  });

  it("flow 'ltr' is the mirror (row 1 at the left edge)", () => {
    createRuntime(repeaterScene({ element: { direction: 'row', flow: 'ltr' } }), {
      skipFontLoad: true,
      clock: makeClock(),
    });
    const cs = cells();
    expect(cs[0]?.style.left).toBe('0px');
    expect(cs[1]?.style.left).toBe('1210px');
  });

  it('a zero-resolution child scales 1 (the buildComposition guard)', () => {
    const comp = { ...rowComp(), resolution: { width: 0, height: 0 } } as Composition;
    createRuntime(repeaterScene({ comp }), { skipFontLoad: true, clock: makeClock() });
    expect(cells()[0]?.querySelector<HTMLElement>('.cg-comp-inner')?.style.transform).toBe(
      'scale(1, 1)',
    );
  });

  it('a cyclic/forced reference renders the empty clipped box', () => {
    // The child contains a repeater referencing ITSELF — the row-level
    // visited guard stops the recursion at the nested level.
    const cyclic = rowComp({
      extra: [repeaterEl({ id: 'rep-inner', compositionId: 'rowc', items: [{ id: 'x' }] })],
    });
    createRuntime(repeaterScene({ comp: cyclic }), { skipFontLoad: true, clock: makeClock() });
    const inner = host().querySelector<HTMLElement>('[data-cg-element-id="rep-inner"]');
    expect(inner).not.toBeNull();
    expect(inner?.querySelectorAll('[data-cg-repeater-row]')).toHaveLength(0);
  });

  it('play() stamps from the CURRENT effective items — a retained pre-play update() counts', async () => {
    const clock = makeClock();
    const runtime = createRuntime(repeaterScene({ ...BOUND, playout: { mode: 'manual' } }), {
      skipFontLoad: true,
      clock,
    });
    await runtime.update({
      rows: Array.from({ length: 8 }, (_, i) => ({ id: `n${String(i)}`, name: `R${String(i)}` })),
    });
    await runtime.play({});
    expect(visibleCells()).toHaveLength(8);
    expect(rowTexts()[0]).toBe('R0');
    expect(rowTexts()[7]).toBe('R7');
  });

  it('maxItems clamps the stamped count', async () => {
    const clock = makeClock();
    const runtime = createRuntime(
      repeaterScene({ ...BOUND, element: { maxItems: 2 }, playout: { mode: 'manual' } }),
      { skipFontLoad: true, clock },
    );
    await runtime.play({});
    expect(visibleCells()).toHaveLength(2);
  });
});

describe('repeater — live values mid-hold (model B)', () => {
  it('values apply positionally and a reorder is live', async () => {
    const clock = makeClock();
    const runtime = createRuntime(repeaterScene({ ...BOUND, playout: { mode: 'manual' } }), {
      skipFontLoad: true,
      clock,
    });
    await runtime.play({});
    await run(clock, 500);
    expect(rowTexts()).toEqual(['اول', 'دوم', 'سوم']);
    await runtime.update({
      rows: [
        { id: 'r3', name: 'سوم' },
        { id: 'r1', name: 'اول' },
        { id: 'r2', name: 'دوم' },
      ],
    });
    expect(rowTexts()).toEqual(['سوم', 'اول', 'دوم']); // positional — live
  });

  it('shrink hides surplus rows; regrowth within the stamped count re-shows; growth defers', async () => {
    const clock = makeClock();
    const runtime = createRuntime(repeaterScene({ ...BOUND, playout: { mode: 'manual' } }), {
      skipFontLoad: true,
      clock,
    });
    await runtime.play({});
    expect(visibleCells()).toHaveLength(3);
    await runtime.update({ rows: [{ id: 'r1', name: 'تنها' }] });
    expect(visibleCells()).toHaveLength(1); // hidden, not destroyed
    expect(cells()).toHaveLength(3); // scopes persist
    await runtime.update({
      rows: [
        { id: 'r1', name: 'یک' },
        { id: 'r2', name: 'دو' },
      ],
    });
    expect(visibleCells()).toHaveLength(2); // regrowth re-shows
    expect(rowTexts()).toEqual(['یک', 'دو']);
    await runtime.update({
      rows: Array.from({ length: 5 }, (_, i) => ({ id: `g${String(i)}`, name: `G${String(i)}` })),
    });
    expect(visibleCells()).toHaveLength(3); // longer DEFERS mid-hold…
    await runtime.stop();
    await runtime.play({});
    expect(visibleCells()).toHaveLength(5); // …and stamps at the next fresh play
  });
});

describe('repeater — rows are real scopes (lifecycle by reuse)', () => {
  it('rows hold at the child out-point and play their own outro on stop()', async () => {
    const clock = makeClock();
    const runtime = createRuntime(repeaterScene({ playout: { mode: 'manual' } }), {
      skipFontLoad: true,
      clock,
    });
    await runtime.play({});
    await run(clock, 2000);
    // The child holds at outPoint 10/40 ⇒ the animated shape's opacity 0.25.
    const ax = visibleCells()[0]?.querySelector<HTMLElement>('[data-cg-element-id="ax"]');
    expect(Number.parseFloat(ax?.style.opacity ?? 'NaN')).toBeCloseTo(0.25);
    await runtime.stop();
    await run(clock, 2000); // each row plays its OWN outro [10 → 40] ⇒ 1.0
    expect(Number.parseFloat(ax?.style.opacity ?? 'NaN')).toBeCloseTo(1);
  });

  it('pause()/resume() cascade into row scopes', async () => {
    const clock = makeClock();
    const runtime = createRuntime(repeaterScene({ playout: { mode: 'manual' } }), {
      skipFontLoad: true,
      clock,
    });
    await runtime.play({});
    await run(clock, 100); // mid row intro
    const ax = visibleCells()[0]?.querySelector<HTMLElement>('[data-cg-element-id="ax"]');
    const mid = Number.parseFloat(ax?.style.opacity ?? 'NaN');
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(0.25);
    runtime.pause();
    await run(clock, 5000);
    expect(Number.parseFloat(ax?.style.opacity ?? 'NaN')).toBeCloseTo(mid);
    runtime.resume();
    await run(clock, 2000);
    expect(Number.parseFloat(ax?.style.opacity ?? 'NaN')).toBeCloseTo(0.25);
  });

  it("a row's countdown drives that ROW's content-driven hold (parent untouched)", async () => {
    const clock = makeClock();
    const countdownChild = rowComp({
      playout: { mode: 'auto-out', holdSource: 'content-driven' },
      extra: [
        {
          ...baseElProps,
          id: 'clk',
          name: 'clock',
          type: 'clock',
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
          target: { kind: 'duration', ms: 1000 },
        } as unknown as Element,
      ],
    });
    const runtime = createRuntime(
      repeaterScene({ comp: countdownChild, playout: { mode: 'manual' } }),
      { skipFontLoad: true, clock },
    );
    await runtime.play({});
    // Each ROW's countdown ends ITS scope's hold ≈1s after the row's intro
    // (10 frames @50fps = 200ms): the row plays its own outro and settles
    // (opacity ramps to 1.0) while the parent (manual) keeps holding.
    await run(clock, 3000);
    const ax = visibleCells()[0]?.querySelector<HTMLElement>('[data-cg-element-id="ax"]');
    expect(Number.parseFloat(ax?.style.opacity ?? 'NaN')).toBeCloseTo(1); // row settled itself
    expect(document.body.classList.contains('cg-pending')).toBe(false); // parent still on air
    await runtime.stop();
  });

  it('tick(frame) scrubs row animations like authored instances', () => {
    const clock = makeClock();
    const runtime = createRuntime(repeaterScene(), { skipFontLoad: true, clock });
    runtime.tick(20); // 20/40 ⇒ opacity 0.5
    const ax = visibleCells()[0]?.querySelector<HTMLElement>('[data-cg-element-id="ax"]');
    expect(Number.parseFloat(ax?.style.opacity ?? 'NaN')).toBeCloseTo(0.5);
    runtime.tick(0);
    expect(Number.parseFloat(ax?.style.opacity ?? 'NaN')).toBeCloseTo(0);
  });

  it('remove() tears everything down — no orphan rAF or timers', async () => {
    const clock = makeClock();
    const runtime = createRuntime(repeaterScene({ playout: { mode: 'manual' } }), {
      skipFontLoad: true,
      clock,
    });
    await runtime.play({});
    await run(clock, 500);
    runtime.remove();
    clock.advance(1000); // drain anything already queued
    expect(clock.pendingRafs()).toBe(0);
    expect(clock.pendingTimers()).toBe(0);
    expect(document.querySelector('[data-cg-element-id="rep"]')).toBeNull();
  });
});
