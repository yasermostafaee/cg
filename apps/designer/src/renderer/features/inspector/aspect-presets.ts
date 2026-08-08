import type { Transform } from '@cg/shared-schema';

/**
 * D-147 — named aspect PRESETS for a Live Source, and the plate-fitting arithmetic
 * beside them.
 *
 * **The stored value is still a NUMBER.** These presets are an authoring affordance
 * over `expectedAspect`, not a new representation of it — no schema change beyond
 * the field becoming optional, no migration, and a scene written by hand with
 * `1.85` still loads and shows as `Custom…`.
 *
 * **Why the ratio AND the decimal appear in every label.** `16:9` and `1.78` are two
 * spellings of one number, and the field takes the decimal. An author reading `1.78`
 * cannot tell at a glance whether it is 16:9 or a typo for 1.7; an author reading
 * `16:9` cannot tell what the field will hold. Printing both removes the ambiguity
 * that prompted this item.
 *
 * Pure and DOM-free so the fit arithmetic is testable without mounting the
 * Inspector — the geometry is the part that can be wrong.
 */

/** The `— not specified —` sentinel: no assertion about the source's shape. */
export const ASPECT_UNSPECIFIED = 'unspecified';
/** The `Custom…` sentinel: the numeric input is revealed and owns the value. */
export const ASPECT_CUSTOM = 'custom';

export interface AspectPreset {
  /** Stable key — the `<option>` value, never shown to the author. */
  readonly key: string;
  /** `16:9` — the ratio spelling. */
  readonly ratio: string;
  /** The number actually stored in `expectedAspect`. */
  readonly value: number;
}

/**
 * The starting list. Ordered widest-common-first rather than numerically: the
 * author is picking a FORMAT they recognise, not sorting numbers.
 */
export const ASPECT_PRESETS: readonly AspectPreset[] = [
  { key: '16:9', ratio: '16:9', value: 16 / 9 },
  { key: '4:3', ratio: '4:3', value: 4 / 3 },
  { key: '21:9', ratio: '21:9', value: 21 / 9 },
  { key: '2.39:1', ratio: '2.39:1', value: 2.39 },
  { key: '1:1', ratio: '1:1', value: 1 },
  { key: '9:16', ratio: '9:16', value: 9 / 16 },
];

/**
 * How close a stored number must be to a preset to READ as that preset.
 *
 * Absolute, on the ratio itself, and deliberately small. `16/9` is `1.7778` and an
 * author who typed `1.78` meant 16:9 — that is 0.0022 away and must match. `21:9`
 * (`2.3333`) and `2.39:1` are 0.057 apart and must NOT collapse into one another,
 * which is what rules out a loose tolerance.
 */
export const ASPECT_TOLERANCE = 0.005;

/** The preset a stored value reads as, or `Custom…` / `— not specified —`. */
export function presetKeyFor(value: number | undefined): string {
  if (value === undefined) return ASPECT_UNSPECIFIED;
  const hit = ASPECT_PRESETS.find((p) => Math.abs(p.value - value) <= ASPECT_TOLERANCE);
  return hit?.key ?? ASPECT_CUSTOM;
}

/** `16:9 (1.78)` — both spellings, always. */
export function presetLabel(preset: AspectPreset): string {
  return `${preset.ratio} (${preset.value.toFixed(2)})`;
}

/** The option label for a key, including the two sentinels. */
export function optionLabelFor(key: string, value: number | undefined): string {
  if (key === ASPECT_UNSPECIFIED) return '— not specified —';
  if (key === ASPECT_CUSTOM) {
    // The custom label carries the number too, so the collapsed select still says
    // what the field holds rather than only that it is unusual.
    return value === undefined ? 'Custom…' : `Custom… (${value.toFixed(2)})`;
  }
  const preset = ASPECT_PRESETS.find((p) => p.key === key);
  return preset === undefined ? key : presetLabel(preset);
}

