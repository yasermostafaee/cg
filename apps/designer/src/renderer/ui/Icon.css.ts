import { style } from '@vanilla-extract/css';

/**
 * Opt-in RTL mirror for directional icons (the keyframe-inspector back arrow, the
 * collapse / expand chevron, the layer-menu submenu arrow). Mirrors ONLY inside a
 * `[dir="rtl"]` subtree, so the default (LTR, or no ancestor `dir`) leaves the
 * icon unmirrored — preserving the deliberate no-mirror behaviour the Unicode
 * glyphs had. Applied by `Icon` when `flipRtl` is set.
 */
export const flipRtl = style({
  selectors: {
    '[dir="rtl"] &': { transform: 'scaleX(-1)' },
  },
});
