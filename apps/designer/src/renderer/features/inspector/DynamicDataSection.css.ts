import { style } from '@vanilla-extract/css';
import { colors } from '../../theme.js';

// Live duplicate-key warning under the Data key input.
export const warn = style({
  margin: '0.1rem 0 0.3rem',
  color: colors.danger,
  fontSize: '0.68rem',
  lineHeight: 1.4,
});

// Hint shown while the element has no Data key (still static).
export const hint = style({
  margin: '0.2rem 0',
  color: colors.textMuted,
  fontSize: '0.68rem',
  lineHeight: 1.4,
});

export const checkbox = style({
  width: '14px',
  height: '14px',
  accentColor: colors.accent,
  cursor: 'pointer',
  margin: 0,
});
