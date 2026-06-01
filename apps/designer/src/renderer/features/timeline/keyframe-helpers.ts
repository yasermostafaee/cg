import type {
  AnimatableProperty,
  Easing,
  Element,
  Keyframe,
  Track,
  Transform,
} from '@cg/shared-schema';

/**
 * Width of the left label column shared by the ruler row and every track
 * row. Keeping it in one place ensures Frame 0 in the ruler lines up with
 * the left edge of every lane.
 */
export const LABEL_COL_PX = 140;

/**
 * Catalogue of the eight UI rows the PRD (D-006) calls out, in the order
 * they appear in the dock. Each row knows its display label, the canonical
 * `AnimatableProperty` id in the M12 keyframe schema, and how to read the
 * element's current static value for that property (used as the value for a
 * newly-added keyframe).
 */
export interface TimelineRow {
  readonly label: string;
  readonly property: AnimatableProperty;
  /**
   * Current static value for the row, used to:
   *  - format the value column ("100", "100%", "BEBEBE", …);
   *  - seed a freshly-added keyframe when the diamond is clicked.
   * Returns a number for numeric properties and a hex string for
   * colour properties (D-010).
   */
  readonly read: (el: Element) => number | string;
}

export const TIMELINE_ROWS: readonly TimelineRow[] = [
  { label: 'Position X', property: 'position.x', read: (el) => el.transform.position.x },
  { label: 'Position Y', property: 'position.y', read: (el) => el.transform.position.y },
  { label: 'Scale X', property: 'scale.x', read: (el) => el.transform.scale.x },
  { label: 'Scale Y', property: 'scale.y', read: (el) => el.transform.scale.y },
  { label: 'Rotation', property: 'rotation', read: (el) => el.transform.rotation },
  { label: 'Width', property: 'size.w', read: (el) => el.transform.size.w },
  { label: 'Height', property: 'size.h', read: (el) => el.transform.size.h },
  { label: 'Opacity', property: 'opacity', read: (el) => el.opacity },
];

/**
 * D-010 — non-animatable display rows for the timeline label column.
 * The runtime still applies these values as static styles; the
 * keyframe engine doesn't track them yet, so the indicator stays
 * empty and the lane is always blank. Visual parity with Loopic.
 */
export interface DisplayRow {
  readonly label: string;
  /** Stable id (purely for React keys). */
  readonly id: string;
  /** Value formatted for the label column (e.g. "100%" or "BEBEBE"). */
  readonly read: (el: Element) => string;
}

/** Tagged union of "what kind of row to render in the timeline". */
export type TimelineRowEntry =
  | { readonly kind: 'animatable'; readonly row: TimelineRow }
  | { readonly kind: 'display'; readonly row: DisplayRow };

export interface TimelineGroup {
  readonly title: string;
  readonly rows: readonly TimelineRowEntry[];
}

const TRANSFORM_GROUP: TimelineGroup = {
  title: 'TRANSFORM',
  rows: TIMELINE_ROWS.map((row) => ({ kind: 'animatable', row })),
};

function anim(
  label: string,
  property: AnimatableProperty,
  read: (el: Element) => number | string,
): TimelineRowEntry {
  return { kind: 'animatable', row: { label, property, read } };
}

/** Filter group — all 9 properties animatable as numbers (D-010). */
const FILTER_ROWS: readonly TimelineRowEntry[] = [
  anim('Blur', 'filter.blur', (el) => el.filter?.blur ?? 0),
  anim('Brightness', 'filter.brightness', (el) => el.filter?.brightness ?? 100),
  anim('Contrast', 'filter.contrast', (el) => el.filter?.contrast ?? 100),
  anim('Grayscale', 'filter.grayscale', (el) => el.filter?.grayscale ?? 0),
  anim('Hue rotate', 'filter.hueRotate', (el) => el.filter?.hueRotate ?? 0),
  anim('Invert', 'filter.invert', (el) => el.filter?.invert ?? 0),
  anim('Opacity', 'filter.opacity', (el) => el.filter?.opacity ?? 100),
  anim('Saturate', 'filter.saturate', (el) => el.filter?.saturate ?? 100),
  anim('Sepia', 'filter.sepia', (el) => el.filter?.sepia ?? 0),
];

const FILTER_GROUP: TimelineGroup = { title: 'FILTER', rows: FILTER_ROWS };

