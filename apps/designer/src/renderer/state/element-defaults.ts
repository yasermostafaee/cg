import type {
  AnchorPoint,
  ClockElement,
  DynamicField,
  ImageElement,
  ListItem,
  LottieElement,
  LottiePhases,
  PathElement,
  RepeaterElement,
  SequenceElement,
  ShapeElement,
  TextElement,
  TickerElement,
  Transform,
  VideoElement,
} from '@cg/shared-schema';
import { pathVisualBBox } from '@cg/shared-schema';

/**
 * Default element factories — what we drop on the canvas when the
 * operator clicks with the text/shape/image tool. The transform is
 * computed at the call site (click position → top-left corner with
 * an opinionated default size).
 */

function baseTransform(x: number, y: number, w: number, h: number): Transform {
  return {
    position: { x, y },
    size: { w, h },
    rotation: 0,
    scale: { x: 1, y: 1 },
    // Centre anchor: rotation and scale pivot about the element's middle (the
    // intuitive default, matching the starter templates). `position` is still
    // the top-left, so the element doesn't shift at rest — only its pivot.
    anchor: { x: 0.5, y: 0.5 },
  };
}

export function defaultText(id: string, x: number, y: number): TextElement {
  return {
    id,
    name: 'Text',
    type: 'text',
    visible: true,
    locked: false,
    opacity: 1,
    zIndex: 0,
    transform: baseTransform(x, y, 480, 80),
    text: 'New text',
    font: {
      family: 'Inter',
      weight: 700,
      style: 'normal',
      size: 48,
      lineHeight: 1.15,
      letterSpacing: 0,
    },
    color: '#FFFFFF',
    align: 'start',
    direction: 'auto',
    fitMode: 'fixed',
    overflow: 'clip',
  };
}

/**
 * Ticker / crawler band (D-028). English defaults (D-082): reading direction
 * `ltr` (the crawl moves visually right→left), Vazirmatn, English placeholder
 * items. The crawl duration is content-driven (measured width ÷ speed) —
 * there is deliberately no duration knob anywhere.
 */
export function defaultTicker(id: string, x: number, y: number): TickerElement {
  return {
    id,
    name: 'Ticker',
    type: 'ticker',
    visible: true,
    locked: false,
    opacity: 1,
    zIndex: 0,
    transform: baseTransform(x, y, 1200, 72),
    font: {
      family: 'Vazirmatn',
      weight: 500,
      style: 'normal',
      size: 36,
      lineHeight: 1.4,
      letterSpacing: 0,
    },
    color: '#FFFFFF',
    // No backgroundColor — a fresh band is TRANSPARENT by design; the operator
    // opts into a bar colour in the inspector.
    direction: 'ltr',
    // D-045 — vertical placement of the crawl text within the band (default centred).
    verticalAlign: 'middle',
    speed: 120,
    // INNER repeat loop — a fresh ticker crawls forever by design (no hidden
    // loop default to hunt for); finite passes are an explicit inspector edit.
    repeat: 'infinite',
    cycleBoundary: 'seamless',
    gap: 48,
    separator: ' • ',
    items: [
      { id: 'item-1', text: 'First headline — sample' },
      { id: 'item-2', text: 'Second headline — sample' },
      { id: 'item-3', text: 'Third headline — sample' },
    ],
  };
}

/**
 * Digital clock (D-027). Persian-first defaults: wall mode, `HH:mm:ss`,
 * Persian digits, Vazirmatn. The clock is time-driven like the ticker — a
 * runtime driver repaints it once per second; scrubbing never moves it.
 */
