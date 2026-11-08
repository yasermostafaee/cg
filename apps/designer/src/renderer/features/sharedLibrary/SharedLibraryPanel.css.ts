import { style } from '@vanilla-extract/css';
import { colors } from '../../theme.js';

/** Shared image thumbnails stay click-to-select and are also canvas drag sources. */
export const clickable = style({
  cursor: 'pointer',
});

/** Ring on the active (logo-tool target) library image. */
export const thumbActive = style({
  borderColor: colors.accent,
  boxShadow: `0 0 0 2px ${colors.accent}`,
});
