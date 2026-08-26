import { describe, expect, it } from 'vitest';
import type { Element, Scene } from '../src/index.js';
import { flattenElements, sceneMaskHoles } from '../src/index.js';

/**
 * ⭐ **`B-180` — THE RESIDUE, THROUGH THE REAL FLATTENER, END TO END.**
 *
 * 🔴 **The fixture is the test.** `B-180` establishes that every existing boundary test runs at
 * `preScale` 1, scale 1, anchor 0, integer positions — *"so none can produce residue and none can
 * see this class."* A fixture that cannot manufacture residue cannot test this fix and would pass
 * against the broken code.
 *
 * ⚠ **Getting one right took measuring, and the first attempt was wrong.** A composition instance
 * alone is not enough: with both edges reached by the same expression (`124 * preScale`), the two
 * doubles come out bit-identical and nothing drifts. The residue needs the two edges computed by
 * DIFFERENT routes through `composeAffine` — which is what a non-integer `preScale` plus a plate
 * whose own `x` is non-zero produces, because one edge arrives as `(x + w) · s` and the other as
 * `x' · s` through a differently-ordered product.
 *
 * The values below were measured, not guessed. See the first test.
 */

const base = { opacity: 1, visible: true, locked: false, zIndex: 0 };
const tf = (x: number, y: number, w: number, h: number) => ({
  position: { x, y },
  size: { w, h },
  scale: { x: 1, y: 1 },
  rotation: 0,
  anchor: { x: 0, y: 0 },
});

const plate = (id: string, x: number, y: number, w: number, h: number): Element =>
  ({
    ...base,
    id,
    name: id,
    type: 'video-placeholder',
    routeKey: id,
    transform: tf(x, y, w, h),
  }) as unknown as Element;

const backdrop = (id: string): Element =>
  ({
    ...base,
    id,
    name: id,
    type: 'shape',
    shape: 'rectangle',
    fill: { kind: 'solid', color: '#101820' },
    transform: tf(0, 0, 1920, 1080),
    zIndex: -1,
  }) as unknown as Element;

const comp = (id: string, children: Element[]) => ({
  id,
  name: id,
  resolution: { width: 1920, height: 1080 },
  frameRange: { in: 0, out: 50 },
  editorBackdrop: 'transparent',
  layers: [
    { id: `${id}-l`, name: 'l', visible: true, locked: false, blendMode: 'normal', children },
  ],
  fields: [],
  bindings: [],
});

/**
 * The MEASURED instance width. 1234 wide for a 1920-wide composition ⇒
 * `preScale = 1234 / 1920`, under which two plates that abut exactly at local x = 350 flatten to
 * `224.94791666666669` and `224.94791666666666` — a 2.84e-14 px "overlap" nobody authored.
 */
const INSTANCE_W = 1234;
const instance = (id: string, compId: string): Element =>
  ({
    ...base,
    id,
    name: id,
    type: 'composition',
    compositionId: compId,
    transform: tf(0, 0, INSTANCE_W, (INSTANCE_W * 1080) / 1920),
  }) as unknown as Element;

function scene(rootChildren: Element[], compositions: unknown[]): Scene {
  return {
    schemaVersion: 1,
    id: 'scene-b180',
    name: 'b180',
    templateType: 'custom',
    resolution: { width: 1920, height: 1080 },
    frameRate: 50,
    safeAreas: { title: 10, action: 5 },
    frameRange: { in: 0, out: 50 },
    editorBackdrop: 'transparent',
    layers: [
      {
        id: 'L1',
        name: 'm',
        visible: true,
        locked: false,
        blendMode: 'normal',
        children: rootChildren,
      },
    ],
    compositions,
    fonts: [],
    fields: [],
    bindings: [],
  } as unknown as Scene;
}

/** Two plates abutting EXACTLY at local x = 350, inside the scaled instance. */
const flushInScaledInstance = (bx = 350) =>
  scene(
    [backdrop('bg'), instance('inst', 'box')],
    [comp('box', [plate('a', 100, 0, 250, 300), plate('b', bx, 0, 200, 300)])],
  );

