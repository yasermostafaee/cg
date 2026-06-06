import { style } from '@vanilla-extract/css';
import { colors } from '../../theme.js';

// The repeating gridline background is applied inline (its period is dynamic).
export const outer = style({
  position: 'relative',
  height: '34px',
  backgroundColor: '#32364b',
  borderBottom: `1px solid ${colors.border}`,
  userSelect: 'none',
  cursor: 'default',
});

// `left` (the tick's frame position) is applied inline.
export const tick = style({
  position: 'absolute',
  top: 0,
  bottom: 0,
  color: colors.textMuted,
  fontSize: '0.66rem',
  paddingLeft: '4px',
  lineHeight: '34px',
});

// `left` (the playhead frame position) is applied inline.
export const playhead = style({
  position: 'absolute',
  top: 0,
  bottom: 0,
  width: 0,
  borderLeft: `1.5px solid ${colors.accent}`,
  pointerEvents: 'none',
  zIndex: 2,
});

export const playheadCap = style({
  position: 'absolute',
  top: '2px',
  transform: 'translateX(-50%)',
  background: colors.accent,
  color: '#000',
  fontSize: '0.66rem',
  fontWeight: 700,
  padding: '0 4px',
  borderRadius: '3px',
  lineHeight: '16px',
  pointerEvents: 'none',
  // Sit above the playhead line so the frame number isn't crossed by it.
  zIndex: 3,
});
