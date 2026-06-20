import { style, styleVariants } from '@vanilla-extract/css';
import { colors } from '../theme.js';

/**
 * App-local Button/Control recipe — THE way to make an interactive button in the
 * Designer, built on the existing `renderer/theme.ts` palette (no new colours, no
 * `@cg/ui` change).
 *
 * `base` carries ONLY the interactive states every control must have — cursor,
 * focus-visible ring, disabled, active — and deliberately sets no layout, colour,
 * background, border, or padding. That lets the `bare` variant wrap a bespoke
 * surface (a menu item, a list row, the keyframe diamond) and inherit the states
 * without fighting that surface's own class. The `box` skeleton + variants supply
 * the resting chrome for ordinary labelled/icon buttons.
 */
export const base = style({
  appearance: 'none',
  cursor: 'pointer',
  userSelect: 'none',
  transition:
    'background 90ms ease, border-color 90ms ease, color 90ms ease, filter 90ms ease, box-shadow 90ms ease',
  selectors: {
    '&:focus-visible': { outline: 'none', boxShadow: `0 0 0 2px ${colors.accent}` },
    '&:disabled': { opacity: 0.4, cursor: 'not-allowed' },
    // Universal press feedback: darken whatever colour the variant resolves to
    // (tuned per-variant by construction). Variants may strengthen it.
    '&:active:not(:disabled)': { filter: 'brightness(0.88)' },
  },
});

/**
 * Chrome skeleton for ordinary labelled / icon buttons (everything but `bare`).
 * D-094 — NO default border: the recipe draws no resting outline; each variant's
 * affordance is its background fill / tint, not an edge. The focus-visible ring is the
 * `box-shadow` on `base` (unaffected). The SAVE control's amber unsaved `border-top`
 * (D-089) is an independent override applied on top, so it is unaffected.
 */
export const box = style({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '0.32rem',
  // Explicit `none` (not just omitted) so the user-agent `<button>` border is suppressed.
  border: 'none',
  borderRadius: '0.25rem',
  fontFamily: 'inherit',
  fontWeight: 600,
  lineHeight: 1.1,
  whiteSpace: 'nowrap',
  color: colors.text,
});

export const variant = styleVariants({
  /** Default action — a raised neutral surface (no outline); the fill IS the affordance. */
  secondary: {
    background: colors.border,
    selectors: {
      '&:hover:not(:disabled)': { background: '#3a3f59' },
      '&:active:not(:disabled)': { background: colors.panelMuted },
    },
  },
  /** Accent fill — the primary call-to-action. Momentary, never a pressed toggle. */
  primary: {
    background: colors.accent,
    color: colors.onAccent,
    fontWeight: 700,
    selectors: {
      '&:hover:not(:disabled)': { filter: 'brightness(1.08)' },
      '&:active:not(:disabled)': { filter: 'brightness(0.9)' },
      '&:disabled': { background: colors.accent },
    },
  },
  /** Quiet, borderless — icon buttons, toolbar glyphs, low-emphasis actions. */
  ghost: {
    background: 'transparent',
    color: colors.textMuted,
    selectors: {
      '&:hover:not(:disabled)': { background: colors.menuHover, color: colors.text },
      '&:active:not(:disabled)': { background: colors.border, color: colors.text },
    },
  },
  /** Destructive — a faint rose fill + danger label (no outline), tinted up on hover. */
  danger: {
    background: 'rgba(248, 113, 113, 0.12)',
    color: colors.danger,
    selectors: {
      '&:hover:not(:disabled)': { background: 'rgba(248, 113, 113, 0.20)' },
      '&:active:not(:disabled)': { background: 'rgba(248, 113, 113, 0.28)' },
    },
  },
  /**
   * No chrome of its own — for bespoke interactive surfaces (layer/comp/asset
   * rows, menu items, the keyframe diamond). Applied WITHOUT the `box` skeleton, so
   * it adds nothing but the `base` states + the hover below; pair with a
   * `className` for the resting look. Because `bare` has no colour of its own, its
   * hover is tuned to whatever the surface already is:
   *   - a plain bare button (no `aria-pressed`) gets a neutral hover fill
   *     (`menuHover`) + a slight lighten — visible even on a transparent chip;
   *   - a pressed/active toggle (`aria-pressed="true"`, which sets its own active
   *     background via its className) keeps that background and is LIGHTENED on
   *     hover instead, so the neutral fill never clobbers the active colour;
   *   - press darkens (from `base`).
   * (A surface whose background is set INLINE — e.g. the keyframe diamond, an open
   * list row — keeps that inline background; the `filter` still gives hover feedback.)
   */
  bare: {
    selectors: {
      '&:hover:not(:disabled):not([aria-pressed="true"])': {
        background: colors.menuHover,
        filter: 'brightness(1.06)',
      },
      '&[aria-pressed="true"]:hover:not(:disabled)': { filter: 'brightness(1.15)' },
    },
  },
});

/** Text-button padding/sizes (not applied to `bare`). */
export const size = styleVariants({
  sm: { padding: '0.22rem 0.45rem', fontSize: '0.7rem' },
  md: { padding: '0.34rem 0.55rem', fontSize: '0.75rem' },
  lg: { padding: '0.45rem 0.8rem', fontSize: '0.82rem' },
  none: {},
});

/** Square icon-only sizes for {@link Control}. */
export const icon = styleVariants({
  xs: { padding: 0, width: '18px', height: '18px', fontSize: '0.78rem' },
  sm: { padding: 0, width: '22px', height: '22px', fontSize: '0.85rem' },
  md: { padding: 0, width: '26px', height: '26px', fontSize: '0.95rem' },
  lg: { padding: 0, width: '32px', height: '32px', fontSize: '1.05rem' },
});

/**
 * Pressed / selected state for toggles & segmented controls (aria-pressed). Defined
 * after `variant` so it wins the resting look; `:hover` still paints over it. D-094 —
 * a raised fill + an ACCENT-coloured label/glyph signals "pressed" (no accent ring).
 */
export const selected = style({
  background: '#3a3f59',
  color: colors.accent,
});
