import { style } from '@vanilla-extract/css';
import { colors } from '../../theme.js';

/**
 * D-048 — the four text-padding inputs side-by-side in ONE row (top / right /
 * bottom / left, left-to-right), each a compact cell carrying its keyframe
 * diamond. Matches the Loopic reference (D-048-textpadding-0.png). Layout only —
 * the values, commit path, and per-input diamonds are unchanged.
 */
export const row = style({
  display: 'grid',
  gridTemplateColumns: 'repeat(4, 1fr)',
  gap: '0.3rem',
  alignItems: 'center',
  padding: '0.1rem 0',
});

/** Compact override on the shared `cg-field` box so four fit in one row. */
export const cell = style({
  padding: '0.25rem 0.4rem',
  gap: '2px',
});

export const input = style({
  background: 'transparent',
  color: colors.text,
  border: 'none',
  outline: 'none',
  padding: 0,
  fontSize: '0.72rem',
  flex: '1 1 0',
  minWidth: 0,
  width: '100%',
  boxSizing: 'border-box',
  fontVariantNumeric: 'tabular-nums',
});
