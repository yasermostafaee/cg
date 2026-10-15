import { style } from '@vanilla-extract/css';
import { colors } from '../theme.js';

/**
 * `DELTA-RUN-NEXT-VERSION-01-B` / `-C` — the date & time control: typed segments in bordered boxes,
 * the calendar choice and the shortcuts on their own line, and the other calendars' dates as facts.
 *
 * A box is a `.cg-field` (`index.css`): that wrapper draws the border, hover and focus and keeps the
 * inputs inside it bare — without it the global input rule pads every segment by 0.55rem a side and
 * the date alone runs past the Inspector at 200 % text (measured). Only what the field does not say
 * lives here.
 */
export const group = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '0.3rem',
});

export const box = style({
  display: 'inline-flex',
  gap: '0.1rem',
  direction: 'ltr',
  unicodeBidi: 'isolate',
  fontSize: '0.72rem',
  fontVariantNumeric: 'tabular-nums',
});

export const segment = style({
  width: '1.7em',
  boxSizing: 'content-box',
  background: 'transparent',
  border: 'none',
  color: colors.text,
  fontFamily: 'inherit',
  fontSize: 'inherit',
  textAlign: 'center',
});

export const yearSegment = style([segment, { width: '3em' }]);

export const separator = style({
  color: colors.textMuted,
  userSelect: 'none',
});

export const row = style({
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: '0.25rem',
});

export const grid = style({
  display: 'grid',
  gridTemplateColumns: 'repeat(7, 1.8rem)',
  gap: '0.1rem',
  padding: '0.3rem',
  border: `1px solid ${colors.border}`,
  borderRadius: '0.25rem',
  backgroundColor: colors.panelMuted,
  direction: 'ltr',
});

export const gridHead = style({
  gridColumn: '1 / -1',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  fontSize: '0.72rem',
});
