import { globalStyle, style } from '@vanilla-extract/css';
import { colors } from '../../theme.js';

export const section = style({
  minWidth: 0,
  paddingTop: '0.65rem',
  borderTop: `1px solid ${colors.border}`,
});

export const sourceRow = style({
  display: 'flex',
  flexWrap: 'wrap',
  gap: '0.5rem',
  marginBottom: '0.35rem',
});

export const modalSourceRow = style({
  display: 'flex',
  flexWrap: 'wrap',
  gap: '0.55rem',
  marginBottom: '0.65rem',
});

export const connectionStatus = style({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '0.3rem',
  fontSize: '0.76rem',
  fontWeight: 650,
});

export const connected = style({
  color: colors.checkPass,
});

export const disconnected = style({
  color: colors.textMuted,
});

export const updateNeeded = style({
  color: colors.caution,
});

export const path = style({
  display: 'flex',
  alignItems: 'baseline',
  gap: '0.45rem',
  flexWrap: 'wrap',
  minWidth: 0,
  overflowWrap: 'anywhere',
  color: colors.text,
  fontSize: '0.76rem',
  marginBottom: '0.3rem',
});

globalStyle(`${path} > span`, {
  color: colors.textMuted,
  fontSize: '0.68rem',
  fontWeight: 700,
  textTransform: 'uppercase',
});

globalStyle(`${path} > code`, {
  minWidth: 0,
  overflowWrap: 'anywhere',
  color: colors.text,
  fontFamily: 'inherit',
});

export const bulkHint = style({
  color: colors.textMuted,
  fontSize: '0.76rem',
  lineHeight: 1.45,
  margin: '0 0 0.75rem',
});

export const error = style({
  color: colors.danger,
  fontSize: '0.7rem',
  lineHeight: 1.35,
  margin: '0 0 0.45rem',
});

export const warning = style({
  color: colors.caution,
  fontSize: '0.72rem',
  lineHeight: 1.4,
  margin: '0 0 0.55rem',
});

export const notice = style({
  color: colors.accent,
  fontSize: '0.7rem',
  lineHeight: 1.35,
  margin: '0 0 0.45rem',
});
