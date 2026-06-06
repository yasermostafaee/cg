import { style } from '@vanilla-extract/css';
import { colors } from '../../theme.js';

export const heading = style({
  color: colors.accent,
  fontSize: '0.7rem',
  fontWeight: 700,
  letterSpacing: '0.05em',
  margin: '0.4rem 0 0.3rem',
  paddingTop: '0.35rem',
  borderTop: `1px solid ${colors.border}`,
});

export const presetRow = style({
  display: 'grid',
  gridTemplateColumns: '64px 1fr',
  alignItems: 'center',
  gap: '0.4rem',
  marginBottom: '0.45rem',
});

export const label = style({ color: colors.textMuted, fontSize: '0.7rem' });

export const select = style({
  background: colors.panelMuted,
  color: colors.text,
  border: `1px solid ${colors.border}`,
  borderRadius: '0.2rem',
  padding: '0.2rem 0.35rem',
  fontSize: '0.78rem',
  width: '100%',
});

export const graphWrap = style({
  background: colors.panelMuted,
  border: `1px solid ${colors.border}`,
  borderRadius: '0.3rem',
  padding: '0.3rem',
  display: 'flex',
  justifyContent: 'center',
});

export const ptRow = style({
  display: 'grid',
  gridTemplateColumns: '40px 1fr 1fr',
  alignItems: 'center',
  gap: '0.4rem',
  marginTop: '0.4rem',
});

export const axisInput = style({
  display: 'flex',
  alignItems: 'center',
  gap: '0.3rem',
  background: colors.panelMuted,
  border: `1px solid ${colors.border}`,
  borderRadius: '0.18rem',
  padding: '0.1rem 0.4rem',
});

export const axisLetter = style({ color: colors.textMuted, fontSize: '0.68rem' });

export const numInput = style({
  background: 'transparent',
  color: colors.text,
  border: 'none',
  outline: 'none',
  padding: 0,
  fontSize: '0.74rem',
  width: '100%',
  minWidth: 0,
  fontVariantNumeric: 'tabular-nums',
});
