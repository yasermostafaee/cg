import type { LiveSourceMask } from '@cg/shared-schema';

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
