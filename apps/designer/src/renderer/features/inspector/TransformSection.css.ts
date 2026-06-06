import { style } from '@vanilla-extract/css';
import { colors } from '../../theme.js';

export const col = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '0.35rem',
  padding: '0.1rem 0',
});

export const icon = style({
  color: colors.textMuted,
  fontSize: '0.65rem',
  fontWeight: 600,
  width: '12px',
  flexShrink: 0,
  textAlign: 'center',
});

export const input = style({
  background: 'transparent',
  color: colors.text,
  border: 'none',
  outline: 'none',
  padding: '0.1rem 0',
  fontSize: '0.72rem',
  flex: '1 1 0',
  minWidth: 0,
  boxSizing: 'border-box',
  fontVariantNumeric: 'tabular-nums',
});

// Unit fields size to their content (see .cg-num-unit) so the value and
// its unit cluster on the left next to the icon, not at the far edge.
export const inputUnit = style({
  background: 'transparent',
  color: colors.text,
  border: 'none',
  outline: 'none',
  padding: '0.1rem 0',
  fontSize: '0.72rem',
  flex: '0 0 auto',
  width: 'auto',
  minWidth: 0,
  maxWidth: '5rem',
  boxSizing: 'border-box',
  fontVariantNumeric: 'tabular-nums',
});

// Pushes the keyframe diamond to the field's right edge.
export const point = style({
  marginLeft: 'auto',
  display: 'inline-flex',
  alignItems: 'center',
  flexShrink: 0,
});

// The whole field/segment is a drag-to-scrub + click-to-edit surface.
export const scrubSurface = style({
  cursor: 'ew-resize',
  touchAction: 'none',
  userSelect: 'none',
});
