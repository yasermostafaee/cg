import { style } from '@vanilla-extract/css';
import { colors } from '../../theme.js';

export const group = style({
  display: 'flex',
  alignItems: 'center',
  gap: '0.2rem',
});

export const button = style({
  width: '26px',
  height: '26px',
  background: 'transparent',
  color: colors.textMuted,
  border: 'none',
  borderRadius: '0.22rem',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  fontSize: '0.95rem',
  padding: 0,
});

// Hover and selected both use a brighter background (no border); selected
// is a touch brighter and brightens the icon so it still reads as active.
export const buttonHover = style({
  background: 'rgba(255, 255, 255, 0.10)',
});

export const buttonActive = style({
  color: colors.text,
  background: 'rgba(255, 255, 255, 0.18)',
});
