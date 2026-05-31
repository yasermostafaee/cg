import type { AnimatableProperty, Element, Track } from '@cg/shared-schema';

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
