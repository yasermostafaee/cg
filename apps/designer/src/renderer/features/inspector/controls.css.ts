import { style } from '@vanilla-extract/css';
import { colors } from '../../theme.js';

export const row = style({
  display: 'grid',
  gridTemplateColumns: `74px 1fr`,
  gap: '0.35rem',
  alignItems: 'center',
  padding: '0.1rem 0',
  fontSize: '0.74rem',
});

export const rowMulti = style({
  display: 'grid',
  gridTemplateColumns: `74px 1fr 1fr`,
  gap: '0.35rem',
  alignItems: 'center',
  padding: '0.1rem 0',
  fontSize: '0.74rem',
});

export const label = style({
  color: colors.textMuted,
  fontSize: '0.7rem',
  letterSpacing: '0.02em',
});

/**
 * `DESIGNER-FIX-0905` — a WITHHELD row: the control is present, disabled, and dimmed as a
 * whole (label included), so the row reads as "this exists and is unavailable here" at a
 * glance, with the reason on the control's tooltip. Hiding the row would teach nothing.
 */
export const rowWithheld = style({
  opacity: 0.55,
  cursor: 'not-allowed',
});

/**
 * `DESIGNER-FIX-0905` — a READ-ONLY fact in a field row (a video's source file, its size,
 * its conform): the value column of an ordinary row, in text colour, truncating rather than
 * wrapping so a long filename never turns a row back into a paragraph.
 */
export const readout = style({
  color: colors.text,
  fontSize: '0.74rem',
  fontVariantNumeric: 'tabular-nums',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  minWidth: 0,
});

export const inputInner = style({
  background: 'transparent',
  color: colors.text,
  border: 'none',
  outline: 'none',
  padding: 0,
  fontSize: '0.74rem',
  width: '100%',
  minWidth: 0,
  boxSizing: 'border-box',
  fontVariantNumeric: 'tabular-nums',
});

// Content-sized variant (see .cg-num-unit) so the value and its unit
// cluster on the left, leaving the diamond free to sit at the right edge.
export const inputInnerAuto = style({
  background: 'transparent',
  color: colors.text,
  border: 'none',
  outline: 'none',
  padding: 0,
  fontSize: '0.74rem',
  flex: '0 0 auto',
  width: 'auto',
  minWidth: 0,
  maxWidth: '5rem',
  boxSizing: 'border-box',
  fontVariantNumeric: 'tabular-nums',
});

// Single-letter / glyph axis label inside a combined vector segment.
export const segIcon = style({
  color: colors.textMuted,
  fontSize: '0.65rem',
  fontWeight: 600,
  width: '12px',
  flexShrink: 0,
  textAlign: 'center',
});

// Pushes the keyframe diamond to the field's right edge.
export const point = style({
  marginLeft: 'auto',
  display: 'inline-flex',
  alignItems: 'center',
  flexShrink: 0,
});

// The whole field/segment is a drag-to-scrub + click-to-edit surface.
export const scrubSurface = style({
  cursor: 'ew-resize',
  touchAction: 'none',
  userSelect: 'none',
});

export const hexInput = style({
  background: 'transparent',
  color: colors.text,
  border: 'none',
  outline: 'none',
  padding: '0.05rem 0',
  fontSize: '0.74rem',
  width: '100%',
  // D-079 — was `minWidth: 0`, which let the input collapse inside `.cg-field` and
  // clip the value. Fit the full hex (#RRGGBBAA = 9 chars) so it always shows.
  minWidth: '9ch',
  boxSizing: 'border-box',
  fontVariantNumeric: 'tabular-nums',
});
