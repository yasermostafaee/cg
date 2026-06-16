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

// Four corner brackets (an L at each corner) — matches the reference's per-corner
// glyph. Eight background segments: a horizontal + a vertical arm per corner.
const line = 'linear-gradient(currentColor, currentColor)';
const ARM = '4px';
const THICK = '1.5px';

/** Per-corner mode — a square drawn as four corner brackets (⌜⌝⌞⌟). */
export const iconPerCorner = style({
  display: 'inline-block',
  width: ICON,
  height: ICON,
  boxSizing: 'border-box',
  backgroundImage: `${line}, ${line}, ${line}, ${line}, ${line}, ${line}, ${line}, ${line}`,
  backgroundRepeat: 'no-repeat',
  // tl-h, tl-v, tr-h, tr-v, bl-h, bl-v, br-h, br-v
  backgroundSize: `${ARM} ${THICK}, ${THICK} ${ARM}, ${ARM} ${THICK}, ${THICK} ${ARM}, ${ARM} ${THICK}, ${THICK} ${ARM}, ${ARM} ${THICK}, ${THICK} ${ARM}`,
  backgroundPosition: '0 0, 0 0, 100% 0, 100% 0, 0 100%, 0 100%, 100% 100%, 100% 100%',
});
