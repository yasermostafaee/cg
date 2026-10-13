import { style } from '@vanilla-extract/css';
import { colors } from '../../theme.js';

/**
 * `D-153` face 1 — the cell rectangles drawn over the canvas.
 *
 * ⚠ **Every rule here is non-interactive by construction.** The layer and the cells are
 * `pointer-events: none`, because the canvas below them is the whole editing surface: a
 * cell that ate a click would make the elements underneath unselectable, and "the canvas
 * stopped responding" is a far worse defect than the one this overlay fixes. Direct
 * manipulation of cells is a later, deliberate step (`D-153` 5.5).
 */

export const layer = style({
  position: 'absolute',
  inset: 0,
  pointerEvents: 'none',
  // Above the preview iframe's content, below the gizmo — the gizmo is what the author
  // acts through, and a cell outline must never sit on top of a resize handle.
  zIndex: 1,
});

const cellBase = {
  position: 'absolute',
  pointerEvents: 'none',
  boxSizing: 'border-box',
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'flex-start',
} as const;

export const cell = style({
  ...cellBase,
  border: `1px dashed ${colors.accent}`,
  // A wash rather than a fill: the author has to see the SCENE through the cell, since the
  // whole point is judging where a box sits against the design behind it.
  background: 'rgba(56, 189, 248, 0.07)',
});

/**
 * A cell with no box instance to hold.
 *
 * Deliberately a DIFFERENT dash and a warmer tint, not just a paler blue: this is the state
 * the owner was actually in — cells authored, no boxes made — and it has to read as "this
 * one is waiting for something" at a glance rather than as a slightly different cell.
 */
export const cellEmpty = style({
  ...cellBase,
  border: `1px dotted ${colors.caution}`,
  background: colors.cautionSurface,
});

export const label = style({
  display: 'inline-flex',
  alignItems: 'baseline',
  gap: '0.3rem',
  margin: '2px',
  padding: '1px 5px',
  borderRadius: '0.2rem',
  // Its own ground, so the label stays readable over any design underneath it.
  background: 'rgba(16, 20, 32, 0.82)',
  fontSize: '10px',
  lineHeight: 1.5,
  whiteSpace: 'nowrap',
  maxWidth: 'calc(100% - 4px)',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
});

export const index = style({
  color: colors.accent,
  fontWeight: 600,
  letterSpacing: '0.02em',
});

export const holder = style({ color: colors.text });

export const holderEmpty = style({ color: colors.caution, fontStyle: 'italic' });
