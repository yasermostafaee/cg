import { describe, expect, it } from 'vitest';
import type { Element, Scene } from '@cg/shared-schema';
import { liveSourceIssues } from '../src/renderer/state/live-source-preflight.js';

/**
 * ⭐ **`B-180` — TWO FLUSH PLATES MUST NOT REPORT AN OVERLAP ONCE THE FLATTENER HAS DIVIDED.**
 *
 * 🔴 **The fixture is the test, and finding one that really drifts took measuring.** `B-180`
 * establishes that every existing boundary test runs at `preScale` 1, scale 1, anchor 0, integer
 * positions — *"so none can produce residue and none can see this class."* A fixture that cannot
 * manufacture residue cannot test this fix: it passes against the broken code and proves nothing.
 *
 * ⚠ **The first fixture written for this file was exactly that — it passed with the guard
 * DISABLED.** Two things were wrong with it, and both are worth recording because they are the
 * traps anyone re-deriving this will fall into:
 *
 * 1. **It reached the wrong predicate.** `liveSourceIssues`' per-document loop uses `overlaps`
 *    over `collectFlat`, and `collectFlat` descends into `container` and **never into a
 *    `composition` instance** (the module says so at its own call site). So a plate nested in a
 *    scaled instance is never compared to anything through that door, and `preScale` never
 *    reaches it. The copy a scaled instance DOES reach is `rectsOverlap`, in the per-ARRANGEMENT
 *    loop — hence the `arrangements` entry below, which is load-bearing and not decoration.
 * 2. **Its numbers did not drift.** With both edges reached by the same expression
 *    (`124 · preScale`) the two doubles come out bit-identical. Residue needs the two edges
 *    computed by DIFFERENT routes through `composeAffine` — one arriving as `(x + w)·s` and the
 *    other as `x′·s` through a differently-ordered product. `INSTANCE_W` and the plate
 *    coordinates below were found by probing the real flattener, not chosen for looking awkward.
 *
 * **Proof that this file discriminates:** with `rectsOverlap`'s guard reverted to a bare `<`, the
 * first test below reports `['a', 'b']` instead of `[]`. Measured, not assumed.
 */

const baseElProps = { opacity: 1, visible: true, locked: false, zIndex: 0 };
const tf = (x: number, y: number, w: number, h: number) => ({
  position: { x, y },
  size: { w, h },
  scale: { x: 1, y: 1 },
  rotation: 0,
  anchor: { x: 0, y: 0 },
});

const plate = (id: string, x: number, y: number, w: number, h: number): Element =>
  ({
    ...baseElProps,
    id,
    name: id,
    type: 'video-placeholder',
    transform: tf(x, y, w, h),
    routeKey: id,
  }) as unknown as Element;

/** A composition 1920 wide, holding whatever plates the case needs. */
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
 * The MEASURED instance width: 1234 wide for a 1920-wide composition ⇒ `preScale = 1234 / 1920`,
 * under which two plates abutting exactly at local `x = 350` flatten to `224.94791666666669` and
 * `224.94791666666666` — a 2.8e-14 px "overlap" nobody authored. The exact values are pinned in
 * `packages/shared-schema/tests/overlap-residue.test.ts`, next to the flattener that produces them.
 */
const INSTANCE_W = 1234;
const INSTANCE_H = (INSTANCE_W * 1080) / 1920;

const instance = (id: string, compId: string): Element =>
  ({
    ...baseElProps,
    id,
    name: id,
    type: 'composition',
    compositionId: compId,
    transform: tf(0, 0, INSTANCE_W, INSTANCE_H),
  }) as unknown as Element;

function scene(children: Element[], compositions: unknown[], arrangements: unknown[]): Scene {
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
      { id: 'L1', name: 'main', visible: true, locked: false, blendMode: 'normal', children },
    ],
    compositions,
    fonts: [],
    fields: [],
    bindings: [],
    arrangements,
  } as unknown as Scene;
}

const cut = { mode: 'cut' } as const;

/**
 * One box instance, one cell that is exactly where the instance already sits — so the arrangement
 * moves nothing and the ONLY arithmetic in play is the flattener's own `preScale` division. The
 * arrangement exists to reach `rectsOverlap`, not to add geometry of its own.
 */
