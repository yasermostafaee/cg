import { describe, expect, it } from 'vitest';
import type { Transform } from '../src/primitives.js';
import type { Element } from '../src/elements.js';
import type { LiveSourceRect } from '../src/live-source.js';
import type { Scene } from '../src/scene.js';
import { intersectPunches, sceneMaskHoles } from '../src/scene-flatten.js';

/**
 * 🔴 **`SKEW-INTERSECT-01` — THE TRANSITION MASK: `outgoing ∩ entering`, and the ONE property
 * that makes it worth having.**
 *
 * A look switch is two mutations on two machines, and `SKEW-RESIDUE-01` measured that they
 * still land up to a field apart after `B-174`'s hold. What is on screen in that field depends
 * entirely on which hole set is open:
 *
 * - the ENTERING look's holes over the OUTGOING look's fills — a hole the outgoing geometry
 *   does not fill is **the channel**: black, in the shape of the box that arrived;
 * - the OUTGOING look's holes over the ENTERING look's fills — a hole the entering geometry
 *   does not fill is **the channel** again, in the shape of the box that left. On the owner's
 *   own template that second one is nearly the whole frame, because `look-1` is a single
 *   1920×1080 plate: every switch into or out of it opens or closes a FULL-FRAME hole.
 *
 * The intersection is the one hole set that is safe on BOTH sides of the mixer's move, and
 * that is what these tests assert — not a shape, a SUBSET RELATION. The union was the other
 * candidate and is the exact inverse: it opens every pixel either look punches, so it is the
 * two failures above at once. It is recorded here so it is not revived.
 */

const box = (x: number, y: number, w: number, h: number): Transform => ({
  position: { x, y },
  size: { w, h },
  scale: { x: 1, y: 1 },
  rotation: 0,
  anchor: { x: 0, y: 0 },
});

const base = { opacity: 1, visible: true, locked: false };

const plate = (id: string, t: Transform, zIndex = 0): Element =>
  ({
    ...base,
    id,
    name: id,
    type: 'video-placeholder',
    routeKey: id,
    transform: t,
    zIndex,
  }) as unknown as Element;

const backdrop = (id: string, zIndex: number): Element =>
  ({
    ...base,
    id,
    name: id,
    type: 'shape',
    shape: 'rectangle',
    fill: { kind: 'solid', color: '#1040c0' },
    transform: box(0, 0, 1920, 1080),
    zIndex,
  }) as unknown as Element;

/** A look, as the page holds one: a full-frame container whose visibility is the flip. */
const look = (id: string, zIndex: number, plates: Element[]): Element =>
  ({
    ...base,
    id,
    name: id,
    type: 'container',
    transform: box(0, 0, 1920, 1080),
    zIndex,
    children: plates,
  }) as unknown as Element;

function sceneWith(children: Element[]): Scene {
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
    compositions: [],
    fonts: [],
    fields: [],
    bindings: [],
  } as unknown as Scene;
}

/**
 * 🔴 **THE OWNER'S OWN GEOMETRY, read off `tools/skew-harness/fixtures/owner/3-ghab.vcg`'s
 * `template.json` rather than invented.** `look-1` is ONE plate over the whole frame;
 * `look-2` is two boxes at his numbers. It is the shape that discriminates: two similarly
 * sized boxes cannot tell an intersection mask from an entering-look mask, which is why the
 * harness's original banner/column pair never saw this.
 */
const FULL: LiveSourceRect = { x: 0, y: 0, width: 1920, height: 1080 };
const BOX_LEFT: LiveSourceRect = { x: 23, y: 301, width: 916, height: 515 };
const BOX_RIGHT: LiveSourceRect = { x: 984, y: 301, width: 916, height: 515 };

const OWNER_SCENE = sceneWith([
  backdrop('bg', 0),
  look('look-1', 1, [plate('l1-full', box(FULL.x, FULL.y, FULL.width, FULL.height))]),
  look('look-2', 2, [
    plate('l2-left', box(BOX_LEFT.x, BOX_LEFT.y, BOX_LEFT.width, BOX_LEFT.height)),
    plate('l2-right', box(BOX_RIGHT.x, BOX_RIGHT.y, BOX_RIGHT.width, BOX_RIGHT.height)),
  ]),
]);

const only = (id: string): Record<string, boolean> => ({
  'look-1': id === 'look-1',
  'look-2': id === 'look-2',
});

/** Holes are returned in the target's LOCAL box; `bg` is at the origin, so local IS scene. */
const holesOn = (scene: Scene, view: Parameters<typeof sceneMaskHoles>[1]): LiveSourceRect[] =>
  (sceneMaskHoles(scene, view).get('bg') ?? []).map((h) => ({ ...h }));

const contains = (outer: LiveSourceRect, inner: LiveSourceRect): boolean =>
  inner.x >= outer.x - 1e-6 &&
  inner.y >= outer.y - 1e-6 &&
  inner.x + inner.width <= outer.x + outer.width + 1e-6 &&
  inner.y + inner.height <= outer.y + outer.height + 1e-6;

const area = (rects: readonly LiveSourceRect[]): number =>
  rects.reduce((sum, r) => sum + r.width * r.height, 0);

