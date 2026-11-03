import { style } from '@vanilla-extract/css';
import { colors } from '../../theme.js';

export const heading = style({
  display: 'grid',
  gridTemplateColumns: 'minmax(7rem, 0.75fr) minmax(10rem, 1.25fr) auto',
  gap: '0.55rem',
  padding: '0 0.55rem 0.35rem',
  color: colors.textMuted,
  fontSize: '0.7rem',
  fontWeight: 600,
  '@media': { 'screen and (max-width: 540px)': { display: 'none' } },
});

export const rows = style({
  display: 'grid',
  gap: '0.45rem',
});

export const row = style({
  display: 'grid',
  gridTemplateColumns: 'minmax(7rem, 0.75fr) minmax(10rem, 1.25fr) auto',
  gap: '0.55rem',
  alignItems: 'center',
  padding: '0.55rem',
  border: `1px solid ${colors.border}`,
  borderRadius: '7px',
  background: colors.panelMuted,
  '@media': {
    'screen and (max-width: 540px)': {
      gridTemplateColumns: '1fr',
      gap: '0.35rem',
    },
  },
});

export const mobileLabel = style({
  display: 'none',
  color: colors.textMuted,
  fontSize: '0.7rem',
  fontWeight: 600,
  '@media': { 'screen and (max-width: 540px)': { display: 'block' } },
});

export const remove = style({
  justifySelf: 'end',
  '@media': { 'screen and (max-width: 540px)': { marginTop: '0.15rem' } },
});

export const error = style({
  margin: '0.65rem 0 0',
  color: colors.danger,
  fontSize: '0.76rem',
  lineHeight: 1.45,
});

export const warning = style({
  margin: '0.65rem 0 0',
  color: colors.caution,
  fontSize: '0.76rem',
  lineHeight: 1.45,
});

export const bottom = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '0.75rem',
  marginTop: '0.8rem',
  paddingTop: '0.75rem',
  borderTop: `1px solid ${colors.border}`,
  color: colors.textMuted,
  fontSize: '0.75rem',
  '@media': {
    'screen and (max-width: 430px)': { alignItems: 'stretch', flexDirection: 'column' },
  },
});