export function defaultClock(id: string, x: number, y: number): ClockElement {
  return {
    id,
    name: 'Clock',
    type: 'clock',
    visible: true,
    locked: false,
    opacity: 1,
    zIndex: 0,
    transform: baseTransform(x, y, 320, 84),
    font: {
      family: 'Vazirmatn',
      weight: 600,
      style: 'normal',
      size: 48,
      lineHeight: 1.2,
      letterSpacing: 0,
    },
    color: '#FFFFFF',
    // No backgroundColor — a fresh clock box is TRANSPARENT by design; the
    // operator opts into a bar colour in the inspector.
    align: 'center',
    // D-045 — vertical placement of the time text within the box (default centred).
    verticalAlign: 'middle',
    mode: 'wall',
    format: 'HH:mm:ss',
    digits: 'persian',
  };
}

/**
 * Sequence / now-next (D-029). English defaults (D-082): `ltr`, Vazirmatn,
 * three sample now/next items, the "Push up" transition (in from the bottom,
 * out through the top, simultaneous), auto-advance every 5s, infinite passes.
 * Time-driven like the ticker/clock — scrubbing never moves it.
 */
export function defaultSequence(id: string, x: number, y: number): SequenceElement {
  return {
    id,
    name: 'Sequence',
    type: 'sequence',
    visible: true,
    locked: false,
    opacity: 1,
    zIndex: 0,
    transform: baseTransform(x, y, 720, 72),
    font: {
      family: 'Vazirmatn',
      weight: 500,
      style: 'normal',
      size: 36,
      lineHeight: 1.4,
      letterSpacing: 0,
    },
    color: '#FFFFFF',
    // No backgroundColor — a fresh box is TRANSPARENT by design.
    align: 'start',
    // D-045 — vertical placement of the item text within the box (default centred).
    verticalAlign: 'middle',
    direction: 'ltr',
    items: [
      { id: 'item-1', text: 'Now: first item' },
      { id: 'item-2', text: 'Then: second item' },
      { id: 'item-3', text: 'Next: third item' },
    ],
    defaultDwellMs: 5000,
    advance: 'auto',
    transitionIn: 'bottom',
    transitionOut: 'top',
    transitionTiming: 'simultaneous',
    transitionMs: 400,
    repeat: 'infinite',
  };
}

/**
 * Repeater / data-driven layout (D-030). References the given child
 * composition and seeds 3 rows whose keys are the child's field ids with
 * their default values (a field-less child seeds 3 bare `{id}` rows) — the
 * same rows a Data key later seeds into the bound `list` field.
 */
export function defaultRepeater(
  id: string,
  x: number,
  y: number,
  child: { id: string; fields?: readonly DynamicField[] | undefined },
): RepeaterElement {
  // Seed ONLY fields that carry a standard `default` — writing a key for a
  // default-less kind (e.g. an image field's `defaultAssetId`) would OVERRIDE
  // that field's real default at apply time (`fieldId in values` wins over
  // the fallback); an omitted key falls back correctly at runtime.
  const seedRow = (n: number): ListItem =>
    ({
      id: `row-${String(n)}`,
      ...Object.fromEntries(
        (child.fields ?? [])
          .filter((f) => 'default' in f)
          .map((f) => [f.id, (f as { default: unknown }).default]),
      ),
    }) as ListItem;
  return {
    id,
    name: 'Repeater',
    type: 'repeater',
    visible: true,
    locked: false,
    opacity: 1,
    zIndex: 0,
    transform: baseTransform(x, y, 480, 360),
    compositionId: child.id,
    direction: 'column',
    flow: 'rtl',
    gap: 8,
    items: [seedRow(1), seedRow(2), seedRow(3)],
  };
}

export function defaultShape(id: string, x: number, y: number): ShapeElement {
  return {
    id,
    name: 'Rectangle',
    type: 'shape',
    visible: true,
    locked: false,
    opacity: 1,
    zIndex: 0,
    transform: baseTransform(x, y, 320, 120),
    shape: 'rect',
    fill: { kind: 'solid', color: '#BEBEBE' },
  };
}

/**
 * Ellipse/circle shape. Defaults to an equal-sided box (a circle) so the
 * operator starts symmetric and can drag a handle to make any ellipse.
 * Renders via the runtime's `border-radius: 50%` path — same ShapeElement,
 * just `shape: 'ellipse'`.
 */
