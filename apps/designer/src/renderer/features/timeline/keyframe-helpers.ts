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
  readonly read: (el: Element) => number;
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
