import { style } from '@vanilla-extract/css';
import { colors } from '../../theme.js';

// Fills a tall modal body: the preview stage on the left, the data form sidebar
// on the right.
export const layout = style({
  display: 'flex',
  gap: '0.7rem',
  flex: 1,
  minHeight: 0,
});

// The preview area. Letterbox is dark; the composition's own transparency
// checkerboard comes from inside the (scaled) iframe.
export const stage = style({
  position: 'relative',
  flex: 1,
  minWidth: 0,
  overflow: 'hidden',
  borderRadius: '0.3rem',
  border: `1px solid ${colors.border}`,
  background: colors.background,
});

// Native-resolution iframe, centred and scaled to fit the stage.
export const stageFrame = style({
  position: 'absolute',
  top: '50%',
  left: '50%',
  border: 0,
  display: 'block',
  background: 'transparent',
  transformOrigin: 'center',
});

export const sidebar = style({
  width: '320px',
  flexShrink: 0,
  overflowY: 'auto',
  minHeight: 0,
});
