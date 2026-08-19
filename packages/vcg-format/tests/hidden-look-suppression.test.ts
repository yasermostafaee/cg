import { describe, expect, it } from 'vitest';
import type { Element, Scene } from '@cg/shared-schema';
import { sceneMaskHoles } from '@cg/shared-schema';
import { collectLookCarrier } from '../src/live-sources.js';

/**
 * 🔴 **THE PIN TEST AZ FOUND MISSING (`design.md` §14.3 claim 2): a plate inside a HIDDEN
 * COMPOSITION INSTANCE stops punching AND stays declared.**
 *
 * This is the single most load-bearing behaviour of the LOOKS model — "hidden look ⇒ its
 * plates stop punching, stay declared" is what the whole switch rests on — and until this
 * file it was verified by INSPECTION only: the flagship suppression test
 * (`shared-schema/tests/arrangements.test.ts`) hides a `container`, not a composition
 * instance, and A′'s `boxIdOf` notwithstanding, no test anywhere pinned the instance case.
 * It gets its own file, not a row in a matrix, so a regression here fails with this
 * sentence in the name.
 *
 * ⚠ The instance deliberately has a NON-IDENTITY transform (moved AND resized) — with an
 * identity instance a broken ancestor-chain composition is invisible (`D-154`'s lesson).
 */

const baseElProps = { opacity: 1, visible: true, locked: false };

const tf = (x: number, y: number, w: number, h: number) => ({
  position: { x, y },
  size: { w, h },
  scale: { x: 1, y: 1 },
  rotation: 0,
  anchor: { x: 0, y: 0 },
});

const el = (type: string, id: string, t: ReturnType<typeof tf>, over = {}): Element =>
  ({ ...baseElProps, id, name: id, type, transform: t, zIndex: 0, ...over }) as unknown as Element;

/** Full-frame backdrop under the instance — the thing holes are punched INTO. */
const BACKDROP = el('shape', 'backdrop', tf(0, 0, 1920, 1080), {
  shape: 'rectangle',
  fill: { kind: 'solid', color: '#d00000' },
  zIndex: 0,
});

/** The look composition: ONE plate at local (320, 180, 1280, 720). */
const LOOK_COMP = {
  id: 'comp-look',
  name: 'look',
  resolution: { width: 1920, height: 1080 },
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
        el('video-placeholder', 'plate-1', tf(320, 180, 1280, 720), { routeKey: 'guest-1' }),
      ],
    },
  ],
  fields: [],
  bindings: [],
};

/** The instance is MOVED (+120, +60) AND RESIZED (×0.5) — the discriminating transform. */
const INSTANCE_RECT = { x: 120, y: 60, w: 960, h: 540 };
/** plate scene rect = instance.pos + local × preScale(0.5). */
const EXPECTED_HOLE = {
  x: 120 + 320 * 0.5,
  y: 60 + 180 * 0.5,
  width: 1280 * 0.5,
  height: 720 * 0.5,
};

function scene(instanceOverrides: Record<string, unknown> = {}): Scene {
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
      {
        id: 'L1',
        name: 'main',
        visible: true,
        locked: false,
        blendMode: 'normal',
        children: [
          BACKDROP,
          el(
            'composition',
            'inst-look',
            tf(INSTANCE_RECT.x, INSTANCE_RECT.y, INSTANCE_RECT.w, INSTANCE_RECT.h),
            { compositionId: 'comp-look', zIndex: 10, ...instanceOverrides },
          ),
        ],
      },
    ],
    compositions: [LOOK_COMP],
    fonts: [],
    fields: [],
    bindings: [],
    lookGroups: [
      {
        id: 'g1',
        sources: [{ routeKey: 'guest-1', dynamic: false }],
        looks: [
          { id: 'look-1', name: 'look-1', instanceId: 'inst-look', entered: { mode: 'cut' } },
        ],
        defaultLookId: 'look-1',
      },
    ],
  } as unknown as Scene;
}

const backdropHoles = (s: Scene, view?: { visibility: Record<string, boolean> }) => {
  return sceneMaskHoles(s, view).get('backdrop') ?? [];
};

describe('a plate inside a HIDDEN composition instance stops punching AND stays declared', () => {
  it('POSITIVE CONTROL — visible instance: the plate punches at the chain-composed rect', () => {
    // If the instance transform were ignored, the hole would sit at (320,180,1280,720);
    // the assertion pins the composed (280,150,640,360).
    expect(backdropHoles(scene())).toEqual([EXPECTED_HOLE]);
  });

  it('🔴 the instance AUTHORED invisible ⇒ the plate punches NOTHING', () => {
    expect(backdropHoles(scene({ visible: false }))).toEqual([]);
  });

  it('🔴 the instance hidden by a VIEW (the runtime switch path) ⇒ the plate punches NOTHING', () => {
    expect(backdropHoles(scene(), { visibility: { 'inst-look': false } })).toEqual([]);
  });

  it('🔴 …and in BOTH hidden cases the source STAYS DECLARED, with its per-look rect intact', () => {
    for (const s of [scene({ visible: false }), scene()]) {
      const carrier = collectLookCarrier(s);
      expect(carrier?.sources.map((d) => d.sourceId)).toEqual(['guest-1']);
      expect(carrier?.looks[0]?.rects['guest-1']).toEqual(EXPECTED_HOLE);
    }
  });

  it('the PLATE own authored visible suppresses too — the third input axis, beside the two ancestor ones', () => {
    const s = scene();
    const comps = (s as unknown as { compositions: (typeof LOOK_COMP)[] }).compositions;
    const plate = comps[0]?.layers[0]?.children[0] as unknown as { visible: boolean };
    plate.visible = false;
    expect(backdropHoles(s)).toEqual([]);
  });
});
