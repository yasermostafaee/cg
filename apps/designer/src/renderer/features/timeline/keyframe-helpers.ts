import {
  cubicBezierEase,
  type AnimatableProperty,
  type Easing,
  type Element,
  type Keyframe,
  type Track,
  type Transform,
} from '@cg/shared-schema';
import {
  descriptorsForKind,
  keyframeableDescriptors,
  type PropertyDescriptor,
} from '../inspector/field-registry.js';

/**
 * Width of the left label column shared by the ruler row and every track
 * row. Keeping it in one place ensures Frame 0 in the ruler lines up with
 * the left edge of every lane.
 */
export const LABEL_COL_PX = 300;

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
  /** Dim unit shown after the value in the timeline / inspector (e.g. "%", "°"). */
  readonly unit?: string;
  /**
   * Multiplier between the STORED value and the DISPLAYED value — display =
   * stored × factor (and the edit path divides back). Lets scale / opacity
   * store 0–1 but show 0–100. Defaults to 1.
   */
  readonly factor?: number;
}

/** Map a central-registry descriptor to a timeline row (timeline label + dim unit/factor). */
function toTimelineRow(d: PropertyDescriptor): TimelineRow {
  return {
    label: d.timelineLabel ?? d.label,
    property: d.property,
    read: d.read,
    ...(d.unit !== undefined ? { unit: d.unit } : {}),
    ...(d.factor !== undefined ? { factor: d.factor } : {}),
  };
}

/**
 * The eight Transform rows (position/scale/rotation/size/opacity), DERIVED from the
 * central field registry (D-051) so the timeline, the right inspector, and the multi
 * editor share one source. Still exported because the right inspector's transform
 * diamond capture (`togglePropertyKeyframe`) and the Keyframe Inspector's row-label
 * lookup read it.
 */
export const TIMELINE_ROWS: readonly TimelineRow[] = descriptorsForKind('shape')
  .filter((d) => d.section === 'Transform')
  .map(toTimelineRow);

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

/**
 * Per-element-type group list for the timeline label column (D-010), GENERATED from
 * the central field registry (D-051) — the same source the right inspector and the
 * multi editor read, which is what guarantees right/left diamond parity. Each
 * keyframe-able descriptor for the element instance becomes an `animatable` row;
 * consecutive descriptors sharing a `section` group under that section's title, in
 * registry order (Transform · [kind-specific] · Filter). Every emitted row is
 * keyframe-able, so the timeline shows a diamond for exactly the animatable set.
 */
