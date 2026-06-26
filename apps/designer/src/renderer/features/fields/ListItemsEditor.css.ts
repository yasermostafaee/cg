import { style } from '@vanilla-extract/css';
import { colors } from '../../theme.js';

export const list = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '0.25rem',
});

export const itemRow = style({
  display: 'flex',
  alignItems: 'center',
  gap: '0.2rem',
});

export const itemInput = style({
  flex: 1,
  minWidth: 0,
  background: colors.panelMuted,
  color: colors.text,
  border: `1px solid ${colors.border}`,
  borderRadius: '0.2rem',
  padding: '0.2rem 0.35rem',
  fontSize: '0.74rem',
  boxSizing: 'border-box',
  outline: 'none',
});

/** D-029 — the narrow per-item dwell (seconds) column for sequences. */
export const dwellInput = style({
  width: '3.2rem',
  background: colors.panelMuted,
  color: colors.text,
  border: `1px solid ${colors.border}`,
  borderRadius: '0.2rem',
  padding: '0.2rem 0.35rem',
  fontSize: '0.74rem',
  boxSizing: 'border-box',
  outline: 'none',
});

/** D-083 — the narrow per-item KIND picker (Text / Composition) for sequences. */
export const kindSelect = style({
  width: '6rem',
  flex: 'none',
  fontSize: '0.74rem',
});

export const addRow = style({
  marginTop: '0.3rem',
});

export const empty = style({
  color: colors.textMuted,
  fontSize: '0.68rem',
  lineHeight: 1.4,
  margin: '0.2rem 0',
});