export function defaultEllipse(id: string, x: number, y: number): ShapeElement {
  return {
    id,
    name: 'Ellipse',
    type: 'shape',
    visible: true,
    locked: false,
    opacity: 1,
    zIndex: 0,
    transform: baseTransform(x, y, 200, 200),
    shape: 'ellipse',
    fill: { kind: 'solid', color: '#BEBEBE' },
  };
}

/**
 * D-109/B-059/B-062 — re-derive a path's transform from its points: shift the
 * points so their VISUAL (curve-aware) bbox starts at the local origin `(0,0)`,
 * set `size` to its extents, and compensate `position` so every unchanged point
 * keeps its rendered scene spot. Keeping points in a 0-origin local frame
 * decouples them from `position`, so moving the element (position only) and
 * editing a point (points only) never interfere. Called after every pen/edit
 * gesture (each PathEditor tick funnels through it); a static W/H resize keeps
 * the same invariant by BAKING the scale into the points instead
 * (`bakePathSize`, timeline slice), so a later normalize is a no-op.
 */
export function normalizePathPoints(el: PathElement): PathElement {
  if (el.points.length === 0) return el;
  // B-059/B-062 (owner model) — normalize against the VISUAL (curve-aware) bbox:
  // points live with the visual bbox at (0,0) and `size` == its extents, so the
  // selection box / Inspector W/H are the visible bounds and a W/H resize (which
  // bakes the points) is never snapped back by a later normalize.
  const bbox = pathVisualBBox(el.points, el.closed);
  const t = el.transform;
  const size = { w: Math.max(bbox.w, 1), h: Math.max(bbox.h, 1) };
  const points =
    bbox.x === 0 && bbox.y === 0
      ? el.points
      : el.points.map((p) => ({ ...p, x: p.x - bbox.x, y: p.y - bbox.y }));
  // Normalize is a RENDER-NEUTRAL change of frame — every unchanged point must keep
  // its rendered scene spot. The renderer maps local -> scene as
  // `position + A + M·(local − A)` with pivot `A = anchor⊙size` and `M = Scale·Rotate`
  // (see `localToScene`), and a re-normalize changes BOTH `A` (size tracks the bbox,
  // so the pivot moves) and the local frame (points shift by `vmin`). Solving
  // `S'(p − vmin) = S(p)` gives `position' = position + (I − M)(A − A') + M·vmin`,
  // which reduces to the plain `position += vmin` exactly when rotation = 0 and
  // scale = 1. Without the `(I − M)` pivot term, dragging one anchor of a ROTATED
  // path re-projected every OTHER anchor each move tick (probe: 2.07 scene px of
  // drift per 8 px of bbox growth at 30°).
  const rad = (t.rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const m = (vx: number, vy: number): { x: number; y: number } => ({
    x: t.scale.x * (vx * cos - vy * sin),
    y: t.scale.y * (vx * sin + vy * cos),
  });
  const dax = t.anchor.x * (t.size.w - size.w); // A − A'
  const day = t.anchor.y * (t.size.h - size.h);
  const md = m(dax, day);
  const mv = m(bbox.x, bbox.y);
  return {
    ...el,
    points,
    transform: {
      ...t,
      position: {
        x: t.position.x + (dax - md.x) + mv.x,
        y: t.position.y + (day - md.y) + mv.y,
      },
      size,
    },
  };
}

/**
 * D-109 — a `path` element from a list of anchor points in SCENE coordinates (what
 * the pen tool accumulates). Normalized so `position` is the bbox top-left and the
 * points sit in a 0-origin local frame. Closed ⇒ fill + stroke; open ⇒ stroke only.
 */
export function pathFromScenePoints(
  id: string,
  scenePoints: readonly AnchorPoint[],
  closed: boolean,
): PathElement {
  const seed: PathElement = {
    id,
    name: 'Path',
    type: 'path',
    visible: true,
    locked: false,
    opacity: 1,
    zIndex: 0,
    transform: {
      position: { x: 0, y: 0 },
      size: { w: 1, h: 1 },
      rotation: 0,
      scale: { x: 1, y: 1 },
      anchor: { x: 0.5, y: 0.5 },
    },
    points: [...scenePoints],
    closed,
    fill: { kind: 'solid', color: '#BEBEBE' },
    stroke: { width: 2, color: '#1A1A1A' },
  };
  return normalizePathPoints(seed);
}

/**
 * Image elements need an asset id — the click action creates one only
 * after the operator picks an asset. This factory is for the
 * "after-pick" step.
 *
 * D-040 — `opts.source` selects the per-project asset store (`'project'`, the
 * default, used by the drag-drop-from-assets path) or the device shared library
 * (`'shared'`, used by the logo tool). `opts.width`/`opts.height` let the logo
 * tool size the element to the picked image's aspect ratio; both default to a
 * 320×320 square when unknown.
 */
export function defaultImage(
  id: string,
  x: number,
  y: number,
  assetId: string,
  opts?: { source?: 'project' | 'shared'; width?: number; height?: number },
): ImageElement {
  return {
    id,
    name: 'Image',
    type: 'image',
    visible: true,
    locked: false,
    opacity: 1,
    zIndex: 0,
    transform: baseTransform(x, y, opts?.width ?? 320, opts?.height ?? 320),
    assetId,
    source: opts?.source ?? 'project',
    fit: 'contain',
    preserveAspect: true,
  };
}

/**
 * D-125 — a Lottie animation element. Like {@link defaultImage} it needs an
 * asset id, so the factory is the "after-import" step (the drop-from-assets path
 * derives `phases` from the animation's bodymovin markers before calling here).
 *
 * `opts.width`/`opts.height` size the element to the animation's native canvas
 * (both default to a 480×270 box when unknown); `opts.phases` seeds the intro /
 * outro mapping when markers were found (omitted ⇒ the whole clip is the intro,
 * frozen at its last frame). `speed` defaults to 1×, `loopMode` to 'none', and
 * `holdBehavior` to 'freeze' so a freshly-imported clip plays once and holds.
 */
export function defaultLottie(
  id: string,
  x: number,
  y: number,
  assetId: string,
  opts?: { phases?: LottiePhases; width?: number; height?: number; speed?: number },
): LottieElement {
  return {
    id,
    name: 'Lottie',
    type: 'lottie',
    visible: true,
    locked: false,
    opacity: 1,
    zIndex: 0,
    transform: baseTransform(x, y, opts?.width ?? 480, opts?.height ?? 270),
    assetId,
    speed: opts?.speed ?? 1,
    loopMode: 'none',
    holdBehavior: 'freeze',
    ...(opts?.phases ? { phases: opts.phases } : {}),
  };
}

/**
 * D-128 — an imported video clip element. Like {@link defaultLottie} it needs an
 * asset id, so the factory is the "after-import" step (both entry points — the
 * import modal's place-on-confirm and the drag-from-assets drop — call here).
 * `durationMs` is the converted clip's duration, probed at import / drop;
 * `width`/`height` size the element to the STORED clip's dimensions (post-crop).
 * `holdBehavior` defaults to `'loop'` in the schema — the inverse of the
 * Lottie's `freeze`, because video furniture is authored as a loop — so the
 * factory deliberately does not set it.
 */
export function defaultVideo(
  id: string,
  x: number,
  y: number,
  assetId: string,
  durationMs: number,
  opts?: { width?: number; height?: number },
): VideoElement {
  return {
    id,
    name: 'Video',
    type: 'video',
    visible: true,
    locked: false,
    opacity: 1,
    zIndex: 0,
    transform: baseTransform(x, y, opts?.width ?? 480, opts?.height ?? 270),
    assetId,
    durationMs,
    holdBehavior: 'loop',
  };
}