/** Path-style group for shapes — width, dash and colours all animatable. */
function pathStyleGroup(): TimelineGroup {
  return {
    title: 'PATH STYLE',
    rows: [
      anim('Fill', 'fill.color', (el) =>
        el.type === 'shape' && el.fill?.kind === 'solid' ? el.fill.color : '#000000',
      ),
      anim('Stroke', 'stroke.color', (el) =>
        el.type === 'shape' ? (el.stroke?.color ?? '#000000') : '#000000',
      ),
      anim('Stroke width', 'stroke.width', (el) =>
        el.type === 'shape' ? (el.stroke?.width ?? 0) : 0,
      ),
      anim('Stroke dasharray', 'stroke.dash', (el) =>
        el.type === 'shape' ? (el.stroke?.dash?.[0] ?? 0) : 0,
      ),
    ],
  };
}

/** Border-radius group — single Radius row, animatable. */
function borderRadiusGroup(): TimelineGroup {
  return {
    title: 'BORDER RADIUS',
    rows: [
      anim('Radius', 'cornerRadius', (el) => {
        if (el.type === 'shape') {
          return typeof el.cornerRadius === 'number'
            ? el.cornerRadius
            : Array.isArray(el.cornerRadius)
              ? el.cornerRadius[0]
              : 0;
        }
        if (el.type === 'text') return el.cornerRadius ?? 0;
        return 0;
      }),
    ],
  };
}

/** Drop-shadow group — offsets + blur animatable; colour stays display-only. */
function dropShadowGroup(): TimelineGroup {
  function shadowOf(el: Element):
    | { offsetX: number; offsetY: number; blur: number; color: string }
    | undefined {
    if (el.type === 'shape') return el.shadow;
    if (el.type === 'text') return el.textShadow;
    return undefined;
  }
  return {
    title: 'DROP SHADOW',
    rows: [
      anim('Offset X', 'shadow.offsetX', (el) => shadowOf(el)?.offsetX ?? 0),
      anim('Offset Y', 'shadow.offsetY', (el) => shadowOf(el)?.offsetY ?? 0),
      anim('Blur', 'shadow.blur', (el) => shadowOf(el)?.blur ?? 0),
      anim('Color', 'shadow.color', (el) => shadowOf(el)?.color ?? '#000000'),
    ],
  };
}

/** Text group (text element only) — font size / line height / letter
 * spacing animatable; colours stay display-only. */
function textGroup(): TimelineGroup {
  return {
    title: 'TEXT',
    rows: [
      anim('Font size', 'font.size', (el) => (el.type === 'text' ? el.font.size : 0)),
      anim('Color', 'text.color', (el) => (el.type === 'text' ? el.color : '#000000')),
      anim('Background color', 'backgroundColor', (el) =>
        el.type === 'text' ? (el.backgroundColor ?? '#FFFFFF') : '#FFFFFF',
      ),
      anim('Line height', 'font.lineHeight', (el) =>
        el.type === 'text' ? el.font.lineHeight : 0,
      ),
      anim('Letter spacing', 'font.letterSpacing', (el) =>
        el.type === 'text' ? el.font.letterSpacing : 0,
      ),
    ],
  };
}

/** Text-padding group (text element only) — all 4 sides animatable. */
function textPaddingGroup(): TimelineGroup {
  return {
    title: 'TEXT PADDING',
    rows: [
      anim('Padding top', 'padding.top', (el) => (el.type === 'text' ? el.padding?.top ?? 0 : 0)),
      anim('Padding right', 'padding.right', (el) =>
        el.type === 'text' ? el.padding?.right ?? 0 : 0,
      ),
      anim('Padding bottom', 'padding.bottom', (el) =>
        el.type === 'text' ? el.padding?.bottom ?? 0 : 0,
      ),
      anim('Padding left', 'padding.left', (el) => (el.type === 'text' ? el.padding?.left ?? 0 : 0)),
    ],
  };
}

/**
 * Per-element-type group list for the timeline label column (D-010).
 * Order mirrors the D-010 reference pics.
 */
export function timelineGroupsFor(el: Element): readonly TimelineGroup[] {
  if (el.type === 'shape') {
    return [TRANSFORM_GROUP, pathStyleGroup(), borderRadiusGroup(), dropShadowGroup(), FILTER_GROUP];
  }
  if (el.type === 'text') {
    return [
      TRANSFORM_GROUP,
      textGroup(),
      dropShadowGroup(),
      textPaddingGroup(),
      borderRadiusGroup(),
      FILTER_GROUP,
    ];
  }
  // image / placeholder / container — just Transform + Filter for now.
  return [TRANSFORM_GROUP, FILTER_GROUP];
}

/** Look up the track for a property on an element, or undefined. */
export function trackOf(el: Element, property: AnimatableProperty): Track | undefined {
  return el.animation?.tracks[property];
}

/** True if the element has any keyframe at `frame` on `property`. */
export function hasKeyframeAt(el: Element, property: AnimatableProperty, frame: number): boolean {
  const track = trackOf(el, property);
  if (track === undefined) return false;
  return track.keyframes.some((k) => k.frame === frame);
}

