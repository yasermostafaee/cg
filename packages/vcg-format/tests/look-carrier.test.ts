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

const plate = (id: string, routeKey: string, x: number, y: number, w: number, h: number): Element =>
  ({
    ...baseElProps,
    id,
    name: id,
    type: 'video-placeholder',
    transform: tf(x, y, w, h),
    routeKey,
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
    bindings: [],
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

/** Two looks + a root plate: the dedup, absence and empty-look contracts. */
function twoLookScene(over: { sources?: unknown[]; rootExtra?: Element[] } = {}): Scene {
  return scene({
    rootChildren: [
      instance('inst-a', 'comp-a', 0, 0, 1920, 1080),
      instance('inst-b', 'comp-solo', 0, 0, 1920, 1080),
      instance('inst-empty', 'comp-empty', 0, 0, 1920, 1080),
      ...(over.rootExtra ?? []),
    ],
    compositions: [
      comp('comp-a', [
        plate('a-1', 'guest-1', 0, 0, 640, 360),
        plate('a-2', 'guest-2', 960, 0, 640, 360),
      ]),
      SOLO_COMP,
      comp('comp-empty', []),
    ],
    lookGroups: [
      {
        id: 'g1',
        sources: over.sources ?? [
          { routeKey: 'guest-1', dynamic: false },
          { routeKey: 'guest-2', expectedAspect: 16 / 9, dynamic: true },
        ],
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

  it('expectedAspect and dynamic come from the GROUP declaration, not from any plate element', () => {
    const carrier = collectLookCarrier(twoLookScene());
    const guest2 = carrier?.sources.find((d) => d.sourceId === 'guest-2');
    expect(guest2?.expectedAspect).toBeCloseTo(16 / 9);
    expect(guest2?.dynamic).toBe(true);
  });

  it('a declared source REFERENCED NOWHERE yields no declaration — an unplaced source cannot be shown', () => {
    const s = twoLookScene({
      sources: [
        { routeKey: 'guest-1', dynamic: false },
        { routeKey: 'guest-2', dynamic: false },
        { routeKey: 'never-placed', dynamic: false },
      ],
    });
    expect(collectLookCarrier(s)?.sources.map((d) => d.sourceId)).toEqual(['guest-1', 'guest-2']);
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

  it('an UNDECLARED plate is skipped at import — the preflight refuses it at export, import stays tolerant', () => {
    const s = twoLookScene({ sources: [{ routeKey: 'guest-1', dynamic: false }] });
    expect('guest-2' in rectsOf(s, 'look-a')).toBe(false);
    expect(collectLookCarrier(s)?.sources.map((d) => d.sourceId)).toEqual(['guest-1']);
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