const flatRect = (s: Scene, id: string) =>
  flattenElements(s, 'document').find((f) => f.element.id === id)?.rect;

describe('B-180 — the fixture really does manufacture residue', () => {
  it('🔴 two EXACTLY flush plates flatten to edges that differ by 2.84e-14 px', () => {
    /*
      Asserted first and by VALUE, because everything below rests on it. If the flattener's
      arithmetic ever stops drifting here, the guard tests would pass for the wrong reason and
      nothing would be testing the fix — which is precisely how this class escaped the existing
      boundary tests.
    */
    const s = flushInScaledInstance();
    const a = flatRect(s, 'a');
    const b = flatRect(s, 'b');
    expect(a).toBeDefined();
    expect(b).toBeDefined();
    const aMaxX = (a?.x ?? 0) + (a?.width ?? 0);
    expect(aMaxX).toBe(224.94791666666669);
    expect(b?.x).toBe(224.94791666666666);
    // The raw operator therefore says these overlap …
    expect(b?.x ?? 0).toBeLessThan(aMaxX);
    // … by 2.842170943040401e-14 px, which is 13 orders of magnitude below one pixel. Pinned as
    // an exact value rather than "close to": at this magnitude `toBeCloseTo`'s absolute tolerance
    // is meaningless, and the point is that the number is a specific artefact of the arithmetic.
    expect(aMaxX - (b?.x ?? 0)).toBe(2.842170943040401e-14);
  });
});

describe('B-180 — the guard, through sceneMaskHoles’ own predicate', () => {
  /*
    `sceneMaskHoles` decides which elements a plate punches a hole through, using the THIRD copy
    of the overlap predicate (`intersects` in `scene-flatten.ts`). It is the copy reachable with
    nothing but a scene, so it is where the guard is proved end to end.

    ⚠ **The assertion has to be plate-vs-PLATE, and the first draft of this file got that wrong.**
    It asserted that a backdrop under both plates is punched twice — which is true with the guard
    and true without it, because the backdrop lies under each plate independently and the residue
    between `a` and `b` cannot change that. Measured: that version passed with the guard disabled.
    What the residue actually decides is whether `b` — above `a` in document order — punches a
    spurious hole through `a` itself. With the guard reverted to a bare `<`, the first test below
    finds a hole keyed `inst/a` where there must be none.
  */
  it('🔴 flush plates do NOT mask each other — this is the case that was broken', () => {
    const holes = sceneMaskHoles(flushInScaledInstance());
    expect(holes.get('inst/a')).toBeUndefined();
    // The POSITIVE CONTROL for that absence. `undefined` on its own is also what a walk that
    // silently found no plates would return, and a fixture that quietly stopped reaching the
    // predicate would read as a pass forever. The backdrop lies under both plates, so it must be
    // punched TWICE — proof the machinery ran and that the one absence above is a real answer.
    expect(holes.get('bg')).toHaveLength(2);
  });

  it('🔴 a GENUINE 0.01 px overlap in the same scaled instance IS still seen', () => {
    // The control that makes the assertion above mean something, and the one that turns red if
    // the guard is ever "simplified" into a pixel figure. 0.01 px is ten orders of magnitude
    // above the noise floor: a number someone computed, not dust.
    const holes = sceneMaskHoles(flushInScaledInstance(349.99));
    // Keys are path-prefixed inside a composition instance, so `a` is `inst/a`.
    expect(holes.get('inst/a')).toHaveLength(1);
  });

  it('EXACTLY flush is still not an overlap, at preScale 1', () => {
    const s = scene([backdrop('bg'), plate('a', 0, 0, 100, 100), plate('b', 100, 0, 100, 100)], []);
    expect(sceneMaskHoles(s).get('a')).toBeUndefined();
  });

  it('…and at preScale 1 a 0.01 px overlap is, so the boundary itself did not move', () => {
    const s = scene(
      [backdrop('bg'), plate('a', 0, 0, 100, 100), plate('b', 99.99, 0, 100, 100)],
      [],
    );
    // `b` is above `a` in document order, so `a` is masked by `b` exactly when they intersect.
    expect(sceneMaskHoles(s).get('a')).toHaveLength(1);
  });
});
