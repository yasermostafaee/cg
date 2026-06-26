import { style } from '@vanilla-extract/css';
import { colors } from '../../theme.js';

export const backdrop = style({
  position: 'fixed',
  inset: 0,
  zIndex: 1000,
});

// `minWidth`, `left` and `top` are applied inline (sourced from the JS clamp
// constants / pointer position).
export const menu = style({
  position: 'fixed',
  background: colors.panel,
  border: `1px solid ${colors.border}`,
  borderRadius: '0.3rem',
  padding: '0.25rem',
  boxShadow: '0 8px 24px rgba(0,0,0,0.45)',
  fontSize: '0.74rem',
  color: colors.text,
  userSelect: 'none',
});

export const item = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '0.5rem',
  padding: '0.3rem 0.5rem',
  borderRadius: '0.2rem',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
});

export const itemDisabled = style({
  opacity: 0.4,
  cursor: 'default',
});

// Keyboard-shortcut hint at the row's trailing edge (flex space-between) — in parentheses,
// smaller, muted gray.
export const shortcut = style({
  fontSize: '0.85em',
  color: '#9CA3AF',
});

export const divider = style({
  height: '1px',
  background: colors.border,
  margin: '0.25rem 0.2rem',
});

export const chevron = style({
  color: colors.textMuted,
  fontSize: '0.7rem',
});

// `width`, `left`, `top` and `maxHeight` are applied inline.
export const submenu = style({
  position: 'fixed',
  overflowY: 'auto',
  background: colors.panel,
  border: `1px solid ${colors.border}`,
  borderRadius: '0.3rem',
  padding: '0.25rem',
  boxShadow: '0 8px 24px rgba(0,0,0,0.45)',
});

export const swatchRow = style({
  display: 'flex',
  alignItems: 'center',
  gap: '0.5rem',
  padding: '0.22rem 0.45rem',
  borderRadius: '0.2rem',
  cursor: 'pointer',
});

// `background` (the swatch colour) is applied inline.
export const swatch = style({
  width: '13px',
  height: '13px',
  borderRadius: '3px',
  flexShrink: 0,
  border: '1px solid rgba(255,255,255,0.18)',
});