/** The number a preset key selects; `undefined` for the two sentinels. */
export function presetValueFor(key: string): number | undefined {
  return ASPECT_PRESETS.find((p) => p.key === key)?.value;
}

/**
 * The element's EFFECTIVE rendered aspect.
 *
 * `(w · scaleX) / (h · scaleY)` — the scale is part of what the viewer sees, and it
 * is NON-UNIFORM in general. Reading `w / h` alone would call a plate "16:9" that
 * renders at some other shape entirely, which is precisely the arithmetic this
 * feature exists to take off the author.
 */
export function effectiveAspect(t: Transform): number {
  const w = t.size.w * t.scale.x;
  const h = t.size.h * t.scale.y;
  return h === 0 ? Number.NaN : w / h;
}

/** Whether the plate already renders at `aspect`, within {@link ASPECT_TOLERANCE}. */
export function matchesAspect(t: Transform, aspect: number): boolean {
  const eff = effectiveAspect(t);
  return Number.isFinite(eff) && Math.abs(eff - aspect) <= ASPECT_TOLERANCE;
}

/**
 * The rendered box's far edges in SCENE pixels, for an axis-aligned plate.
 *
 * Mirrors `off-frame.ts`'s `localToParent` with `rotation === 0` (a Live Source is
 * axis-aligned in v1): scaling happens about the ANCHOR, so the bottom edge is
 * `y + h·(anchorY + scaleY·(1 − anchorY))`, not `y + h·scaleY`. Getting that wrong
 * would make the bottom-edge guard below fire at the wrong moment — the guard whose
 * whole job is to not create the preflight error it exists to avoid.
 */
function farEdges(t: Transform, w: number, h: number): { right: number; bottom: number } {
  return {
    right: t.position.x + w * (t.anchor.x + t.scale.x * (1 - t.anchor.x)),
    bottom: t.position.y + h * (t.anchor.y + t.scale.y * (1 - t.anchor.y)),
  };
}

export interface AspectFit {
  /** The new authored `size` (pre-scale), to be written back verbatim. */
  readonly size: { w: number; h: number };
  /** Which dimension was held fixed. */
  readonly preserved: 'width' | 'height';
}

/**
 * Resize the plate so its EFFECTIVE aspect equals `aspect`, preserving `x`, `y` and
 * — normally — `w`.
 *
 * `scale` is never touched: it is a separate authored property, and silently
 * normalising it would move the plate's pivot behaviour for a change the author
 * asked to be about size.
 *
 * **The bottom-edge flip.** Solving for `h` can push the plate past the bottom of
 * the frame, and out-of-frame is a preflight ERROR for a Live Source — so an action
 * offered as a convenience would have manufactured a blocking error. When that
 * happens it preserves `h` and solves for `w` instead. That flip always lands inside
 * the frame for a plate that STARTED inside it: needing a taller `h` means the plate
 * is relatively too wide, so the height-preserving solution is NARROWER than the `w`
 * it replaces. (A plate already out of frame is already the error; this action is
 * not its fix, and the caller's tooltip says which side was preserved either way.)
 */
export function fitToAspect(
  t: Transform,
  aspect: number,
  scene: { width: number; height: number },
): AspectFit | null {
  const sx = t.scale.x;
  const sy = t.scale.y;
  if (!(aspect > 0) || !(sx > 0) || !(sy > 0)) return null;

  // Preserve W: (w·sx) / (h·sy) = aspect  ⇒  h = (w·sx) / (aspect·sy)
  const h = (t.size.w * sx) / (aspect * sy);
  if (!Number.isFinite(h) || h <= 0) return null;
  if (farEdges(t, t.size.w, h).bottom <= scene.height) {
    return { size: { w: t.size.w, h }, preserved: 'width' };
  }

  // Preserve H: w = (h·sy·aspect) / sx
  const w = (t.size.h * sy * aspect) / sx;
  if (!Number.isFinite(w) || w <= 0) return null;
  return { size: { w, h: t.size.h }, preserved: 'height' };
}
