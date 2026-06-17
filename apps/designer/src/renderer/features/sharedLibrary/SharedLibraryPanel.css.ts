import { style } from '@vanilla-extract/css';
import { colors } from '../../theme.js';

/** Shared library thumbnails are click-to-select (not drag sources like project assets). */
export const clickable = style({
  cursor: 'pointer',
});

/** Ring on the active (logo-tool target) library image. */
export const thumbActive = style({
  borderColor: colors.accent,
  boxShadow: `0 0 0 2px ${colors.accent}`,
});
