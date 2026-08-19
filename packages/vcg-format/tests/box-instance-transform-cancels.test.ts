import { describe, expect, it } from 'vitest';
import type { Element, Scene } from '@cg/shared-schema';
import { collectLiveSources } from '../src/live-sources.js';

/**
 * 🔴 **`D-154` — THE INSTANCE'S AUTHORED X/Y/W/H CANCELS OUT OF THE EXPORTED HOLE.**
 *
 * This is the fact the whole item rests on, and it is pinned here so the next reader neither
 * re-derives it nor "fixes" the cancellation as if it were a bug.
 *
 * ```
 * plate.scene   = instance.pos + plate.local × preScale,  preScale = instance.size / comp.resolution
 * boxRelative.x = (plate.scene.x − instance.x) / instance.width = plate.local.x / comp.width
 * boxRelative.w =  plate.scene.width / instance.width          = plate.local.w / comp.width
 * ```
 *
 * ⚠ **The discriminating case is a NON-UNIT `preScale`.** With an instance the same size as
 * its composition, `preScale = 1` and the cancellation is invisible — every arrangement of
 * the algebra agrees. So each test below instances the SAME 960×540 composition at a
 * DIFFERENT size and position, and requires identical output.
 *
 * ⇒ The consequence, and the reason the Designer changed: a box instance's authored
 * transform reaches air through NO route. It survives only as the "As authored" preview.
 */

const box = (x: number, y: number, w: number, h: number) => ({
  position: { x, y },
  size: { w, h },
  scale: { x: 1, y: 1 },
  rotation: 0,
  anchor: { x: 0, y: 0 },
});
const base = { opacity: 1, visible: true, locked: false };
const el = (type: string, id: string, t: ReturnType<typeof box>, over = {}): Element =>
  ({ ...base, id, name: id, type, transform: t, zIndex: 0, ...over }) as unknown as Element;

/** A 960×540 box composition whose plate sits at (120, 60) and is 720×405. */
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
      children: [el('video-placeholder', 'plate', box(120, 60, 720, 405), { routeKey: 'guest-1' })],
    },
  ],
  fields: [],
  bindings: [],
};

function sceneWithInstance(t: ReturnType<typeof box>): Scene {
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
        name: 'm',
        visible: true,
        locked: false,
        blendMode: 'normal',
        children: [el('composition', 'inst', t, { compositionId: 'comp-box' })],
      },
    ],
    compositions: [BOX_COMP],
    fonts: [],
    fields: [],
    bindings: [],
  } as unknown as Scene;
}

/** The algebra's prediction: the plate's rect as a fraction of the COMPOSITION's resolution. */
const PREDICTED = {
  x: 120 / 960,
  y: 60 / 540,
  width: 720 / 960,
  height: 405 / 540,
};

describe('D-154 — a box instance transform cancels out of boxRelativeRect', () => {
  it('the identity case: instance the same size as its composition', () => {
    const [decl] = collectLiveSources(sceneWithInstance(box(0, 0, 960, 540)));
    expect(decl?.boxRelativeRect).toEqual(PREDICTED);
  });

  it('🔴 MOVED — a different position gives the SAME fractions', () => {
    const [decl] = collectLiveSources(sceneWithInstance(box(437, 291, 960, 540)));
    expect(decl?.boxRelativeRect).toEqual(PREDICTED);
  });

  it('🔴 RESIZED — a NON-UNIT preScale gives the SAME fractions (the discriminating case)', () => {
    // 480×270 instance of a 960×540 comp ⇒ preScale 0.5. If the instance's size did NOT
    // cancel, every number below would halve.
    const [decl] = collectLiveSources(sceneWithInstance(box(0, 0, 480, 270)));
    expect(decl?.boxRelativeRect).toEqual(PREDICTED);
  });

  it('🔴 MOVED AND RESIZED, non-uniformly — still the same fractions', () => {
    // Different scale on each axis, at an arbitrary offset: nothing about the instance
    // survives into the exported hole.
    const [decl] = collectLiveSources(sceneWithInstance(box(1013, 77, 1440, 270)));
    expect(decl?.boxRelativeRect).toEqual(PREDICTED);
  });

  it('…while the SCENE rect does track the instance — the control for all four', () => {
    // Proves the four `toEqual`s above are reporting a real cancellation rather than a
    // derivation that ignores the instance entirely. The absolute rect moves; the fraction
    // does not.
    const a = collectLiveSources(sceneWithInstance(box(0, 0, 960, 540)))[0]?.rect;
    const b = collectLiveSources(sceneWithInstance(box(437, 291, 960, 540)))[0]?.rect;
    expect(a).not.toEqual(b);
    expect(b?.x).toBe(437 + 120);
  });

  it('⇒ the plate rect at air is the CELL × the fraction — the instance never enters it', () => {
    // The composition the bridge performs at reconcile time (`tasks.md` 6.4). Two very
    // different instances, one cell: one answer.
    const cell = { x: 960, y: 0, width: 960, height: 1080 };
    const holeFor = (t: ReturnType<typeof box>) => {
      const rel = collectLiveSources(sceneWithInstance(t))[0]?.boxRelativeRect;
      if (rel === undefined) throw new Error('no boxRelativeRect');
      return {
        x: cell.x + rel.x * cell.width,
        y: cell.y + rel.y * cell.height,
        width: rel.width * cell.width,
        height: rel.height * cell.height,
      };
    };
    expect(holeFor(box(0, 0, 960, 540))).toEqual(holeFor(box(1013, 77, 1440, 270)));
  });
});
