import { style } from '@vanilla-extract/css';
import { colors } from '../../theme.js';

export const section = style({
  borderTop: `1px solid ${colors.border}`,
  display: 'flex',
  flexDirection: 'column',
});

export const header = style({
  display: 'flex',
  alignItems: 'center',
  gap: '0.35rem',
  padding: '0.3rem 0.1rem',
  color: colors.textMuted,
  fontSize: '0.68rem',
  fontWeight: 700,
  letterSpacing: '0.06em',
  cursor: 'pointer',
  background: 'transparent',
  border: 'none',
  textAlign: 'left',
  width: '100%',
});

export const chevron = style({
  width: '16px',
  display: 'inline-block',
  color: colors.textMuted,
  fontSize: '0.95rem',
  lineHeight: 1,
  textAlign: 'center',
});

export const trailing = style({
  marginLeft: 'auto',
  color: colors.textMuted,
});

export const body = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '0.1rem',
  paddingBottom: '0.25rem',
});
