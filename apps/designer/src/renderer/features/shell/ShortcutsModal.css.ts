import { style } from '@vanilla-extract/css';
import { colors } from '../../theme.js';

export const table = style({
  width: '100%',
  borderCollapse: 'collapse',
});

export const headTh = style({
  textAlign: 'left',
  color: colors.accent,
  fontSize: '0.64rem',
  fontWeight: 700,
  letterSpacing: '0.07em',
  padding: '0.35rem 0.6rem',
  borderBottom: `1px solid ${colors.border}`,
});

export const keysTd = style({
  padding: '0.42rem 0.6rem',
  color: colors.text,
  fontVariantNumeric: 'tabular-nums',
  whiteSpace: 'nowrap',
  width: '45%',
});

export const fnTd = style({
  padding: '0.42rem 0.6rem',
  color: colors.textMuted,
});

export const rowAlt = style({
  background: 'rgba(255,255,255,0.035)',
});
