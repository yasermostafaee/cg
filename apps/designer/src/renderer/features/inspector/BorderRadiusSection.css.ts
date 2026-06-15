import { style } from '@vanilla-extract/css';
import { colors } from '../../theme.js';

/**
 * D-055 — border-radius control layout: the field area (the labelled uniform field
 * or the four-corner group) followed by a single toggle pushed to the row's right
 * edge. The toggle's icon shape changes between uniform and per-corner mode.
 */
export const row = style({
  display: 'flex',
  alignItems: 'center',
  gap: '0.35rem',
});

/** The field area takes the remaining width; the toggle sits to its right. */
export const fields = style({
  flex: 1,
  minWidth: 0,
});

export const toggle = style({
  flex: '0 0 auto',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: colors.textMuted,
  padding: '2px 4px',
});

const ICON = 12;

/** Uniform mode — a simple rounded-corner square outline. */
export const iconUniform = style({
  display: 'inline-block',
  width: ICON,
  height: ICON,
  border: '1.5px solid currentColor',
  borderRadius: 3,
  boxSizing: 'border-box',
});

const corner = 'linear-gradient(currentColor, currentColor)';

/** Per-corner mode — four independent corner ticks (one per corner). */
export const iconPerCorner = style({
  display: 'inline-block',
  width: ICON,
  height: ICON,
  boxSizing: 'border-box',
  backgroundImage: `${corner}, ${corner}, ${corner}, ${corner}`,
  backgroundSize: '4px 4px',
  backgroundPosition: '0 0, 100% 0, 0 100%, 100% 100%',
  backgroundRepeat: 'no-repeat',
});
