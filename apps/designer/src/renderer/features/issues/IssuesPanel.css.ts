import { style } from '@vanilla-extract/css';
import { colors } from '../../theme.js';

export const panel = style({
  background: colors.panel,
  border: `1px solid ${colors.border}`,
  borderRadius: '0.25rem',
  padding: '0.5rem 0.6rem',
  display: 'flex',
  flexDirection: 'column',
  gap: '0.3rem',
});

export const heading = style({
  fontSize: '0.78rem',
  fontWeight: 700,
  color: colors.textMuted,
  letterSpacing: '0.05em',
  margin: 0,
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
});

export const row = style({
  display: 'grid',
  gridTemplateColumns: 'auto 1fr',
  gap: '0.4rem',
  alignItems: 'baseline',
  fontSize: '0.78rem',
  cursor: 'pointer',
  padding: '0.15rem 0.2rem',
  borderRadius: '0.2rem',
});

export const rowText = style({ color: colors.text });

export const meta = style({ fontSize: '0.7rem', color: colors.textMuted, marginLeft: '0.3rem' });