const scaledInstance = (bx: number) =>
  scene(
    [instance('inst', 'box')],
    [comp('box', [plate('a', 100, 0, 250, 300), plate('b', bx, 0, 200, 300)])],
    [
      {
        id: 'a1',
        name: 'solo',
        cells: [{ x: 0, y: 0, width: INSTANCE_W, height: INSTANCE_H }],
        isDefault: true,
        transition: cut,
      },
    ],
  );

/** Every overlap complaint, deduplicated — a pair reported by two loops is still one collision. */
const overlapIds = (s: Scene): Set<string> =>
  new Set(
    liveSourceIssues(s)
      .filter((i) => i.code === 'live-source-overlap')
      .map((i) => i.elementId ?? ''),
  );

describe('B-180 — flush plates inside a SCALED instance (preScale ≠ 1)', () => {
  it('🔴 reports NO overlap — this is the case that was broken', () => {
    // Before the guard, the flattened right edge of `a` landed a fraction of a ULP past the left
    // edge of `b`, the strict `<` fired, and the Export went dead over geometry the author had
    // typed as flush integers — with the Inspector showing both numbers as the same "350".
    expect(overlapIds(scaledInstance(350))).toEqual(new Set());
  });

  it('…and a GENUINE 0.01 px overlap in the same scaled instance STILL fires', () => {
    /*
      The other end, and the assertion that stops the guard becoming a product tolerance. 0.01 px
      is far below anything visible, but it is ten orders of magnitude above the noise floor — a
      number someone computed, not dust — and `D-137`'s rule must still refuse it.
    */
    expect(overlapIds(scaledInstance(349.99))).toEqual(new Set(['a', 'b']));
  });

  it('a whole-pixel overlap in the same instance fires, obviously', () => {
    expect(overlapIds(scaledInstance(349))).toEqual(new Set(['a', 'b']));
  });
});

describe('B-180 — the same cases at preScale === 1, so the fix did not move the boundary', () => {
  /*
    The control. `B-180` says the strict `<` is CORRECT and is not the defect; the guard touches
    only the inputs. So the un-scaled behaviour these tests already pinned must be unchanged, and
    asserting it here — beside the scaled cases — is what proves the guard is a filter and not a
    loosening. These plates sit at the root, so they go through the OTHER designer copy of the
    predicate (`overlaps`, over `collectFlat`), which is the second of the three this guard now
    serves.
  */
  const unscaled = (bx: number) =>
    scene([plate('a', 0, 0, 124, 300), plate('b', bx, 0, 200, 300)], [], []);

  it('exactly flush is not an overlap', () => {
    expect(overlapIds(unscaled(124))).toEqual(new Set());
  });

  it('0.01 px of overlap is', () => {
    expect(overlapIds(unscaled(123.99))).toEqual(new Set(['a', 'b']));
  });

  it('1 px of overlap is — the owner’s own number', () => {
    expect(overlapIds(unscaled(123))).toEqual(new Set(['a', 'b']));
  });

  it('🔴 …but a value a PRE-FIX DRAG committed is filtered — the third copy, end to end', () => {
    /*
      The `overlaps` copy's own reachable residue, and the case half 2 exists for projects that
      were SAVED before half 1 landed.

      A free drag used to commit `startPos + clientDelta / scale` straight into `transform.position`
      — a division by an arbitrary zoom — so a box the author dragged flush against a neighbour's
      right edge at 124 was stored as 123.99999999999999. The Inspector rounds to 2 dp, so the row
      read "124"; `frameAabb` maps the stored value faithfully; the strict `<` fired; and the Export
      went dead over an overlap of 1.4e-14 px that the author could neither see nor correct.

      Half 1 stops NEW drags producing it. This assertion is what makes an existing project openable
      again — and it goes through `overlaps`/`collectFlat`, the third of the three copies, which the
      scaled-instance cases above cannot reach (that path never descends into an instance).
    */
    expect(overlapIds(unscaled(123.99999999999999))).toEqual(new Set());
  });
});
