import { style } from '@vanilla-extract/css';
import { colors } from '../../theme.js';

export const rail = style({
  background: colors.panel,
  border: `1px solid ${colors.border}`,
  borderRadius: '0.25rem',
  padding: '0.5rem',
  display: 'flex',
  flexDirection: 'column',
  gap: '0.4rem',
  width: '56px',
});

export const button = style({
  width: '40px',
  height: '40px',
  background: 'transparent',
  color: colors.textMuted,
  border: `1px solid transparent`,
  borderRadius: '0.25rem',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  fontSize: '1.2rem',
});

export const buttonActive = style({
  color: colors.text,
  background: colors.panelMuted,
  border: `1px solid ${colors.border}`,
});
