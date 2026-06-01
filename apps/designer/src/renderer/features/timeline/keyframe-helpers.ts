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

function disp(id: string, label: string, read: (el: Element) => string): TimelineRowEntry {
  return { kind: 'display', row: { id, label, read } };
}

function pct(v: number): string {
  return `${String(Math.round(v))}%`;
}

function hex(s: string | undefined, fallback = '000000'): string {
  if (s === undefined) return fallback;
  return s.startsWith('#') ? s.slice(1).toUpperCase() : s.toUpperCase();
}

/**
 * Filter rows (shape + text + image). The display always shows the
 * value the runtime will apply — i.e. brightness/contrast/saturate
 * default to 100%, everything else to 0.
 */
const FILTER_ROWS: readonly TimelineRowEntry[] = [
  disp('filter.blur', 'Blur', (el) => String(el.filter?.blur ?? 0)),
  disp('filter.brightness', 'Brightness', (el) => pct(el.filter?.brightness ?? 100)),
  disp('filter.contrast', 'Contrast', (el) => pct(el.filter?.contrast ?? 100)),
  disp('filter.grayscale', 'Grayscale', (el) => pct(el.filter?.grayscale ?? 0)),
  disp('filter.hueRotate', 'Hue rotate', (el) => String(el.filter?.hueRotate ?? 0)),
  disp('filter.invert', 'Invert', (el) => pct(el.filter?.invert ?? 0)),
  disp('filter.opacity', 'Opacity', (el) => pct(el.filter?.opacity ?? 100)),
  disp('filter.saturate', 'Saturate', (el) => pct(el.filter?.saturate ?? 100)),
  disp('filter.sepia', 'Sepia', (el) => pct(el.filter?.sepia ?? 0)),
];

const FILTER_GROUP: TimelineGroup = { title: 'FILTER', rows: FILTER_ROWS };

/** Path-style group for shapes (D-010-pic-0). */
function pathStyleGroup(): TimelineGroup {
  return {
    title: 'PATH STYLE',
    rows: [
      disp('fill', 'Fill', (el) =>
        el.type === 'shape' && el.fill?.kind === 'solid' ? hex(el.fill.color) : '—',
      ),
      disp('stroke', 'Stroke', (el) =>
        el.type === 'shape' ? hex(el.stroke?.color) : '—',
      ),
      disp('stroke.width', 'Stroke width', (el) =>
        el.type === 'shape' ? String(el.stroke?.width ?? 0) : '—',
      ),
      disp('stroke.dash', 'Stroke dasharray', (el) =>
        el.type === 'shape' ? String(el.stroke?.dash?.[0] ?? 0) : '—',
      ),
    ],
  };
}

/** Border-radius group (single Radius row, both shape & text). */
function borderRadiusGroup(): TimelineGroup {
  return {
    title: 'BORDER RADIUS',
    rows: [
      disp('cornerRadius', 'Radius', (el) => {
        const r =
          el.type === 'shape'
            ? typeof el.cornerRadius === 'number'
              ? el.cornerRadius
              : Array.isArray(el.cornerRadius)
                ? el.cornerRadius[0]
                : 0
            : el.type === 'text'
              ? (el.cornerRadius ?? 0)
              : 0;
        return String(r);
      }),
    ],
  };
}

/** Drop-shadow group — shape reads from .shadow, text reads from .textShadow. */
function dropShadowGroup(): TimelineGroup {
  function shadowOf(el: Element): { offsetX: number; offsetY: number; blur: number; color: string } | undefined {
    if (el.type === 'shape') return el.shadow;
    if (el.type === 'text') return el.textShadow;
    return undefined;
  }
  return {
    title: 'DROP SHADOW',
    rows: [
      disp('shadow.offsetX', 'Offset X', (el) => String(shadowOf(el)?.offsetX ?? 0)),
      disp('shadow.offsetY', 'Offset Y', (el) => String(shadowOf(el)?.offsetY ?? 0)),
      disp('shadow.blur', 'Blur', (el) => String(shadowOf(el)?.blur ?? 0)),
      disp('shadow.color', 'Color', (el) => hex(shadowOf(el)?.color)),
    ],
  };
}

/** Text group (text element only). */
function textGroup(): TimelineGroup {
  return {
    title: 'TEXT',
    rows: [
      disp('font.size', 'Font size', (el) => (el.type === 'text' ? String(el.font.size) : '—')),
      disp('text.color', 'Color', (el) => (el.type === 'text' ? hex(el.color) : '—')),
      disp('text.bg', 'Background color', (el) =>
        el.type === 'text' ? hex(el.backgroundColor, 'FFFFFF') : '—',
      ),
      disp('font.lineHeight', 'Line height', (el) =>
        el.type === 'text' ? String(el.font.lineHeight) : '—',
      ),
      disp('font.letterSpacing', 'Letter spacing', (el) =>
        el.type === 'text' ? String(el.font.letterSpacing) : '—',
      ),
    ],
  };
}

/** Text-padding group (text element only). */
function textPaddingGroup(): TimelineGroup {
  return {
    title: 'TEXT PADDING',
    rows: [
      disp('padding.top', 'Padding top', (el) =>
        el.type === 'text' ? String(el.padding?.top ?? 0) : '—',
      ),
      disp('padding.right', 'Padding right', (el) =>
        el.type === 'text' ? String(el.padding?.right ?? 0) : '—',
      ),
      disp('padding.bottom', 'Padding bottom', (el) =>
        el.type === 'text' ? String(el.padding?.bottom ?? 0) : '—',
      ),
      disp('padding.left', 'Padding left', (el) =>
        el.type === 'text' ? String(el.padding?.left ?? 0) : '—',
      ),
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
