import { style } from '@vanilla-extract/css';
import { colors } from '../../theme.js';

export const bar = style({
  display: 'grid',
  gridTemplateColumns: '1fr auto 1fr',
  alignItems: 'center',
  gap: '0.45rem',
  padding: '0.3rem 0.75rem',
  background: colors.panel,
  border: `1px solid ${colors.border}`,
  borderRadius: '0.22rem',
  fontSize: '0.74rem',
  flexShrink: 0,
});

export const group = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '0.3rem',
  gridColumn: 2,
});

export const groupDivider = style({
  width: '1px',
  height: '14px',
  background: colors.border,
  margin: '0 0.25rem',
});

export const button = style({
  background: 'transparent',
  color: colors.text,
  border: `1px solid ${colors.border}`,
  borderRadius: '0.18rem',
  fontSize: '0.78rem',
  padding: '0.2rem 0.5rem',
  cursor: 'pointer',
  lineHeight: 1,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
});

// Hover and selected use a brighter background instead of a border accent.
export const buttonHover = style({
  background: 'rgba(255, 255, 255, 0.10)',
});

export const buttonActive = style({
  background: 'rgba(255, 255, 255, 0.18)',
  color: colors.accent,
});

export const frameReadout = style({
  color: colors.textMuted,
  fontSize: '0.72rem',
  fontVariantNumeric: 'tabular-nums',
  paddingLeft: '0.5rem',
  justifySelf: 'end',
  gridColumn: 3,
});

export const icon = style({ display: 'block' });
