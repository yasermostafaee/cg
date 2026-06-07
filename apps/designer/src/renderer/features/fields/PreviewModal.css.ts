import { style } from '@vanilla-extract/css';
import { colors } from '../../theme.js';

// Clips the native-resolution iframe down to its scaled footprint and centres it.
export const stageWrap = style({
  position: 'relative',
  margin: '0 auto 0.7rem',
  overflow: 'hidden',
  borderRadius: '0.3rem',
  border: `1px solid ${colors.border}`,
  // Fallback checkerboard behind the (transparent-bodied) iframe.
  backgroundColor: '#3d4253',
  backgroundImage:
    'linear-gradient(45deg, #5b6075 25%, transparent 25%),' +
    'linear-gradient(-45deg, #5b6075 25%, transparent 25%),' +
    'linear-gradient(45deg, transparent 75%, #5b6075 75%),' +
    'linear-gradient(-45deg, transparent 75%, #5b6075 75%)',
  backgroundSize: '24px 24px',
  backgroundPosition: '0 0, 0 12px, 12px -12px, -12px 0',
});

export const stageFrame = style({
  border: 0,
  display: 'block',
  transformOrigin: '0 0',
  background: 'transparent',
});