export function timelineGroupsFor(el: Element): readonly TimelineGroup[] {
  const groups: { title: string; rows: TimelineRowEntry[] }[] = [];
  for (const d of keyframeableDescriptors(el)) {
    const entry: TimelineRowEntry = { kind: 'animatable', row: toTimelineRow(d) };
    const last = groups[groups.length - 1];
    if (last !== undefined && last.title === d.section) last.rows.push(entry);
    else groups.push({ title: d.section, rows: [entry] });
  }
  return groups;
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
/**
 * Interpolate a track's value at `frame` — numeric OR hex colour — mirroring
 * the runtime's `interpolateAtFrame` (clamp before first / after last keyframe,
 * per-keyframe outgoing easing). Returns `null` only when the track is empty.
 * Kept local rather than imported from `@cg/template-runtime` because that drags
 * in an ambient `Window.cg?: TemplateRuntime` declaration that collides with the
 * Designer's `Window.cg: DesignerBridge` typing.
 */
function interpolateTrack(track: Track, frame: number): number | string | null {
  const kfs = track.keyframes;
  const first = kfs[0];
  const last = kfs[kfs.length - 1];
  if (first === undefined || last === undefined) return null;
  if (frame <= first.frame) return first.value;
  if (frame >= last.frame) return last.value;
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
  if (prev.easing === 'step') return prev.value;
  const span = next.frame - prev.frame;
  const t = span === 0 ? 1 : (frame - prev.frame) / span;
  const eased =
    prev.bezier !== undefined ? cubicBezierEase(prev.bezier, t) : applyEasing(prev.easing, t);
  return lerpKeyframeValue(prev.value, next.value, eased);
}

/** Numeric-only view of {@link interpolateTrack} for the transform/opacity samplers. */
function interpolateNumericTrack(track: Track, frame: number): number | null {
  const v = interpolateTrack(track, frame);
  return typeof v === 'number' ? v : null;
}

function lerpKeyframeValue(a: number | string, b: number | string, t: number): number | string {
  if (typeof a === 'number' && typeof b === 'number') return a + (b - a) * t;
  if (typeof a === 'string' && typeof b === 'string') return lerpHexColor(a, b, t);
  // Mixed types — schema doesn't allow this, but be defensive: snap to `a`.
  return a;
}

/** Lerp two `#RRGGBB`/`#RRGGBBAA` hex strings componentwise (mirrors the runtime). */
function lerpHexColor(a: string, b: string, t: number): string {
  const ca = parseHex(a);
  const cb = parseHex(b);
  const r = Math.round(ca.r + (cb.r - ca.r) * t);
  const g = Math.round(ca.g + (cb.g - ca.g) * t);
  const bl = Math.round(ca.b + (cb.b - ca.b) * t);
  const hasAlpha = ca.a !== undefined || cb.a !== undefined;
  if (!hasAlpha) return `#${hex2(r)}${hex2(g)}${hex2(bl)}`;
  const alpha = Math.round((ca.a ?? 255) + ((cb.a ?? 255) - (ca.a ?? 255)) * t);
  return `#${hex2(r)}${hex2(g)}${hex2(bl)}${hex2(alpha)}`;
}

function parseHex(hex: string): { r: number; g: number; b: number; a?: number } {
  const str = hex.startsWith('#') ? hex.slice(1) : hex;
  const r = parseInt(str.slice(0, 2), 16);
  const g = parseInt(str.slice(2, 4), 16);
  const b = parseInt(str.slice(4, 6), 16);
  if (str.length === 8) return { r, g, b, a: parseInt(str.slice(6, 8), 16) };
  return { r, g, b };
}

function hex2(n: number): string {
  const v = Math.max(0, Math.min(255, n));
  return v.toString(16).padStart(2, '0').toUpperCase();
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

/**
 * Value to DISPLAY for a property row: the interpolated value at `frame` when
 * the property is animated, otherwise the element's static value. Keeps the
 * timeline value column and the right Inspector in sync with what the canvas
 * shows — so editing a keyframe's value reflects immediately. (Colour tracks
 * fall back to the static value; numeric interpolation only.)
 */
export function effectiveRowValue(el: Element, row: TimelineRow, frame: number): number | string {
  return effectiveAnimatableValue(el, row.property, frame, row.read(el));
}

/**
 * The visually-effective value for an animatable property at `frame`: the
 * interpolated keyframe value (numeric OR colour) when the property has a track,
 * otherwise the supplied static `fallback`. This is the SINGLE source of truth the
 * inspector and timeline must reflect for DISPLAY, and the value a freshly-added
 * keyframe must CAPTURE — identical to what the canvas drag path samples via
 * {@link effectiveTransformAt}. Reading the static value instead is the root cause
 * of the diamond-reverts-position (B-005) and colour-display-stale (B-006) bugs.
 */
export function effectiveAnimatableValue(
  el: Element,
  property: AnimatableProperty,
  frame: number,
  fallback: number | string,
): number | string {
  const track = trackOf(el, property);
  if (track === undefined) return fallback;
  const v = interpolateTrack(track, frame);
  return v ?? fallback;
}

/** {@link effectiveAnimatableValue} narrowed to numbers (static `fallback` if unanimated). */
export function effectiveNumberAt(
  el: Element,
  property: AnimatableProperty,
  frame: number,
  fallback: number,
): number {
  const v = effectiveAnimatableValue(el, property, frame, fallback);
  return typeof v === 'number' ? v : fallback;
}

/** {@link effectiveAnimatableValue} narrowed to hex colours (static `fallback` if unanimated). */
export function effectiveColorAt(
  el: Element,
  property: AnimatableProperty,
  frame: number,
  fallback: string,
): string {
  const v = effectiveAnimatableValue(el, property, frame, fallback);
  return typeof v === 'string' ? v : fallback;
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
