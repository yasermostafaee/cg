import { liveSourceMask, type LiveSourceMask, type MaskHole } from '@cg/shared-schema';

/**
 * 1.5c — **apply a {@link LiveSourceMask} to an element, in ONE place.**
 *
 * ── WHY THIS IS EIGHT PROPERTIES AND NOT FOUR ───────────────────────────────
 *
 * The CEF baseline is Chromium 71 (`CEF_CHROMIUM_BASELINE`), where the unprefixed
 * `mask-*` longhands are not implemented — `-webkit-mask-*` is the supported
 * spelling. The production build is far newer (CasparCG 2.5.0 / CEF Chromium 142),
 * which has both. Setting BOTH costs nothing, works on either, and is exactly what
 * the plant probe (`tools/live-source-punch-probe/punch-probe.html`) was MEASURED
 * with — so the product applies the mask the same way the measurement did.
 *
 * 🔴 **`mask-mode: luminance` is the load-bearing line, and it is why `mode` travels
 * INSIDE the mask value rather than beside it.** `liveSourceMask` encodes its holes
 * in luminance — white keeps, black punches — while CSS `mask-image` defaults to
 * `mask-mode: alpha`, where `#fff` and `#000` are BOTH fully opaque. Under the
 * default this mask applies perfectly and punches NOTHING: a no-op indistinguishable
 * from a mask that never applied. That exact no-op shipped in the probe, read at the
 * plant as "mechanism B fails", and briefly promoted design.md §9b to the live
 * architecture. Chromium's own name for the property before 120 is
 * `-webkit-mask-source-type`, hence the pair.
 */
export function applyLiveSourceMask(style: CSSStyleDeclaration, mask: LiveSourceMask): void {
  style.setProperty('-webkit-mask-image', mask.image);
  style.setProperty('mask-image', mask.image);
  style.setProperty('-webkit-mask-size', mask.size);
  style.setProperty('mask-size', mask.size);
  style.setProperty('-webkit-mask-repeat', mask.repeat);
  style.setProperty('mask-repeat', mask.repeat);
  style.setProperty('-webkit-mask-source-type', mask.mode);
  style.setProperty('mask-mode', mask.mode);
}

/**
 * Every property {@link applyLiveSourceMask} writes — so a test can assert ABSENCE
 * without re-listing them, which is how a ninth property would come to be dropped
 * from the check that guards it.
 */
export const LIVE_SOURCE_MASK_PROPERTIES: readonly string[] = [
  '-webkit-mask-image',
  'mask-image',
  '-webkit-mask-size',
  'mask-size',
  '-webkit-mask-repeat',
  'mask-repeat',
  '-webkit-mask-source-type',
  'mask-mode',
];

/**
 * Remove every property {@link applyLiveSourceMask} writes.
 *
 * 🔴 **This is the half of the re-punch that is easy to forget and expensive to omit.** The
 * build-time rule is that an element nothing punches carries NO mask property at all — so on
 * a re-punch, an element that HAD a hole and no longer has one must have its properties
 * REMOVED, not left standing. A stale mask is a hole in a backdrop with nothing behind it:
 * black, on air, in the shape of a box that is no longer there.
 */
export function clearLiveSourceMask(style: CSSStyleDeclaration): void {
  for (const property of LIVE_SOURCE_MASK_PROPERTIES) style.removeProperty(property);
}

/** One element the re-punch can reach: its node and the box its mask is expressed in. */
export interface PunchTarget {
  readonly node: HTMLElement;
  readonly width: number;
  readonly height: number;
}

/**
 * ⭐ **`multibox-layout-switch` `tasks.md` 4.3 — THE RE-PUNCH PASS.**
 *
 * ── WHY THIS IS A REASSIGNMENT AND NOT A RE-EXPORT ──────────────────────────
 *
 * The mask is INLINE CSS on a live node (design.md §6), and a runtime mask path already
 * exists for stamped scopes — so making the mask follow a mutation needs the properties
 * rewritten on the nodes that are already there, not the scene rebuilt. Rebuilding would
 * discard every piece of live state the page is holding: a playing animation's progress, a
 * `<video>`'s decode position, a sequence's dwell, the operator's field values. UNIT B′ is
 * about the mask keeping up with a moving plate; it must not cost the page its content.
 *
 * ── THE THREE CASES, AND THE ONE THAT IS NOT OBVIOUS ────────────────────────
 *
 * - **had a hole, has a (possibly different) hole** → reassign the properties.
 * - **had no hole, has one now** → assign them. Reachable because every element is
 *   registered as a target at build time, not just the ones that were punched then.
 * - 🔴 **had a hole, has NONE now** → {@link clearLiveSourceMask}. This is the case a
 *   "reassign what is in the map" implementation silently drops, and it is the one that
 *   puts black on air.
 */
export function repunchLiveSourceHoles(
  targets: ReadonlyMap<string, PunchTarget>,
  masks: ReadonlyMap<string, readonly MaskHole[]>,
): void {
  for (const [key, target] of targets) {
    const holes = masks.get(key);
    const mask =
      holes === undefined || holes.length === 0
        ? null
        : liveSourceMask([...holes], { width: target.width, height: target.height });
    if (mask === null) {
      clearLiveSourceMask(target.node.style);
      continue;
    }
    applyLiveSourceMask(target.node.style, mask);
  }
}
