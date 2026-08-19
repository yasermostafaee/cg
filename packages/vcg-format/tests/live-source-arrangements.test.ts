import { describe, expect, it } from 'vitest';
import type { Element, Scene } from '@cg/shared-schema';
import {
  buildTemplateLiveSources,
  collectArrangements,
  collectLiveSources,
} from '../src/live-sources.js';

/**
 * `multibox-layout-switch` `tasks.md` 5.2 — the ARRANGEMENT CARRIER, derived once at import.
 *
 * The two halves under test are the pair that together replace the per-plate rect that is
 * NOT derivable at import (which plate lands in which cell depends on the operator's
 * toggles): the arrangement's CELLS, and each plate's rect INSIDE its own box.
 */

const box = (x: number, y: number, w: number, h: number) => ({
  position: { x, y },
  size: { w, h },
  scale: { x: 1, y: 1 },
  rotation: 0,
  anchor: { x: 0, y: 0 },
});
const baseProps = { opacity: 1, visible: true, locked: false };

function el(type: string, id: string, t: ReturnType<typeof box>, over = {}): Element {
  return {
    ...baseProps,
    id,
    name: id,
    type,
    transform: t,
    zIndex: 0,
    ...over,
  } as unknown as Element;
}

/** A BOX composition: a 960×540 comp with a plate inset 40px, and a title under it. */
const BOX_COMP = {
  id: 'comp-box',
  name: 'box',
  resolution: { width: 960, height: 540 },
  frameRange: { in: 0, out: 50 },
  editorBackdrop: 'transparent',
  layers: [
    {
      id: 'cl',
      name: 'l',
      visible: true,
      locked: false,
      blendMode: 'normal',
      children: [
        el('video-placeholder', 'plate', box(40, 40, 880, 400), { routeKey: 'guest-1', zIndex: 1 }),
      ],
    },
  ],
  fields: [],
  bindings: [],
};

function sceneWith(children: Element[], over: Partial<Scene> = {}): Scene {
  return {
    schemaVersion: 1,
    id: 's',
    name: 's',
    templateType: 'custom',
    resolution: { width: 1920, height: 1080 },
    frameRate: 50,
    safeAreas: { title: 10, action: 5 },
    frameRange: { in: 0, out: 50 },
    editorBackdrop: 'transparent',
    layers: [
      { id: 'L1', name: 'main', visible: true, locked: false, blendMode: 'normal', children },
    ],
    fonts: [],
    fields: [],
    bindings: [],
    ...over,
  } as unknown as Scene;
}

const ARRANGEMENTS = [
  {
    id: 'a2',
    name: 'two-box',
    cells: [
      { x: 0, y: 270, width: 960, height: 540 },
      { x: 960, y: 270, width: 960, height: 540 },
    ],
    isDefault: true,
    transition: { mode: 'move', durationMs: 400, easing: 'linear' },
  },
  {
    id: 'a1',
    name: 'one-box',
    cells: [{ x: 480, y: 270, width: 960, height: 540 }],
    isDefault: true,
    transition: { mode: 'cut' },
  },
];

describe('5.2 — collectArrangements', () => {
  it('a scene with no arrangements yields an EMPTY list, never an absent one', () => {
    // The empty/absent distinction is the same one `sources` carries: EMPTY is the positive
    // statement "this template has none", ABSENT means "imported before this existed".
    expect(collectArrangements(sceneWith([]))).toEqual([]);
  });

  it('the cells, the default flag and the transition all reach the runtime', () => {
    const scene = sceneWith([], { arrangements: ARRANGEMENTS } as unknown as Partial<Scene>);
    const out = collectArrangements(scene);
    expect(out.map((a) => a.name)).toEqual(['two-box', 'one-box']);
    expect(out[0]?.cells).toHaveLength(2);
    expect(out[0]?.cells[1]).toEqual({ x: 960, y: 270, width: 960, height: 540 });
    expect(out[0]?.transition).toEqual({ mode: 'move', durationMs: 400, easing: 'linear' });
    expect(out[1]?.transition).toEqual({ mode: 'cut' });
  });

  it('⚠ the per-element VISIBILITY map is deliberately NOT sent — the bridge neither paints nor punches', () => {
    const scene = sceneWith([], {
      arrangements: [{ ...ARRANGEMENTS[1], visibility: { 'bg-a': true } }],
    } as unknown as Partial<Scene>);
    expect(collectArrangements(scene)[0]).not.toHaveProperty('visibility');
  });
});

describe('5.2 — boxRelativeRect: where the plate sits INSIDE its box', () => {
  it('a plate inside a box instance reports its rect as fractions of the box', () => {
    const instance = el('composition', 'box-1', box(0, 270, 960, 540), {
      compositionId: 'comp-box',
    });
    const scene = sceneWith([instance], { compositions: [BOX_COMP] } as unknown as Partial<Scene>);
    const [decl] = collectLiveSources(scene);

    // The instance is 960×540 rendering a 960×540 comp, so the inner scale is 1:1 and the
    // plate's scene rect is the comp rect offset by the instance origin.
    expect(decl?.rect).toEqual({ x: 40, y: 310, width: 880, height: 400 });
    // …and the SAME plate, as a fraction of its box: 40/960, 40/540, 880/960, 400/540.
    expect(decl?.boxRelativeRect?.x).toBeCloseTo(40 / 960, 9);
    expect(decl?.boxRelativeRect?.y).toBeCloseTo(40 / 540, 9);
    expect(decl?.boxRelativeRect?.width).toBeCloseTo(880 / 960, 9);
    expect(decl?.boxRelativeRect?.height).toBeCloseTo(400 / 540, 9);
  });

  it('🔴 the fraction is ARRANGEMENT-INDEPENDENT: composing it with a cell gives the plate in that cell', () => {
    const instance = el('composition', 'box-1', box(0, 270, 960, 540), {
      compositionId: 'comp-box',
    });
    const scene = sceneWith([instance], {
      compositions: [BOX_COMP],
      arrangements: ARRANGEMENTS,
    } as unknown as Partial<Scene>);
    const [decl] = collectLiveSources(scene);
    const rel = decl?.boxRelativeRect;
    if (rel === undefined) throw new Error('no boxRelativeRect');

    // This IS the composition the bridge does at reconcile time (`tasks.md` 6.4), spelled out
    // once here so the carrier's contract is pinned rather than described.
    const cell = collectArrangements(scene)[0]?.cells[1];
    if (cell === undefined) throw new Error('no cell');
    expect({
      x: cell.x + rel.x * cell.width,
      y: cell.y + rel.y * cell.height,
      width: rel.width * cell.width,
      height: rel.height * cell.height,
    }).toEqual({ x: 1000, y: 310, width: 880, height: 400 });
  });

  it('an ordinary top-level plate has NO box, so no fraction — every template today', () => {
    const scene = sceneWith([
      el('video-placeholder', 'plain', box(200, 150, 640, 360), { routeKey: 'guest-1' }),
    ]);
    const [decl] = collectLiveSources(scene);
    expect(decl?.rect).toEqual({ x: 200, y: 150, width: 640, height: 360 });
    expect(decl?.boxRelativeRect).toBeUndefined();
  });
});

describe('5.2 — buildTemplateLiveSources assembles the whole block in one place', () => {
  it('every field is emitted, including EMPTY arrangements — absence must stay meaningful', () => {
    const built = buildTemplateLiveSources(sceneWith([]));
    expect(built.sources).toEqual([]);
    expect(built.arrangements).toEqual([]);
    expect(built.resolution).toEqual({ width: 1920, height: 1080 });
    expect(built.defaultPosition).toBeDefined();
  });
});
