import { style } from '@vanilla-extract/css';
import { colors } from '../../theme.js';

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
  width: '1px',
  backgroundColor: '#484a58',
});

export const tickLabel = style({
  position: 'absolute',
  transform: 'translateX(-50%)',
  color: colors.textMuted,
  fontSize: '0.66rem',
  lineHeight: '34px',
});

export const startTickLabel = style([tickLabel, { left: '4px', transform: 'none' }]);
export const endTickLabel = style([tickLabel, { right: '4px', transform: 'none' }]);

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
