import { style } from '@vanilla-extract/css';
import { colors } from '../../theme.js';

export const stack = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '0.45rem',
});

export const summary = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  flexWrap: 'wrap',
  gap: '0.4rem',
});

export const summaryActive = style({
  padding: '0.42rem 0.48rem',
  background: 'rgba(56, 189, 248, 0.1)',
  borderInlineStart: `3px solid ${colors.accent}`,
  borderRadius: '0.25rem',
});

export const status = style({
  color: colors.textMuted,
  fontSize: '0.72rem',
});

export const statusActive = style({
  color: colors.accent,
  fontSize: '0.72rem',
  fontWeight: 700,
});

export const activeMarker = style({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '0.3rem',
  padding: '0.18rem 0.38rem',
  color: colors.accent,
  background: 'rgba(56, 189, 248, 0.1)',
  border: `1px solid ${colors.accentMuted}`,
  borderRadius: '999px',
  fontSize: '0.67rem',
  fontWeight: 700,
  whiteSpace: 'nowrap',
});

export const activeDot = style({
  width: '0.42rem',
  height: '0.42rem',
  flexShrink: 0,
  background: colors.accent,
  borderRadius: '999px',
  boxShadow: '0 0 0 3px rgba(56, 189, 248, 0.13)',
});

export const list = style({
  listStyle: 'none',
  margin: 0,
  padding: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: '0.4rem',
});

export const rule = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '0.3rem',
  padding: '0.4rem',
  border: `1px solid ${colors.border}`,
  borderRadius: '0.25rem',
});

export const ruleHead = style({
  display: 'flex',
  alignItems: 'center',
  gap: '0.25rem',
});

export const ruleTitle = style({
  flex: 1,
  minWidth: 0,
  fontSize: '0.74rem',
  fontWeight: 600,
});

export const condition = style({
  display: 'grid',
  gridTemplateColumns: 'minmax(6rem, 0.8fr) minmax(7rem, 1.2fr)',
  gap: '0.3rem',
  alignItems: 'start',
  '@media': {
    '(max-width: 520px)': { gridTemplateColumns: '1fr' },
  },
});

export const actions = style({
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: '0.3rem',
});

export const grow = style({ flex: '1 1 10rem', minWidth: 0 });
