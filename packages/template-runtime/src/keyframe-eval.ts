import type { AnimatableProperty, Easing, Keyframe, KeyframeValue, Track } from '@cg/shared-schema';

/**
 * Interpolate a Track's value at a given frame.
 *
 * Contract:
 *   - Caller passes a Track with `keyframes.length >= 1` (schema-enforced).
 *   - `frame < keyframes[0].frame` → returns the first keyframe's value (no
 *     pre-roll extrapolation).
 *   - `frame >= keyframes[last].frame` → returns the last keyframe's value.
 *   - Otherwise interpolates between the two surrounding keyframes using
 *     the *outgoing* easing of the earlier keyframe.
 */
export function interpolateAtFrame(track: Track, frame: number): KeyframeValue {
  const kfs = track.keyframes;
  const first = kfs[0];
  const last = kfs[kfs.length - 1];
  if (first === undefined || last === undefined) {
    throw new Error('Track.keyframes is empty');
  }
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
  const eased = applyEasing(prev.easing, t);
  return lerpValue(prev.value, next.value, eased);
}

/** Map `t ∈ [0,1]` through an easing curve. `step` is handled by the caller. */
export function applyEasing(easing: Easing, t: number): number {
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

function lerpValue(a: KeyframeValue, b: KeyframeValue, t: number): KeyframeValue {
  if (typeof a === 'number' && typeof b === 'number') return a + (b - a) * t;
  if (typeof a === 'string' && typeof b === 'string') return lerpHexColor(a, b, t);
  // Mixed types — schema doesn't allow this, but be defensive: snap to `a`.
  return a;
}

/**
 * Lerp two `#RRGGBB` or `#RRGGBBAA` hex strings componentwise. Returns a
 * `#RRGGBB` if both inputs lack alpha, otherwise `#RRGGBBAA`.
 */
export function lerpHexColor(a: string, b: string, t: number): string {
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
  const s = hex.startsWith('#') ? hex.slice(1) : hex;
  const r = parseInt(s.slice(0, 2), 16);
  const g = parseInt(s.slice(2, 4), 16);
  const b = parseInt(s.slice(4, 6), 16);
  if (s.length === 8) {
    return { r, g, b, a: parseInt(s.slice(6, 8), 16) };
  }
  return { r, g, b };
}

function hex2(n: number): string {
  const v = Math.max(0, Math.min(255, n));
  return v.toString(16).padStart(2, '0').toUpperCase();
}

/** Properties whose interpolated value is a number; everything else is a hex color. */
const COLOR_PROPS = new Set<AnimatableProperty>(['fill.color', 'text.color']);

export function isColorProperty(p: AnimatableProperty): boolean {
  return COLOR_PROPS.has(p);
}
