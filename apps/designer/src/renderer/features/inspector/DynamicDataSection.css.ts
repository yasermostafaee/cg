import { style } from '@vanilla-extract/css';
import { colors } from '../../theme.js';
import { inlineMuted } from './prose.css.js';

// Live duplicate-key warning under the Data key input.
export const warn = style({
  margin: '0.1rem 0 0.3rem',
  color: colors.danger,
  fontSize: '0.76rem',
  lineHeight: 1.45,
});

/**
 * Hint shown while the element has no Data key (still static). `DESIGNER-FIX-0905` §4 —
 * this class is imported as `dds.hint` by half the Inspector; it IS the shared legible
 * default now rather than a 0.68rem copy of it.
 */
export const hint = inlineMuted;

export const checkbox = style({
  width: '14px',
  height: '14px',
  accentColor: colors.accent,
  cursor: 'pointer',
  margin: 0,
});
