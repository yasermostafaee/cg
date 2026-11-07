import { style } from '@vanilla-extract/css';
import { colors } from '../../theme.js';

export const list = style({
  display: 'grid',
  gap: '0.45rem',
});

export const row = style({
  display: 'grid',
  gridTemplateColumns: '18px 64px minmax(0, 1fr) auto',
  alignItems: 'center',
  gap: '0.55rem',
  minHeight: '58px',
  padding: '0.45rem 0.55rem',
  border: `1px solid ${colors.border}`,
  borderRadius: '6px',
  background: colors.panelMuted,
});

export const thumbFrame = style({
  width: '64px',
  height: '42px',
  display: 'grid',
  placeItems: 'center',
  overflow: 'hidden',
  padding: '0.2rem',
  boxSizing: 'border-box',
  border: `1px solid ${colors.border}`,
  borderRadius: '5px',
  background: colors.background,
});

export const thumb = style({
  width: 'auto',
  height: 'auto',
  maxWidth: '100%',
  maxHeight: '100%',
  objectFit: 'contain',
  objectPosition: 'center',
});

export const thumbMissing = style({
  color: colors.textMuted,
  fontSize: '0.75rem',
});

export const name = style({
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  color: colors.text,
});

export const source = style({
  color: colors.textMuted,
  fontSize: '0.72rem',
});

export const empty = style({
  margin: 0,
  color: colors.textMuted,
  lineHeight: 1.5,
});

export const summary = style({
  margin: '0.65rem 0 0',
  color: colors.textMuted,
  fontSize: '0.75rem',
});
