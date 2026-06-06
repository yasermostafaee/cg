import { style } from '@vanilla-extract/css';
import { colors } from '../../theme.js';

export const body = style({
  color: colors.textMuted,
  fontSize: '0.8rem',
  lineHeight: 1.5,
  margin: 0,
});

export const error = style({
  color: '#fda4af',
  fontSize: '0.76rem',
  margin: 0,
});
