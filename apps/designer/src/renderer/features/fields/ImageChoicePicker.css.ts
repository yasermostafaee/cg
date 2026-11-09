import { globalStyle, style } from '@vanilla-extract/css';
import { colors } from '../../theme.js';

export const trigger = style({
  width: '100%',
  minWidth: 0,
  minHeight: '2.25rem',
  display: 'grid',
  gridTemplateColumns: '1.8rem minmax(0, 1fr) auto',
  alignItems: 'center',
  gap: '0.45rem',
  padding: '0.2rem 0.45rem',
  border: `1px solid ${colors.border}`,
  borderRadius: '0.25rem',
  background: colors.panelMuted,
  color: colors.text,
  textAlign: 'start',
});

export const triggerThumb = style({
  width: '1.7rem',
  height: '1.55rem',
  display: 'grid',
  placeItems: 'center',
  overflow: 'hidden',
  borderRadius: '3px',
  background: colors.background,
  color: colors.textMuted,
});

globalStyle(`${triggerThumb} img`, {
  width: '100%',
  height: '100%',
  objectFit: 'contain',
});

export const triggerLabel = style({
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  fontSize: '0.78rem',
});

export const triggerHint = style({
  color: colors.accent,
  fontSize: '0.68rem',
  whiteSpace: 'nowrap',
});

export const grid = style({
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))',
  gap: '0.65rem',
});

export const choice = style({
  minWidth: 0,
  display: 'grid',
  gridTemplateRows: '96px auto',
  gap: '0.4rem',
  padding: '0.45rem',
  border: `1px solid ${colors.border}`,
  borderRadius: '6px',
  background: colors.panelMuted,
  color: colors.text,
  selectors: {
    '&[aria-pressed="true"]': {
      borderColor: colors.accent,
      boxShadow: `0 0 0 1px ${colors.accent}`,
    },
  },
});

export const choiceThumb = style({
  width: '100%',
  height: '100%',
  minWidth: 0,
  minHeight: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  overflow: 'hidden',
  padding: '0.45rem',
  boxSizing: 'border-box',
  borderRadius: '4px',
  background: colors.background,
  color: colors.textMuted,
});

globalStyle(`${choiceThumb} img`, {
  display: 'block',
  width: '100%',
  height: '100%',
  minWidth: 0,
  minHeight: 0,
  objectFit: 'contain',
  objectPosition: 'center',
});

export const choiceLabel = style({
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  fontSize: '0.72rem',
  textAlign: 'center',
});