/**
 * Numeric-only keyframe interpolation for the Designer renderer.
 *
 * Mirrors `@cg/template-runtime`'s `interpolateAtFrame` for the numeric
 * value space — same edge cases (clamp before the first / after the
 * last keyframe, per-keyframe outgoing easing). We keep a local copy
 * because importing the function from `@cg/template-runtime` would
 * drag in an ambient `Window.cg?: TemplateRuntime` declaration that
 * collides with the Designer's `Window.cg: DesignerBridge` typing.
 */
function interpolateNumericTrack(track: Track, frame: number): number | null {
  const kfs = track.keyframes;
  const first = kfs[0];
  const last = kfs[kfs.length - 1];
  if (first === undefined || last === undefined) return null;
  if (typeof first.value !== 'number') return null;
  if (frame <= first.frame) return first.value;
  if (frame >= last.frame) return typeof last.value === 'number' ? last.value : null;
  let prev: Keyframe = first;
  let next: Keyframe = last;
  for (let i = 1; i < kfs.length; i++) {
    const k = kfs[i];
    const before = kfs[i - 1];
    if (k === undefined || before === undefined) continue;
    if (k.frame > frame) {
      prev = before;
      next = k;
      break;
    }
  }
  if (typeof prev.value !== 'number' || typeof next.value !== 'number') return null;
  if (prev.easing === 'step') return prev.value;
  const span = next.frame - prev.frame;
  const t = span === 0 ? 1 : (frame - prev.frame) / span;
  const eased = applyEasing(prev.easing, t);
  return prev.value + (next.value - prev.value) * eased;
}

function applyEasing(easing: Easing, t: number): number {
  switch (easing) {
    case 'linear':
      return t;
    case 'step':
      return t < 1 ? 0 : 1;
    case 'ease-in':
      return t * t;
    case 'ease-out':
      return 1 - (1 - t) * (1 - t);
    case 'ease-in-out':
      return t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t);
  }
}

/**
 * The visually-effective transform for an element at a given frame.
 * For each axis: when the property has a track, use the interpolated
 * value; otherwise fall back to the element's static transform value.
 * This is what the Gizmo + canvas-drag start-position must read,
 * because the iframe preview renders the interpolated value, not the
 * static one.
 */
export function effectiveTransformAt(el: Element, frame: number): Transform {
  const t = el.transform;
  const tracks = el.animation?.tracks;
  const num = (prop: AnimatableProperty, fallback: number): number => {
    const track = tracks?.[prop];
    if (track === undefined) return fallback;
    const v = interpolateNumericTrack(track, frame);
    return v ?? fallback;
  };
  return {
    position: { x: num('position.x', t.position.x), y: num('position.y', t.position.y) },
    size: { w: num('size.w', t.size.w), h: num('size.h', t.size.h) },
    scale: { x: num('scale.x', t.scale.x), y: num('scale.y', t.scale.y) },
    rotation: num('rotation', t.rotation),
    anchor: t.anchor,
    ...(t.skew !== undefined ? { skew: t.skew } : {}),
  };
}

/**
 * Effective opacity for an element at a given frame.
 */
export function effectiveOpacityAt(el: Element, frame: number): number {
  const track = el.animation?.tracks.opacity;
  if (track === undefined) return el.opacity;
  const v = interpolateNumericTrack(track, frame);
  return v ?? el.opacity;
}

import type { KeyframeIndicatorVariant } from './KeyframeIndicator.js';

/**
 * Compute the diamond indicator's visual state for a single track on a
 * specific element at the current frame.
 *
 * B-003 simplified the rule to two states only:
 *   - `empty`    — no keyframe at `currentFrame` on this property
 *                  (whether or not a track exists elsewhere on the row)
 *   - `at-frame` — yes, there's a keyframe at `currentFrame` for this
 *                  property (drawn as a filled yellow diamond)
 *
 * Selection state intentionally does NOT change the indicator — it's
 * reflected on the lane diamond itself, not on the property row.
 * `selectedKeyframe` is accepted as a parameter for backwards-compat
 * but ignored.
 */
export function keyframeVariantFor(
  element: Element,
  property: AnimatableProperty,
  currentFrame: number,
  _selectedKeyframe: {
    elementId: string;
    property: AnimatableProperty;
    frame: number;
  } | null,
): KeyframeIndicatorVariant {
  void _selectedKeyframe;
  const track = trackOf(element, property);
  if (track === undefined) return 'empty';
  if (track.keyframes.some((k) => k.frame === currentFrame)) return 'at-frame';
  return 'empty';
}
