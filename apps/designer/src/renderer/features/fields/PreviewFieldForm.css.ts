import { style } from '@vanilla-extract/css';
import { colors } from '../../theme.js';

export const controls = style({
  display: 'flex',
  gap: '0.3rem',
  flexWrap: 'wrap',
  marginBottom: '0.5rem',
});

export const btn = style({
  flex: '1 1 auto',
  background: colors.panelMuted,
  color: colors.text,
  border: `1px solid ${colors.border}`,
  borderRadius: '0.22rem',
  padding: '0.25rem 0.4rem',
  fontSize: '0.72rem',
  cursor: 'pointer',
});

export const playBtn = style({
  background: colors.accent,
  color: '#000',
  borderColor: colors.accentMuted,
  fontWeight: 700,
});

export const row = style({
  display: 'grid',
  gridTemplateColumns: '1fr',
  gap: '0.15rem',
  margin: '0.3rem 0',
});

export const label = style({
  color: colors.textMuted,
  fontSize: '0.7rem',
});

export const required = style({ color: colors.accent });

export const input = style({
  width: '100%',
  background: colors.panelMuted,
  color: colors.text,
  border: `1px solid ${colors.border}`,
  borderRadius: '0.2rem',
  padding: '0.2rem 0.35rem',
  fontSize: '0.74rem',
  boxSizing: 'border-box',
  outline: 'none',
});

export const inputInvalid = style({
  borderColor: colors.danger,
});

export const error = style({
  color: colors.danger,
  fontSize: '0.66rem',
  lineHeight: 1.3,
});

export const hint = style({
  color: colors.textMuted,
  fontSize: '0.68rem',
  lineHeight: 1.4,
  margin: '0.2rem 0',
});
