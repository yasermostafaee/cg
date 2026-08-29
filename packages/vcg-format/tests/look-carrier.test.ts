import { describe, expect, it } from 'vitest';
import type { Element, Scene } from '@cg/shared-schema';
import { buildTemplateLiveSources, collectLookCarrier } from '../src/live-sources.js';

/**
 * `multibox-layout-switch` §14 (LOOKS) phase 1C — **the SOURCE-KEYED carrier.**
 *
 * One declaration per DECLARED source (dedup is what dissolves the double-seat, §14.3
 * claim 1), one `{routeKey → rect}` map per look, no zero-area entries ever, the empty
 * look valid.
 *
 * 🔴 **Axes discipline (D.4):** the per-look rect flows through the instance's ancestor
 * chain, so the fixture instances one composition FOUR ways — identity, MOVED only,
 * RESIZED only, and both — and each axis is asserted separately. Three defects in four
 * sessions came from suites thorough along one axis only.
 */

const baseElProps = { opacity: 1, visible: true, locked: false, zIndex: 0 };

const tf = (x: number, y: number, w: number, h: number) => ({
  position: { x, y },
  size: { w, h },
  scale: { x: 1, y: 1 },
  rotation: 0,
  anchor: { x: 0, y: 0 },
});

const plate = (
  id: string,
  routeKey: string,
  x: number,
  y: number,
  w: number,
  h: number,
  /** `B-178` — the AUTHOR's fit mode on the ELEMENT. Absent = authored nothing. */
  fitMode?: 'contain' | 'cover',
  /** `B-179` — the AUTHOR's expected aspect on the ELEMENT. Absent = asserted nothing. */
  expectedAspect?: number,
): Element =>
  ({
    ...baseElProps,
    id,
    name: id,
    type: 'video-placeholder',
    transform: tf(x, y, w, h),
    routeKey,
    ...(fitMode !== undefined ? { fitMode } : {}),
    ...(expectedAspect !== undefined ? { expectedAspect } : {}),
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

const instance = (
  id: string,
  compId: string,
  x: number,
  y: number,
  w: number,
  h: number,
): Element =>
  ({
    ...baseElProps,
    id,
    name: id,
    type: 'composition',
    compositionId: compId,
    transform: tf(x, y, w, h),
  }) as unknown as Element;

const cut = { mode: 'cut' } as const;
const look = (id: string, instanceId: string) => ({ id, name: id, instanceId, entered: cut });

function scene(options: {
  rootChildren: Element[];
  compositions: unknown[];
  lookGroups?: unknown[];
  /** `B-179` — `live-source-id` field bindings, which is where `dynamic` comes from. */
  bindings?: unknown[];
}): Scene {
  return {
    schemaVersion: 1,
    id: 'scene-1',
    name: 's',
    templateType: 'custom',
    resolution: { width: 1920, height: 1080 },
    frameRate: 50,
    safeAreas: { title: 10, action: 5 },
    frameRange: { in: 0, out: 50 },
    editorBackdrop: 'transparent',
    layers: [
      {
        id: 'L1',
        name: 'main',
        visible: true,
        locked: false,
        blendMode: 'normal',
        children: options.rootChildren,
      },
    ],
    compositions: options.compositions,
    fonts: [],
    fields: [],
    bindings: options.bindings ?? [],
    ...(options.lookGroups !== undefined ? { lookGroups: options.lookGroups } : {}),
  } as unknown as Scene;
}

/** The shared solo composition: ONE plate at local (320, 180, 1280, 720). */
const SOLO_LOCAL = { x: 320, y: 180, w: 1280, h: 720 };
const SOLO_COMP = comp('comp-solo', [
  plate('solo-plate', 'guest-1', SOLO_LOCAL.x, SOLO_LOCAL.y, SOLO_LOCAL.w, SOLO_LOCAL.h),
]);

/**
 * Four instances of ONE composition, one per axis:
 * identity · MOVED only (+120, +60) · RESIZED only (×0.5) · both.
 */
function axesScene(): Scene {
  return scene({
    rootChildren: [
      instance('inst-id', 'comp-solo', 0, 0, 1920, 1080),
      instance('inst-moved', 'comp-solo', 120, 60, 1920, 1080),
      instance('inst-resized', 'comp-solo', 0, 0, 960, 540),
      instance('inst-both', 'comp-solo', 120, 60, 960, 540),
    ],
    compositions: [SOLO_COMP],
    lookGroups: [
      {
        id: 'g1',
        sources: [{ routeKey: 'guest-1', dynamic: false }],
        looks: [
          look('look-id', 'inst-id'),
          look('look-moved', 'inst-moved'),
          look('look-resized', 'inst-resized'),
          look('look-both', 'inst-both'),
        ],
        defaultLookId: 'look-id',
      },
    ],
  });
}

const rectsOf = (s: Scene, lookId: string): Record<string, unknown> => {
  const carrier = collectLookCarrier(s);
  if (carrier === null) throw new Error('no look carrier');
  const found = carrier.looks.find((l) => l.id === lookId);
  if (found === undefined) throw new Error(`no look ${lookId}`);
  return found.rects;
};

describe('the per-look rect flows through the instance chain — each axis separately (D.4)', () => {
  it('IDENTITY — the local rect verbatim', () => {
    expect(rectsOf(axesScene(), 'look-id')['guest-1']).toEqual({
      x: 320,
      y: 180,
      width: 1280,
      height: 720,
    });
  });

  it('🔴 MOVED ONLY — the offset lands, the size does not change', () => {
    expect(rectsOf(axesScene(), 'look-moved')['guest-1']).toEqual({
      x: 440,
      y: 240,
      width: 1280,
      height: 720,
    });
  });

  it('🔴 RESIZED ONLY — the preScale lands on position AND size, the origin does not move', () => {
    expect(rectsOf(axesScene(), 'look-resized')['guest-1']).toEqual({
      x: 160,
      y: 90,
      width: 640,
      height: 360,
    });
  });

  it('🔴 BOTH — offset and preScale compose', () => {
    expect(rectsOf(axesScene(), 'look-both')['guest-1']).toEqual({
      x: 280,
      y: 150,
      width: 640,
      height: 360,
    });
  });
});

/**
 * Two looks + a solo + an empty: the dedup, absence and empty-look contracts.
 *
 * 🔴 `B-188` — **THE GROUP DECLARES NOTHING.** `over.staleSources` exists to write the
 * RETIRED `sources` array into the fixture anyway, which is how a scene stored before this
 * change looks on disk. Every assertion that uses it asserts the same thing: it is ignored.
 */
function twoLookScene(
  over: {
    staleSources?: unknown[];
    rootExtra?: Element[];
    compA?: Element[];
    bindings?: unknown[];
  } = {},
): Scene {
  return scene({
    rootChildren: [
      instance('inst-a', 'comp-a', 0, 0, 1920, 1080),
      instance('inst-b', 'comp-solo', 0, 0, 1920, 1080),
      instance('inst-empty', 'comp-empty', 0, 0, 1920, 1080),
      ...(over.rootExtra ?? []),
    ],
    compositions: [
      comp(
        'comp-a',
        over.compA ?? [
          plate('a-1', 'guest-1', 0, 0, 640, 360),
          plate('a-2', 'guest-2', 960, 0, 640, 360),
        ],
      ),
      SOLO_COMP,
      comp('comp-empty', []),
    ],
    ...(over.bindings !== undefined ? { bindings: over.bindings } : {}),
    lookGroups: [
      {
        id: 'g1',
        ...(over.staleSources !== undefined ? { sources: over.staleSources } : {}),
        looks: [
          look('look-a', 'inst-a'),
          look('look-solo', 'inst-b'),
          look('look-empty', 'inst-empty'),
        ],
        defaultLookId: 'look-a',
      },
    ],
  });
}

describe('the source-keyed declaration list', () => {
  it('🔴 DEDUPED — guest-1 referenced in TWO looks is ONE declaration (the double-seat fix)', () => {
    const carrier = collectLookCarrier(twoLookScene());
    expect(carrier?.sources.map((s) => s.sourceId)).toEqual(['guest-1', 'guest-2']);
  });

  it('the declaration rect comes from the DEFAULT look; a source absent there falls back to the first look containing it', () => {
    const carrier = collectLookCarrier(twoLookScene());
    // guest-1 in the default look-a sits at (0,0,640,360) — NOT at the solo rect (320,180,…).
    expect(carrier?.sources[0]?.rect).toEqual({ x: 0, y: 0, width: 640, height: 360 });
    // Make guest-2 absent from the default: default = look-solo, which has no guest-2.
    const s = twoLookScene();
    const g = (s as unknown as { lookGroups: { defaultLookId: string }[] }).lookGroups[0];
    if (g !== undefined) g.defaultLookId = 'look-solo';
    const c2 = collectLookCarrier(s);
    expect(c2?.sources.find((d) => d.sourceId === 'guest-2')?.rect).toEqual({
      x: 960,
      y: 0,
      width: 640,
      height: 360,
    });
  });

  /**
   * 🔴 **`B-179` — THE AUTHOR'S ASPECT REACHES THE CARRIER NOW, AND THIS IS THE FIXTURE
   * THAT COULD NOT PASS BEFORE.**
   *
   * Both fields used to be read off the GROUP DECLARATION — `src.expectedAspect` and
   * `src.dynamic` — and NEITHER had a writer anywhere in the product, so every look-group
   * template exported no aspect at all and the take's mismatch refusal could not fire for the
   * product's flagship feature. They come off the plate ELEMENT now, through the same
   * `dynamicRoleIndex` the groupless path uses.
   */
  it('🔴 `B-179` — expectedAspect and dynamic come from the PLATE ELEMENT, not from any declaration', () => {
    const s = twoLookScene({
      compA: [
        plate('a-1', 'guest-1', 0, 0, 640, 360),
        plate('a-2', 'guest-2', 960, 0, 640, 360, undefined, 21 / 9),
      ],
      bindings: [
        { fieldId: 'f1', target: { kind: 'live-source-id', elementId: 'a-2', role: 'fill' } },
      ],
    });
    const carrier = collectLookCarrier(s);
    const guest2 = carrier?.sources.find((d) => d.sourceId === 'guest-2');
    expect(guest2?.expectedAspect).toBeCloseTo(21 / 9);
    expect(guest2?.dynamic).toBe(true);
    // The un-bound, un-asserting plate stays honest in BOTH fields — absent is a third state.
    const guest1 = carrier?.sources.find((d) => d.sourceId === 'guest-1');
    expect(guest1?.expectedAspect).toBeUndefined();
    expect(guest1?.dynamic).toBe(false);
  });

  /**
   * ⚠ The FIRST plate in document order wins, and it is the same element `elementId` names.
   *
   * The owner rejected `B-179`'s premise that an aspect is a per-FEED fact two looks may not
   * disagree about — _"aspect and fit are per-plate right now and have nothing to do with the
   * source"_ — so this is a RESOLUTION rule, not a refusal, and the carrier entry describes one
   * element rather than two halves of two.
   */
  it('two plates on one key with DIFFERENT aspects: the first in document order wins, and elementId names that same plate', () => {
    const s = twoLookScene({
      compA: [
        plate('a-1', 'guest-1', 0, 0, 640, 360, undefined, 16 / 9),
        plate('a-2', 'guest-1', 960, 0, 640, 360, undefined, 4 / 3),
      ],
    });
    const guest1 = collectLookCarrier(s)?.sources.find((d) => d.sourceId === 'guest-1');
    expect(guest1?.expectedAspect).toBeCloseTo(16 / 9);
    expect(guest1?.elementId).toBe('a-1');
  });

  it('🔴 `B-188` — a stale `sources` array naming a source NO PLATE USES is IGNORED, not carried', () => {
    const s = twoLookScene({
      staleSources: [
        { routeKey: 'guest-1', dynamic: false },
        { routeKey: 'guest-2', dynamic: false },
        { routeKey: 'never-placed', dynamic: false },
      ],
    });
    expect(collectLookCarrier(s)?.sources.map((d) => d.sourceId)).toEqual(['guest-1', 'guest-2']);
  });

  /**
   * 🔴 **THE ORDER RULE (`B-188` condition (b)) — DOCUMENT ORDER OF FIRST USE, asserted
   * against a stale declaration that says the OPPOSITE.**
   *
   * The old carrier followed the author's declaration order. A fixture whose stale array lists
   * `guest-2` first therefore discriminates: if anything still read that field the order would
   * flip, and no other assertion in this file would notice.
   */
  it('🔴 the order is DOCUMENT ORDER OF FIRST USE — a stale declaration in the opposite order changes nothing', () => {
    const s = twoLookScene({
      staleSources: [
        { routeKey: 'guest-2', dynamic: false },
        { routeKey: 'guest-1', dynamic: false },
      ],
    });
    expect(collectLookCarrier(s)?.sources.map((d) => d.sourceId)).toEqual(['guest-1', 'guest-2']);
  });
});

/**
 * ⭐ **`B-178` — THE FIT MODE IS PER LOOK, AND IT COMES OFF THE PLATE ELEMENT.**
 *
 * 🔴 **THE FIXTURE IS THE TEST.** `C-028` shipped with the mode read off the GROUP DECLARATION
 * (`LookSource.fitMode`) — a field no code in the product ever wrote — so every plate of every
 * look-group template went to air on the `contain` default however the author had set it. The
 * owner put two plates side by side, one `contain` and one `cover`, and BOTH rendered `contain`.
 *
 * Nothing caught it because no test ever set a fit mode on a scene that HAD a look group: the one
 * `C-028` carrier test exercises `collectLiveSources`, the no-look path, where the field was read
 * off the element and worked. **A fixture without a look group cannot see this bug.** That is
 * precisely how it shipped, and it is why these tests build the look group first and the
 * assertion second.
 */
describe('B-178 — per-look fit modes, from the plate ELEMENT', () => {
  /** Two plates in ONE look, authored DIFFERENTLY. The discriminating fixture. */
  function twoModesInOneLook(): Scene {
    return scene({
      rootChildren: [instance('inst-a', 'comp-a', 0, 0, 1920, 1080)],
      compositions: [
        comp('comp-a', [
          plate('a-1', 'guest-1', 0, 0, 640, 360, 'contain'),
          plate('a-2', 'guest-2', 960, 0, 640, 360, 'cover'),
        ]),
      ],
      lookGroups: [
        {
          id: 'g1',
          sources: [
            { routeKey: 'guest-1', dynamic: false },
            { routeKey: 'guest-2', dynamic: false },
          ],
          looks: [look('look-a', 'inst-a')],
          defaultLookId: 'look-a',
        },
      ],
    });
  }

  it('🔴 TWO plates in ONE look with DIFFERENT authored modes carry BOTH to the carrier', () => {
    const carrier = collectLookCarrier(twoModesInOneLook());
    const fits = carrier?.looks.find((l) => l.id === 'look-a')?.fits;
    // The whole bug, in one assertion: these were both `undefined` before, so the bridge
    // defaulted both to `contain` and the two plates rendered identically on air.
    expect(fits).toEqual({ 'guest-1': 'contain', 'guest-2': 'cover' });
  });

  it('🔴 ONE source in TWO looks can be fitted DIFFERENTLY — the reason it is not per-source', () => {
    /*
      This is the case a per-source `fitMode` cannot express, and it is why `B-178` put the mode
      beside the per-look RECTS rather than on the declaration. `guest-1` appears in look-a in a
      640×360 box and in look-solo in a 1280×720 box; the author may reasonably want the wide box
      filled and the narrow one fitted whole. A single answer per source would be wrong in one of
      them by construction.
    */
    const s = scene({
      rootChildren: [
        instance('inst-a', 'comp-a', 0, 0, 1920, 1080),
        instance('inst-b', 'comp-solo', 0, 0, 1920, 1080),
      ],
      compositions: [
        comp('comp-a', [plate('a-1', 'guest-1', 0, 0, 640, 360, 'contain')]),
        comp('comp-solo', [plate('solo-1', 'guest-1', 320, 180, 1280, 720, 'cover')]),
      ],
      lookGroups: [
        {
          id: 'g1',
          sources: [{ routeKey: 'guest-1', dynamic: false }],
          looks: [look('look-a', 'inst-a'), look('look-solo', 'inst-b')],
          defaultLookId: 'look-a',
        },
      ],
    });
    const carrier = collectLookCarrier(s);
    expect(carrier?.looks.find((l) => l.id === 'look-a')?.fits).toEqual({ 'guest-1': 'contain' });
    expect(carrier?.looks.find((l) => l.id === 'look-solo')?.fits).toEqual({ 'guest-1': 'cover' });
    // …and the rects really do differ, so the two looks genuinely want different answers.
    expect(carrier?.looks.find((l) => l.id === 'look-a')?.rects['guest-1']).toEqual({
      x: 0,
      y: 0,
      width: 640,
      height: 360,
    });
    expect(carrier?.looks.find((l) => l.id === 'look-solo')?.rects['guest-1']).toEqual({
      x: 320,
      y: 180,
      width: 1280,
      height: 720,
    });
  });

  it('🔴 "NOBODY SAID" is an ABSENT entry, never a defaulted `contain`', () => {
    /*
      `B-178`'s second half. An unset field and a deliberate `contain` produce the same picture,
      so if the carrier wrote `contain` for both, nothing downstream could ever tell an author
      who was heard from one who was not — which is exactly the state that made this bug take a
      plant walk to diagnose.
    */
    const carrier = collectLookCarrier(twoLookScene());
    const fits = carrier?.looks.find((l) => l.id === 'look-a')?.fits;
    expect(fits).toEqual({});
    expect('guest-1' in (fits ?? {})).toBe(false);
  });

  it('an AUTHORED `contain` IS an entry — the other half of the same distinction', () => {
    const carrier = collectLookCarrier(twoModesInOneLook());
    const fits = carrier?.looks.find((l) => l.id === 'look-a')?.fits ?? {};
    expect('guest-1' in fits).toBe(true);
    expect(fits['guest-1']).toBe('contain');
  });

  it('the DECLARATION carries no fitMode at all — one fact, one home', () => {
    // A second home is how the two come to disagree. The declaration keeps `expectedAspect`
    // and `dynamic`; the mode lives only on the looks.
    const carrier = collectLookCarrier(twoModesInOneLook());
    for (const d of carrier?.sources ?? []) {
      expect(Object.keys(d)).not.toContain('fitMode');
    }
  });

  it('every look gets a fits map, including the EMPTY look', () => {
    // Structural mirror of `rects`: absent would make a reader branch on which kind of look it
    // is holding, which is the branch `lookPlateRects`'s own header forbids.
    const carrier = collectLookCarrier(twoLookScene());
    for (const l of carrier?.looks ?? []) expect(l.fits).toBeDefined();
    expect(carrier?.looks.find((l) => l.id === 'look-empty')?.fits).toEqual({});
  });
});

describe('per-look maps: absence is NO ENTRY, and the empty look is valid', () => {
  it('🔴 C.2 — a source absent from a look has NO entry, never a zero-area rect', () => {
    const rects = rectsOf(twoLookScene(), 'look-solo');
    expect('guest-2' in rects).toBe(false);
    expect(Object.values(rects).every((r) => (r as { width: number }).width > 0)).toBe(true);
  });

  it('C.3 — the EMPTY look carries an empty map: background alone', () => {
    expect(rectsOf(twoLookScene(), 'look-empty')).toEqual({});
  });

  it('a ROOT-LEVEL plate appears in the map of EVERY look — including the empty one', () => {
    const s = twoLookScene({
      sources: [
        { routeKey: 'guest-1', dynamic: false },
        { routeKey: 'guest-2', dynamic: false },
        { routeKey: 'presenter', dynamic: false },
      ],
      rootExtra: [plate('root-1', 'presenter', 1280, 720, 640, 360)],
    });
    for (const lookId of ['look-a', 'look-solo', 'look-empty']) {
      expect(rectsOf(s, lookId)['presenter']).toEqual({ x: 1280, y: 720, width: 640, height: 360 });
    }
  });

  /**
   * 🔴 **`B-188`'S DISCRIMINATING FIXTURE, AT THE CARRIER: a plate whose key is in no
   * declaration.**
   *
   * Under the old model this plate was skipped at import and refused at export
   * (`look-source-undeclared`). Under the new one it is an ORDINARY SOURCE, because the list IS
   * the plates. The stale array is written into the fixture deliberately: if any reader of it
   * survived anywhere, `guest-2` would vanish from both assertions below.
   */
  it('🔴 `B-188` — a plate the stale declaration OMITS is an ordinary source: it gets a rect AND a declaration', () => {
    const s = twoLookScene({ staleSources: [{ routeKey: 'guest-1', dynamic: false }] });
    expect('guest-2' in rectsOf(s, 'look-a')).toBe(true);
    expect(collectLookCarrier(s)?.sources.map((d) => d.sourceId)).toEqual(['guest-1', 'guest-2']);
  });
});

describe('buildTemplateLiveSources — the assembly, and the coexistence control', () => {
  it('with a group: SOURCE-KEYED sources + looks + defaultLookId ride the block', () => {
    const block = buildTemplateLiveSources(twoLookScene());
    expect(block.sources.map((s) => s.sourceId)).toEqual(['guest-1', 'guest-2']);
    expect(block.looks?.map((l) => l.id)).toEqual(['look-a', 'look-solo', 'look-empty']);
    expect(block.defaultLookId).toBe('look-a');
    expect(block.looks?.[0]?.entered).toEqual({ mode: 'cut' });
  });

  it('⚠ WITHOUT a group the legacy per-element path is untouched — coexistence, one session wide', () => {
    const s = scene({
      rootChildren: [
        plate('p-1', 'guest-1', 0, 0, 640, 360),
        plate('p-2', 'guest-1', 960, 0, 640, 360),
      ],
      compositions: [],
    });
    const block = buildTemplateLiveSources(s);
    // Two elements, same routeKey ⇒ TWO declarations: exactly the shipped behaviour (the
    // B-148 hazard), untouched for templates that have no multi-frame group.
    expect(block.sources).toHaveLength(2);
    expect(block.looks).toBeUndefined();
    expect(block.defaultLookId).toBeUndefined();
  });
});

describe('D.3 — the 6-box case: declarations are look-INDEPENDENT', () => {
  const sixBoxScene = (defaultLookId: string): Scene =>
    scene({
      rootChildren: [
        instance('inst-six', 'comp-six', 0, 0, 1920, 1080),
        instance('inst-solo', 'comp-solo6', 0, 0, 1920, 1080),
      ],
      compositions: [
        comp(
          'comp-six',
          [0, 1, 2, 3, 4, 5].map((i) =>
            plate(
              `six-p${String(i + 1)}`,
              `guest-${String(i + 1)}`,
              (i % 3) * 640,
              i < 3 ? 0 : 540,
              640,
              540,
            ),
          ),
        ),
        comp('comp-solo6', [plate('solo-p1', 'guest-1', 320, 180, 1280, 720)]),
      ],
      lookGroups: [
        {
          id: 'g1',
          sources: [0, 1, 2, 3, 4, 5].map((i) => ({
            routeKey: `guest-${String(i + 1)}`,
            dynamic: false,
          })),
          looks: [look('look-six', 'inst-six'), look('look-solo', 'inst-solo')],
          defaultLookId,
        },
      ],
    });

  it('🔴 SIX DECLARED ALWAYS — under either default, five of them absent from the solo map', () => {
    for (const dflt of ['look-six', 'look-solo']) {
      const carrier = collectLookCarrier(sixBoxScene(dflt));
      expect(carrier?.sources).toHaveLength(6);
      expect(Object.keys(rectsOfCarrier(carrier, 'look-six'))).toHaveLength(6);
      expect(Object.keys(rectsOfCarrier(carrier, 'look-solo'))).toEqual(['guest-1']);
    }
  });
});

function rectsOfCarrier(
  carrier: ReturnType<typeof collectLookCarrier>,
  lookId: string,
): Record<string, unknown> {
  const found = carrier?.looks.find((l) => l.id === lookId);
  if (found === undefined) throw new Error(`no look ${lookId}`);
  return found.rects;
}
