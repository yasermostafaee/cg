import { style } from '@vanilla-extract/css';
import { colors } from '../theme.js';

/**
 * `DELTA-RUN-NEXT-VERSION-01-B` / `-C`, `RUN-NEXT-VERSION-03` 2.1 — the date & time control: one masked
 * date input and one masked time input in bordered boxes, each followed by its picker icon; the calendar
 * choice and the shortcuts on their own line; the other calendars' dates as facts. The pickers live in
 * the anchored panel (`Popover`), which draws their border and fill.
 *
 * A box is a `.cg-field` (`index.css`): that wrapper draws the border, hover and focus and keeps the
 * input inside it bare — without it the global input rule pads the input by 0.55rem a side and the
 * date runs past the Inspector at 200 % text (measured). Only what the field does not say lives here.
 */
export const group = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '0.3rem',
});

export const row = style({
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: '0.25rem',
});

/** One input and its picker icon, kept together when the row wraps. */
export const entry = style({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '0.15rem',
});

export const box = style({
  display: 'inline-flex',
  direction: 'ltr',
  unicodeBidi: 'isolate',
  fontSize: '0.72rem',
  fontVariantNumeric: 'tabular-nums',
});

const mask = {
  boxSizing: 'content-box',
  background: 'transparent',
  border: 'none',
  color: colors.text,
  fontFamily: 'inherit',
  fontSize: 'inherit',
  textAlign: 'center',
  outline: 'none',
} as const;

export const dateMask = style({ ...mask, width: '6.4em' });

export const timeMask = style({ ...mask, width: '5.2em' });

/** Why a keystroke or a paste was refused — the field's own line. */
export const refusal = style({
  margin: 0,
  color: colors.textMuted,
  fontSize: '0.7rem',
  lineHeight: 1.4,
});

export const grid = style({
  display: 'grid',
  gridTemplateColumns: 'repeat(7, 1.8rem)',
  gap: '0.1rem',
});

export const gridHead = style({
  gridColumn: '1 / -1',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  fontSize: '0.72rem',
});

export const weekday = style({
  textAlign: 'center',
  color: colors.textMuted,
  fontSize: '0.62rem',
});

/** The time picker: three columns (hours, minutes, seconds) that scroll on their own, then `Now`. */
export const clock = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '0.4rem',
});

export const clockCols = style({
  display: 'grid',
  gridTemplateColumns: 'repeat(3, 3rem)',
  gap: '0.3rem',
  direction: 'ltr',
});

export const clockCol = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '0.1rem',
  maxHeight: '13rem',
  overflowY: 'auto',
  fontVariantNumeric: 'tabular-nums',
});

export const clockHead = style({
  position: 'sticky',
  top: 0,
  textAlign: 'center',
  color: colors.textMuted,
  fontSize: '0.62rem',
  // The panel's own fill, so a scrolled column passes under the head, not through it.
  background: colors.panel,
});
