import { style } from '@vanilla-extract/css';
import { colors } from '../../theme.js';

/**
 * ⭐ `DESIGNER-FIX-0905` §4 — **the ONE legible default for inline inspector text.**
 *
 * Every panel had its own `hint` / `caption` / `empty` / `summary` / `muted` class, and
 * they had drifted DOWN together: 0.62–0.68rem, muted grey, set across the full width of
 * a 320 px column. The panel reserved its only good typographic treatment for the red
 * refusal block. These tokens are what stays inline now that the teaching has moved
 * behind the `i`: one size that survives a narrow inspector, a line-height that lets a
 * two-line state be read as two lines, and a measure capped so the eye does not have to
 * track a 60-character line in a narrow column.
 *
 * `inline` is for text the author ACTS on (a state and its remedy) — full text colour.
 * `inlineMuted` is for a caption that only qualifies a control. Nothing here is red: the
 * refusal block keeps the danger treatment, and it is louder now precisely because
 * everything around it is shorter.
 */
const base = {
  fontSize: '0.76rem',
  lineHeight: 1.45,
  margin: '0.25rem 0',
  maxWidth: '46ch',
} as const;

export const inline = style({ ...base, color: colors.text });

export const inlineMuted = style({ ...base, color: colors.textMuted });

/** A short uppercase tag beside a state — `inert`, `empty`, `active`. */
export const tag = style({
  display: 'inline-block',
  fontSize: '0.6rem',
  fontWeight: 600,
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
  padding: '0.05rem 0.3rem',
  borderRadius: '0.2rem',
  background: colors.panelMuted,
  color: colors.textMuted,
  verticalAlign: 'middle',
  marginInlineEnd: '0.3rem',
});

/** The same tag, for a state worth NOTICING (an inert control, an empty range). */
export const tagCaution = style([
  tag,
  { background: colors.cautionSurface, color: colors.caution },
]);

/** The same tag, for a state that is doing its job. */
export const tagActive = style([tag, { color: colors.accent }]);
