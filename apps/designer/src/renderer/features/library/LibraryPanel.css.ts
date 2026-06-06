import { style } from '@vanilla-extract/css';
import { colors } from '../../theme.js';

export const panel = style({
  background: colors.panel,
  border: `1px solid ${colors.border}`,
  borderRadius: '0.25rem',
  padding: '0.75rem',
  display: 'flex',
  flexDirection: 'column',
  gap: '0.5rem',
  minHeight: 0,
  overflowY: 'auto',
  width: '100%',
  boxSizing: 'border-box',
});

export const heading = style({
  fontSize: '0.85rem',
  fontWeight: 700,
  color: colors.textMuted,
  letterSpacing: '0.05em',
  margin: 0,
});

export const button = style({
  background: colors.panelMuted,
  color: colors.text,
  border: `1px solid ${colors.border}`,
  padding: '0.4rem 0.6rem',
  borderRadius: '0.25rem',
  cursor: 'pointer',
  textAlign: 'left',
  fontSize: '0.85rem',
});

export const buttonPrimary = style({
  background: colors.accent,
  color: '#000',
  border: 'none',
  fontWeight: 700,
});

export const list = style({ display: 'flex', flexDirection: 'column', gap: '0.3rem' });

export const sub = style({ fontSize: '0.75rem', color: colors.textMuted, margin: 0 });

export const select = style({
  background: colors.panelMuted,
  color: colors.text,
  border: `1px solid ${colors.border}`,
  padding: '0.3rem 0.4rem',
  borderRadius: '0.25rem',
  fontSize: '0.85rem',
});
