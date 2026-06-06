import { style } from '@vanilla-extract/css';
import { colors } from '../../theme.js';

export const backdrop = style({
  position: 'fixed',
  inset: 0,
  background: 'rgba(0, 0, 0, 0.55)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 5000,
  padding: '1rem',
});

export const modal = style({
  display: 'flex',
  flexDirection: 'column',
  minHeight: 0,
  maxHeight: '82vh',
  background: colors.panel,
  border: `1px solid ${colors.border}`,
  borderRadius: '0.5rem',
  boxShadow: '0 16px 48px rgba(0,0,0,0.55)',
  color: colors.text,
  fontSize: '0.84rem',
});

export const header = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '0.75rem',
  padding: '0.7rem 0.9rem',
  borderBottom: `1px solid ${colors.border}`,
});

export const title = style({ fontSize: '0.95rem', fontWeight: 700, margin: 0 });

export const close = style({
  background: 'transparent',
  color: colors.textMuted,
  border: 'none',
  borderRadius: '0.2rem',
  width: '26px',
  height: '26px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  fontSize: '1.05rem',
  lineHeight: 1,
  padding: 0,
  flexShrink: 0,
});

export const body = style({
  minHeight: 0,
  overflowY: 'auto',
  padding: '0.9rem',
  display: 'flex',
  flexDirection: 'column',
  gap: '0.6rem',
});

export const footer = style({
  display: 'flex',
  justifyContent: 'flex-end',
  gap: '0.4rem',
  padding: '0.7rem 0.9rem',
  borderTop: `1px solid ${colors.border}`,
});