describe('SKEW-INTERSECT-01 — the transition mask', () => {
  it('ABSENT transitionFrom is byte-for-byte the mask that shipped', () => {
    // The whole compatibility claim in one line: everything below is reachable only through a
    // member no existing caller passes.
    expect(holesOn(OWNER_SCENE, { visibility: only('look-2') })).toEqual([BOX_LEFT, BOX_RIGHT]);
    expect(holesOn(OWNER_SCENE, { visibility: only('look-1') })).toEqual([FULL]);
  });

  it('EVERY transition hole lies inside a hole of BOTH looks — the whole guarantee', () => {
    // 🔴 The property, not the shape. A hole inside both looks' holes is backed by a picture
    // whether the fills have moved yet or not, which is the only reason this exists.
    for (const [from, to] of [
      ['look-1', 'look-2'],
      ['look-2', 'look-1'],
    ] as const) {
      const entering = holesOn(OWNER_SCENE, { visibility: only(to) });
      const outgoing = holesOn(OWNER_SCENE, { visibility: only(from) });
      const during = holesOn(OWNER_SCENE, {
        visibility: only(to),
        transitionFrom: only(from),
      });
      expect(during.length, `${from} → ${to} punches something`).toBeGreaterThan(0);
      for (const h of during) {
        expect(
          entering.some((e) => contains(e, h)),
          `${from}→${to}: ${JSON.stringify(h)} inside an ENTERING hole`,
        ).toBe(true);
        expect(
          outgoing.some((o) => contains(o, h)),
          `${from}→${to}: ${JSON.stringify(h)} inside an OUTGOING hole`,
        ).toBe(true);
      }
    }
  });

  it('switching OUT of the full-frame look punches the boxes, not the frame', () => {
    /*
      🔴 THE DISCRIMINATING CASE, and the one the owner sees. Entering `look-1` alone opens a
      1920×1080 hole; until the fills arrive, ~55 % of that hole has no picture behind it —
      the near-full-frame black flash he reports. The transition mask hands back `look-2`'s
      two boxes instead, which the OUTGOING fills already cover.
    */
    const during = holesOn(OWNER_SCENE, {
      visibility: only('look-1'),
      transitionFrom: only('look-2'),
    });
    expect(during).toEqual([BOX_LEFT, BOX_RIGHT]);
    expect(area(during)).toBeLessThan(area([FULL]) * 0.5);
  });

  it('switching INTO the full-frame look from the boxes is likewise the boxes', () => {
    // The other direction of the same pair: `look-1 ∩ anything` is that other look's own
    // boxes, because `look-1` covers the frame. Never empty on this template.
    expect(
      holesOn(OWNER_SCENE, { visibility: only('look-2'), transitionFrom: only('look-1') }),
    ).toEqual([BOX_LEFT, BOX_RIGHT]);
  });

  it('an EMPTY intersection leaves NO mask at all — not an empty one', () => {
    /*
      Two looks whose plates do not overlap. The element must come back with NO entry, because
      an entry with no holes and NO entry travel differently through the re-punch: the first
      would have to be spelled as "clear", and a mask left standing over a plate that is gone
      is a hole in a backdrop with nothing behind it. This is also the accepted appearance of
      the edge case — the template alone, every box gone, for as long as the window lasts.
    */
    const disjoint = sceneWith([
      backdrop('bg', 0),
      look('look-1', 1, [plate('left', box(0, 0, 800, 1080))]),
      look('look-2', 2, [plate('right', box(1000, 0, 900, 1080))]),
    ]);
    expect(holesOn(disjoint, { visibility: only('look-2') })).toHaveLength(1);
    const map = sceneMaskHoles(disjoint, {
      visibility: only('look-2'),
      transitionFrom: only('look-1'),
    });
    expect(map.has('bg')).toBe(false);
  });

  it('a transitionFrom naming a state with no plates punches nothing', () => {
    // Not a special case — it is the empty intersection reached from the other side, and it
    // must not fall back to the entering look's holes.
    const map = sceneMaskHoles(OWNER_SCENE, {
      visibility: only('look-2'),
      transitionFrom: { 'look-1': false, 'look-2': false },
    });
    expect(map.has('bg')).toBe(false);
  });

  it('the UNION is what this is not: it would open a hole neither fill covers', () => {
    /*
      ⚠ Recorded as a TEST so the idea cannot come back as a suggestion. The union of the
      owner's two looks is the full frame — precisely the hole set that shows the channel for
      a field in the `look-2 → look-1` direction. The intersection's area is strictly smaller
      than either look's own, which is the arithmetic that makes it safe.
    */
    const during = holesOn(OWNER_SCENE, {
      visibility: only('look-1'),
      transitionFrom: only('look-2'),
    });
    const unionArea = area([FULL]);
    expect(area(during)).toBeLessThan(unionArea);
    expect(area(during)).toBeLessThanOrEqual(
      area(holesOn(OWNER_SCENE, { visibility: only('look-2') })),
    );
  });
});

describe('SKEW-INTERSECT-01 — intersectPunches, as plain geometry', () => {
  it('is the union of the pairwise intersections', () => {
    expect(
      intersectPunches(
        [
          { x: 0, y: 0, width: 100, height: 100 },
          { x: 200, y: 0, width: 100, height: 100 },
        ],
        [{ x: 50, y: 50, width: 200, height: 200 }],
      ),
    ).toEqual([
      { x: 50, y: 50, width: 50, height: 50 },
      { x: 200, y: 50, width: 50, height: 50 },
    ]);
  });

  it('a touching edge is not an overlap', () => {
    expect(
      intersectPunches(
        [{ x: 0, y: 0, width: 100, height: 100 }],
        [{ x: 100, y: 0, width: 100, height: 100 }],
      ),
    ).toEqual([]);
  });

  it('either side empty is empty', () => {
    expect(intersectPunches([], [{ x: 0, y: 0, width: 10, height: 10 }])).toEqual([]);
    expect(intersectPunches([{ x: 0, y: 0, width: 10, height: 10 }], [])).toEqual([]);
  });
});
