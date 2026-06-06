import { style } from '@vanilla-extract/css';
import { colors } from '../../theme.js';

export const cell = style({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: '0.25rem',
  fontSize: '0.7rem',
  color: colors.textMuted,
  textAlign: 'center',
  cursor: 'grab',
  userSelect: 'none',
});

// List variant: thumbnail and label on one line, full panel width.
export const cellList = style({
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'center',
  gap: '0.5rem',
  fontSize: '0.7rem',
  color: colors.textMuted,
  cursor: 'grab',
  userSelect: 'none',
  padding: '0.15rem 0.3rem',
  borderRadius: '0.25rem',
});

export const thumb = style({
  width: '56px',
  height: '56px',
  borderRadius: '0.3rem',
  background: colors.panelMuted,
  border: `1px solid ${colors.border}`,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  overflow: 'hidden',
  color: colors.textMuted,
  fontSize: '0.78rem',
  fontWeight: 700,
  letterSpacing: '0.04em',
});

export const thumbList = style({
  width: '30px',
  height: '30px',
  flex: 'none',
  borderRadius: '0.25rem',
});

export const thumbImg = style({
  width: '100%',
  height: '100%',
  objectFit: 'cover',
  display: 'block',
});

export const caption = style({
  width: '64px',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  fontSize: '0.65rem',
});

export const captionList = style({
  flex: 1,
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  fontSize: '0.72rem',
  textAlign: 'left',
});

export const metaType = style({
  flex: 'none',
  fontSize: '0.68rem',
  color: colors.textMuted,
  textTransform: 'uppercase',
  letterSpacing: '0.03em',
});

export const metaSize = style({
  flex: 'none',
  fontSize: '0.68rem',
  color: colors.textMuted,
  fontVariantNumeric: 'tabular-nums',
  minWidth: '52px',
  textAlign: 'right',
});
