import { style } from '@vanilla-extract/css';
import { colors } from '../../theme.js';

export const block = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '0.4rem',
});

export const list = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '0.45rem',
});

export const empty = style({ color: colors.textMuted, fontSize: '0.82rem' });

export const fieldCard = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '0.25rem',
  padding: '0.4rem 0.5rem',
  border: `1px solid ${colors.border}`,
  borderRadius: '0.25rem',
  background: colors.panelMuted,
});

export const cardHeader = style({
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: '0.5rem',
});

export const cardId = style({ fontSize: '0.78rem', color: colors.text, fontWeight: 600 });

export const cardType = style({
  fontSize: '0.7rem',
  color: colors.textMuted,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
});

export const cardActions = style({ display: 'flex', gap: '0.3rem' });

export const smallButton = style({
  background: 'transparent',
  color: colors.textMuted,
  border: `1px solid ${colors.border}`,
  padding: '0.15rem 0.45rem',
  borderRadius: '0.2rem',
  cursor: 'pointer',
  fontSize: '0.72rem',
});

export const smallButtonActive = style({
  background: 'rgba(56,189,248,0.2)',
  color: '#e0f2fe',
  borderColor: 'rgba(56,189,248,0.6)',
});

export const bindList = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '0.2rem',
  marginTop: '0.15rem',
});

export const bindRow = style({
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: '0.4rem',
  fontSize: '0.78rem',
  color: colors.text,
});

export const bindEmpty = style({
  fontSize: '0.75rem',
  color: colors.textMuted,
  fontStyle: 'italic',
});
