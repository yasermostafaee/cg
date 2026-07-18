import { style, styleVariants } from '@vanilla-extract/css';
import { colors, hoverWash, pressWash } from '../theme.js';

/**
 * App-local Button/Control recipe — THE way to make an interactive button in the
 * Designer, built on the existing `renderer/theme.ts` palette (no new colours, no
 * `@cg/ui` change).
 *
 * `base` carries the interactive states every control must have — cursor, focus-visible
 * ring, disabled, hover, press — plus a user-agent chrome reset, and sets no LAYOUT or
 * colour of its own. That lets the `bare` variant wrap a bespoke surface (a menu item, a
 * list row, the keyframe diamond) and inherit the states without fighting that surface's
 * own class. The `box` skeleton + variants supply the resting chrome for ordinary
 * labelled/icon buttons.
 *
 * STATE RULE — every hover/press is a WASH layered over the control's own resting colour
 * (`theme.state` + `theme.wash`), applied once in `base`. No variant defines its own
 * hover background: a variant that did would either clobber a `bare` consumer's colour
 * (the "+ New project" accent button turning grey) or drift out of hue. If you are adding
 * a variant, give it a resting colour and nothing else.
 */
export const base = style({
  appearance: 'none',
  cursor: 'pointer',
  userSelect: 'none',
  // ── User-agent chrome reset (the app-wide "why does this button have a light border
  // and a pale box?" bug) ────────────────────────────────────────────────────────────
  // `box` already resets these, but `bare` is applied WITHOUT `box`, so every bare
  // consumer whose className didn't happen to re-reset them inherited the UA button
  // look: a 2px outset `buttonborder`, a `buttonface` fill, and the UA font. That is
  // what made "Clear all recent" and the "animation details" disclosure read as boxed
  // controls in a flat dark UI. Resetting HERE fixes every consumer at the root rather
  // than per call-site. `box`/`variant`/`size` are defined after `base` in this file,
  // so their background/padding/colour still win for the non-bare variants.
  border: 'none',
  background: 'none',
  padding: 0,
  margin: 0,
  font: 'inherit',
  color: 'inherit',
  transition:
    'background 90ms ease, border-color 90ms ease, color 90ms ease, filter 90ms ease, box-shadow 90ms ease',
  selectors: {
    // Focus ring: a background-coloured GAP then the accent ring, so it stays visible on
    // an accent-filled button too (a bare accent ring on `primary` / "+ New project" was
    // invisible — ring colour on ring colour).
    '&:focus-visible': {
      outline: 'none',
      boxShadow: `0 0 0 2px ${colors.background}, 0 0 0 4px ${colors.accent}`,
    },
    '&:disabled': { opacity: 0.4, cursor: 'not-allowed' },
    // ── The ONLY hover/press feedback in the recipe ────────────────────────────────
    // A wash LAYERED over whatever background the variant (or a `bare` consumer's own
    // class) resolved to — never a replacement colour. So every variant keeps its
    // identity across resting → hover → active automatically, and a new variant cannot
    // regress into a hardcoded neutral hover: there is nothing per-variant to write.
    // Default tone: `onDark` — the neutral chrome and the faint tints. A LIGHT,
    // saturated variant re-declares the tone (see `primary`); it never invents a colour.
    '&:hover:not(:disabled)': { backgroundImage: hoverWash('onDark') },
    '&:active:not(:disabled)': { backgroundImage: pressWash('onDark') },
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
  },
  /** Accent fill — the primary call-to-action. Momentary, never a pressed toggle. */
  primary: {
    background: colors.accent,
    color: colors.onAccent,
    fontWeight: 700,
    selectors: {
      // The accent is a LIGHT, saturated surface, so it takes the `onLight` tone: it
      // DARKENS on hover instead of lightening. `base`'s `onDark` white wash barely
      // moved it (the "primary hover is hard to see" report) and washed the blue toward
      // pastel; this keeps the same blue and matches the modal Cancel's perceived step.
      '&:hover:not(:disabled)': { backgroundImage: hoverWash('onLight') },
      '&:active:not(:disabled)': { backgroundImage: pressWash('onLight') },
      // Keep the accent when disabled (dimmed by `base`'s opacity).
      '&:disabled': { background: colors.accent },
    },
  },
  /** Quiet, borderless — icon buttons, toolbar glyphs, low-emphasis actions. */
  ghost: {
    background: 'transparent',
    color: colors.textMuted,
    // The FILL comes from the shared wash (on the dark chrome it lands within a hair of
    // the old `menuHover`). Only the label step is ghost-specific: a muted glyph must
    // resolve to full text on hover, which is an in-family step, not a new colour.
    selectors: {
      '&:hover:not(:disabled)': { color: colors.text },
      '&:active:not(:disabled)': { color: colors.text },
    },
  },
  /**
   * MARKER-TIED actions — an Inspector button that creates/controls a timeline marker
   * wears that marker's own colour, so the button and the mark it drops read as one
   * thing ("drag the cyan marker" now has a cyan button beside it). A faint tint + a
   * marker-coloured label: recognizable, not loud. Colours come from the SAME tokens the
   * timeline markers use (`theme.markerOut` / `markerIn`) — one source, no drift.
   */
  markerOut: {
    background: colors.markerOutSurface,
    color: colors.markerOut,
  },
  markerIn: {
    background: colors.markerInSurface,
    color: colors.markerIn,
  },
  /** Destructive — a faint rose fill + danger label (no outline), tinted up on hover. */
  danger: {
    background: 'rgba(248, 113, 113, 0.12)',
    color: colors.danger,
  },
  /**
   * No chrome of its own — for bespoke interactive surfaces (layer/comp/asset rows, menu
   * items, the keyframe diamond, the accent "+ New project"). Applied WITHOUT the `box`
   * skeleton; pair with a `className` for the resting look.
   *
   * Deliberately EMPTY. It used to hard-set a neutral `menuHover` fill on hover, which
   * clobbered the resting colour of every bare consumer that brought its own — the
   * accent "+ New project" button turned grey on hover. `base`'s wash layers over
   * whatever the consumer's class resolved to (transparent, neutral, accent, or a marker
   * tint) and needs no special-casing here, including for `aria-pressed` toggles.
   */
  bare: {},
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
