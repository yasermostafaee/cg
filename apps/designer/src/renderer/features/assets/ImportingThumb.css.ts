import { keyframes, style } from '@vanilla-extract/css';
import { colors } from '../../theme.js';

const spin = keyframes({
  from: { transform: 'rotate(0deg)' },
  to: { transform: 'rotate(360deg)' },
});

/** Small rotating spinner inside the thumb frame. */
export const spinner = style({
  width: '18px',
  height: '18px',
  borderRadius: '50%',
  border: `2px solid ${colors.border}`,
  borderTopColor: colors.accent,
  animation: `${spin} 0.8s linear infinite`,
});
