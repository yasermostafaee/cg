import { SceneSchema, type Element, type Scene } from '@cg/shared-schema';
import {
  BANNER_COLUMN_FIXTURE,
  fillerLookRects,
  PLATE_A,
  PLATE_B,
  PLATE_C,
  SKEW_SCENE,
  type Rect,
  type SkewFixture,
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

/**
 * `SKEW-RESIDUE-01` — WEIGHT for a filler look, so the look-count axis is not measured against
 * empty rooms.
 *
 * A look that holds two plates and nothing else is a handful of DOM nodes; the owner's looks
 * hold a designed layout. These are full-frame painted panels plus a row of boxes — real style
 * recalc, real layout, real paint, and (crucially) real work for `sceneMaskHoles`, which
 * flattens the WHOLE scene on every repunch whether a look is on screen or not.
 */
function filler(id: string, index: number): Element[] {
  const shades = ['#203040', '#304050', '#405060', '#506070', '#607080', '#708090'];
  const panels: Element[] = [
    {
      ...BASE,
      id: `${id}-panel`,
      name: 'panel',
      type: 'shape',
      shape: 'rect',
      transform: transform({ x: 0, y: 0, width: SKEW_SCENE.width, height: SKEW_SCENE.height }),
      fill: { kind: 'solid', color: shades[index % shades.length] ?? '#203040' },
    } as unknown as Element,
  ];
  for (let i = 0; i < 8; i += 1) {
    panels.push({
      ...BASE,
      id: `${id}-box-${String(i)}`,
      name: `box-${String(i)}`,
      type: 'shape',
      shape: 'rect',
      transform: transform({
        x: 40 + i * 230,
        y: 820 - index * 30,
        width: 200,
        height: 180,
      }),
      fill: { kind: 'solid', color: shades[(i + index) % shades.length] ?? '#405060' },
    } as unknown as Element);
  }
  return panels;
}

function composition(
  id: string,
  rects: Readonly<Record<string, Rect>>,
  weight?: { readonly index: number },
): unknown {
  const children: Element[] = [
    ...(weight === undefined ? [] : filler(id, weight.index)),
    ...Object.entries(rects).map(([routeKey, rect]) => plate(`${id}-${routeKey}`, routeKey, rect)),
  ];
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
 * `SKEW-RESIDUE-01` — the FULL-FRAME VIDEO the owner's own template carries, as a real scene
 * element rather than a `<video>` bolted onto the page.
 *
 * 🔴 It sits at the BOTTOM of paint order, so `sceneMaskHoles` punches it exactly as it
 * punches the painted background: a hole is transparent through BOTH and the CasparCG layer
 * shows through. A `<video>` placed behind the stage in the page's own DOM would show through
 * the holes instead of the plates, and the measurement would read the page against itself.
 *
 * The clip's content is STILL except for one small patch (`BACKGROUND_MOTION_PATCH`) — see
 * `ffmpeg.ts`. Still, because a moving background destroys the first-change detector; ONE
 * moving patch, because "the decoder is running" is otherwise an assumption, and an
 * unverified load axis measures nothing.
 */
function videoBackground(assetId: string, durationMs: number): Element {
  return {
    ...BASE,
    id: 'skew-video-bg',
    name: 'video background',
    type: 'video',
    assetId,
    durationMs,
    holdBehavior: 'loop',
    transform: transform({ x: 0, y: 0, width: SKEW_SCENE.width, height: SKEW_SCENE.height }),
  } as unknown as Element;
}

/**
 * `SKEW-RESIDUE-01` — **the look that punches NOTHING, and what it is for.**
 *
 * Candidate 1 of the remedies is an INTERSECTION mask for the transition window: punch
 * `old ∩ new`, so every open pixel is backed by a picture in both arrangements. Its edge case
 * is two looks that barely overlap, where the intersection is EMPTY — and the question asked
 * of this session is what that LOOKS like, with a frame on disk, rather than a paragraph
 * reasoning about it.
 *
 * An empty intersection punches no holes, so its appearance is the appearance of a look whose
 * plates are off-frame: the template alone, every box gone, for one field. That is produced
 * HERE by the product's own mask code (`sceneMaskHoles` sees plates outside every element it
 * could punch) rather than by drawing a mock-up — the frame is a capture, not an illustration.
 */
export const LOOK_EMPTY = 'look-empty';

export interface SkewSceneOptions {
  /**
   * How many looks the scene carries. The first two are the measured pair; the rest are
   * filler (`fillerLookRects`) and are never entered — see there for why that isolates the
   * page axis.
   */
  readonly looks?: number;
  /** `video` adds a full-frame clip beneath the painted background. */
  readonly background?: 'flat' | 'video';
  /** The asset id the host will resolve to the clip's URL, when `background: 'video'`. */
  readonly videoAssetId?: string;
  readonly videoDurationMs?: number;
  /** Append {@link LOOK_EMPTY} — a look whose plates are off-frame, so it punches nothing. */
  readonly withEmptyLook?: boolean;
  /**
   * `SKEW-INTERSECT-01` — WHICH measured pair to build. The default is the banner/column pair
   * every earlier measurement used; `GHAB_FIXTURE` is the owner's own full-frame-vs-boxes
   * shape, which is the one that discriminates an intersection mask from an entering-look mask.
   */
  readonly fixture?: SkewFixture;
}

/**
 * Build the scene, PARSED through `SceneSchema` so a shape error is a loud failure here
 * rather than a mystery three stages downstream in CEF.
 */
export function buildSkewScene(options: SkewSceneOptions = {}): Scene {
  const lookCount = Math.max(2, options.looks ?? 2);
  const fillers = Array.from({ length: lookCount - 2 }, (_, i) => ({
    id: `look-filler-${String(i + 1)}`,
    compositionId: `comp-filler-${String(i + 1)}`,
    instanceId: `inst-filler-${String(i + 1)}`,
    rects: fillerLookRects(i),
  }));
  const fixture = options.fixture ?? BANNER_COLUMN_FIXTURE;
  /*
    The two MEASURED looks, named by the fixture. Instance ids are derived from the look ids so
    two fixtures can never collide in one scene and a probe-placement check made against one
    fixture can never be silently satisfied by the other's geometry.
  */
  const measured = fixture.looks.map((id) => ({
    id,
    instanceId: `inst-${id}`,
    compositionId: `comp-${id}`,
    rects: fixture.rects[id] ?? {},
  }));
  const wantsVideo = options.background === 'video';
  const wantsEmpty = options.withEmptyLook === true;
  // Off the bottom-right corner: inside the scene's coordinate space (so the schema is happy)
  // and outside every element the mask could punch.
  const EMPTY_RECTS: Readonly<Record<string, Rect>> = {
    [PLATE_A]: { x: 1918, y: 1078, width: 2, height: 2 },
    [PLATE_B]: { x: 1916, y: 1078, width: 2, height: 2 },
    [PLATE_C]: { x: 1914, y: 1078, width: 2, height: 2 },
  };
  const assetId = options.videoAssetId ?? 'skew-bg-asset';
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
          /*
            🔴 The video REPLACES the painted shape rather than sitting under it. Covered, it
            would still decode but paint nothing — and the moving patch that proves the
            decoder is running would be hidden behind the very element it exists to be seen
            through. The clip's still content is the same `#1040C0`, so probe B's
            background-to-picture step is identical in both variants and only the DECODE and
            PAINT of a full-frame video is added.
          */
          ...(wantsVideo
            ? [videoBackground(assetId, options.videoDurationMs ?? 10_000)]
            : [background()]),
          ...measured.map((m) => instance(m.instanceId, m.compositionId)),
          ...fillers.map((f) => instance(f.instanceId, f.compositionId)),
          ...(wantsEmpty ? [instance('inst-empty', 'comp-empty')] : []),
        ],
      },
    ],
    compositions: [
      ...measured.map((m) => composition(m.compositionId, m.rects)),
      ...fillers.map((f, i) => composition(f.compositionId, f.rects, { index: i })),
      ...(wantsEmpty ? [composition('comp-empty', EMPTY_RECTS)] : []),
    ],
    fonts: [],
    fields: [],
    bindings: [],
    lookGroups: [
      {
        id: 'skew-group',
        looks: [
          ...measured.map((m) => ({
            id: m.id,
            name: m.id,
            instanceId: m.instanceId,
            entered: { mode: 'cut' as const },
          })),
          ...fillers.map((f) => ({
            id: f.id,
            name: f.id,
            instanceId: f.instanceId,
            entered: { mode: 'cut' as const },
          })),
          ...(wantsEmpty
            ? [
                {
                  id: LOOK_EMPTY,
                  name: LOOK_EMPTY,
                  instanceId: 'inst-empty',
                  entered: { mode: 'cut' as const },
                },
              ]
            : []),
        ],
        defaultLookId: measured[0]?.id ?? fixture.looks[0],
      },
    ],
    metadata: { createdAt: '2026-08-31T00:00:00.000Z', updatedAt: '2026-08-31T00:00:00.000Z' },
  };
  return SceneSchema.parse(raw);
}

/** The plate ids this scene declares, in the order the carrier derives them. */
/**
 * The plate ids this scene declares, in the order the carrier derives them.
 *
 * ⚠ THREE since `single-clock-look-switch`: the owner's template declares three, and a fixture
 * that used two could not express his `look-3`. A fixture that names only two simply leaves the
 * third at its off-screen rect in every look, which seats it and shows it nowhere.
 */
export const SKEW_PLATES = [PLATE_A, PLATE_B, PLATE_C] as const;
