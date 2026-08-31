import { SceneSchema, type Element, type Scene } from '@cg/shared-schema';
import {
  BANNER_RECTS,
  COLUMN_RECTS,
  LOOK_BANNER,
  LOOK_COLUMN,
  PLATE_A,
  PLATE_B,
  SKEW_SCENE,
  type Rect,
} from './geometry.js';

/**
 * `B-174` — **the harness scene: a painted background, two looks, two plates.**
 *
 * ── WHY IT IS AUTHORED HERE RATHER THAN EXPORTED FROM THE DESIGNER ──────────
 *
 * The measurement needs a layout chosen for what it makes VISIBLE (see `geometry.ts`), and
 * one whose numbers a test can hold to. A hand-drawn `.vcg` would put those numbers in a
 * binary nobody can diff, and the probe placement — the whole soundness of `k` — would stop
 * being checkable. Everything downstream of this function is the product's own code:
 * `buildTemplateLiveSources` derives the carrier, `@cg/template-runtime` renders and
 * repunches, and `CasparRuntime.setActiveLook` drives the switch.
 *
 * 🔴 **The background is a real painted element and that is load-bearing.** A live plate
 * paints NOTHING in `output` mode; what the operator sees around the boxes is the page.
 * `sceneMaskHoles` punches a hole through every element BELOW a plate in paint order that
 * its box intersects — so the full-bleed shape below both look instances is what carries
 * the holes, and probe B is watching that shape lose its pixels.
 */

const BASE = { opacity: 1, visible: true, locked: false, zIndex: 0 } as const;

function transform(r: Rect): Record<string, unknown> {
  return {
    position: { x: r.x, y: r.y },
    size: { w: r.width, h: r.height },
    scale: { x: 1, y: 1 },
    rotation: 0,
    anchor: { x: 0, y: 0 },
  };
}

/**
 * One plate. `fitMode: 'cover'` is deliberate and is what makes probe A work: under
 * `contain` the picture would be letterboxed inside its box and the margins would show the
 * page, so a probe inside the box could be looking at background rather than at picture.
 * Under `cover` the hole IS the box (`sceneMaskHoles`), and the box is filled edge to edge.
 */
function plate(id: string, routeKey: string, rect: Rect): Element {
  return {
    ...BASE,
    id,
    name: id,
    type: 'video-placeholder',
    transform: transform(rect),
    routeKey,
    fitMode: 'cover',
  } as unknown as Element;
}

function composition(id: string, rects: Readonly<Record<string, Rect>>): unknown {
  const children: Element[] = Object.entries(rects).map(([routeKey, rect]) =>
    plate(`${id}-${routeKey}`, routeKey, rect),
  );
  return {
    id,
    name: id,
    resolution: { width: SKEW_SCENE.width, height: SKEW_SCENE.height },
    frameRange: { in: 0, out: 50 },
    editorBackdrop: 'transparent',
    layers: [
      {
        id: `${id}-layer`,
        name: 'plates',
        visible: true,
        locked: false,
        blendMode: 'normal',
        children,
      },
    ],
    fields: [],
    bindings: [],
  };
}

/**
 * A look instance, placed at IDENTITY over the whole frame, so a plate authored at scene
 * coordinates inside the composition flattens back to exactly those coordinates. The probe
 * arithmetic in `geometry.ts` depends on that and would silently shift if the instance were
 * moved or resized.
 */
function instance(id: string, compositionId: string): Element {
  return {
    ...BASE,
    id,
    name: id,
    type: 'composition',
    compositionId,
    transform: transform({ x: 0, y: 0, width: SKEW_SCENE.width, height: SKEW_SCENE.height }),
  } as unknown as Element;
}

/** The full-bleed painted background the holes are punched through. */
function background(): Element {
  return {
    ...BASE,
    id: 'skew-background',
    name: 'background',
    type: 'shape',
    shape: 'rect',
    transform: transform({ x: 0, y: 0, width: SKEW_SCENE.width, height: SKEW_SCENE.height }),
    // A saturated blue: far from anything in the source pattern, so probe B's
    // background-to-picture step is the largest signal in the recording.
    fill: { kind: 'solid', color: '#1040C0' },
  } as unknown as Element;
}

/**
 * Build the scene, PARSED through `SceneSchema` so a shape error is a loud failure here
 * rather than a mystery three stages downstream in CEF.
 */
export function buildSkewScene(): Scene {
  const raw = {
    schemaVersion: 1,
    id: 'skew-harness-scene',
    name: 'B-174 skew harness',
    templateType: 'custom',
    resolution: { width: SKEW_SCENE.width, height: SKEW_SCENE.height },
    frameRate: 50,
    safeAreas: { title: 10, action: 5 },
    frameRange: { in: 0, out: 50 },
    editorBackdrop: 'transparent',
    layers: [
      {
        id: 'root',
        name: 'root',
        visible: true,
        locked: false,
        blendMode: 'normal',
        // 🔴 ORDER IS PAINT ORDER, and the background must come FIRST or nothing punches it.
        children: [
          background(),
          instance('inst-banner', 'comp-banner'),
          instance('inst-column', 'comp-column'),
        ],
      },
    ],
    compositions: [
      composition('comp-banner', BANNER_RECTS),
      composition('comp-column', COLUMN_RECTS),
    ],
    fonts: [],
    fields: [],
    bindings: [],
    lookGroups: [
      {
        id: 'skew-group',
        looks: [
          { id: LOOK_BANNER, name: 'banner', instanceId: 'inst-banner', entered: { mode: 'cut' } },
          { id: LOOK_COLUMN, name: 'column', instanceId: 'inst-column', entered: { mode: 'cut' } },
        ],
        defaultLookId: LOOK_BANNER,
      },
    ],
    metadata: { createdAt: '2026-08-31T00:00:00.000Z', updatedAt: '2026-08-31T00:00:00.000Z' },
  };
  return SceneSchema.parse(raw);
}

/** The plate ids this scene declares, in the order the carrier derives them. */
export const SKEW_PLATES = [PLATE_A, PLATE_B] as const;
