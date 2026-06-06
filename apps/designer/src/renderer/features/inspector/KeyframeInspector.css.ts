import { style } from '@vanilla-extract/css';
import { colors } from '../../theme.js';

export const panel = style({
  background: colors.panel,
  border: `1px solid ${colors.border}`,
  borderRadius: '0.25rem',
  padding: '0.6rem',
  display: 'flex',
  flexDirection: 'column',
  gap: '0.3rem',
  minHeight: 0,
  overflowY: 'auto',
  fontSize: '0.74rem',
  width: '100%',
  boxSizing: 'border-box',
});

export const topRow = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '0.4rem',
});

export const headingFirst = style({
  fontSize: '0.7rem',
  fontWeight: 700,
  color: colors.textMuted,
  letterSpacing: '0.06em',
  margin: 0,
});

export const heading = style({
  fontSize: '0.66rem',
  fontWeight: 700,
  color: colors.textMuted,
  letterSpacing: '0.06em',
  margin: '0.35rem 0 0.15rem',
  paddingTop: '0.35rem',
  borderTop: `1px solid ${colors.border}`,
});

export const row = style({
  display: 'grid',
  gridTemplateColumns: '90px 1fr',
  gap: '0.4rem',
  fontSize: '0.72rem',
  padding: '0.1rem 0',
});

export const label = style({ color: colors.textMuted, fontSize: '0.7rem' });

export const value = style({ color: colors.text, fontWeight: 500 });

export const removeButton = style({
  background: 'transparent',
  color: '#fda4af',
  border: `1px solid ${colors.border}`,
  padding: '0.15rem 0.4rem',
  borderRadius: '0.18rem',
  cursor: 'pointer',
  fontSize: '0.7rem',
  alignSelf: 'flex-start',
  marginTop: '0.3rem',
});

export const closeButton = style({
  background: 'transparent',
  color: colors.textMuted,
  border: `1px solid ${colors.border}`,
  padding: '0.1rem 0.35rem',
  borderRadius: '0.18rem',
  cursor: 'pointer',
  fontSize: '0.68rem',
});

export const mixedWarn = style({
  display: 'flex',
  alignItems: 'center',
  gap: '0.4rem',
  background: '#F5C84B',
  color: '#3a2e05',
  border: '1px solid #d9a92f',
  borderRadius: '0.25rem',
  padding: '0.45rem 0.55rem',
  fontSize: '0.74rem',
  margin: '0.3rem 0 0.1rem',
});
