import { style } from '@vanilla-extract/css';

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

/**
 * D-058 — per-corner mode stacks the four radius inputs as TWO rows (top row =
 * top-left / top-right, bottom row = bottom-left / bottom-right) so each input
 * has ~2x the width and shows a full 2-3 digit value without clipping. Each row
 * is a {@link VectorField}; the two share the label gutter so their inputs align.
 */
export const corners = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '0.15rem',
  minWidth: 0,
});

// D-092 — the uniform / per-corner toggle icons moved to the shared lucide `Icon`
// (`Square` / `Maximize`) in StyleSection's RadiusToggle; the old vanilla-extract
// `iconUniform` / `iconPerCorner` styles (and their ICON / line / ARM / THICK
// constants) were removed as dead code.
