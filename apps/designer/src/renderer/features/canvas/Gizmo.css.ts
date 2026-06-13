import { style } from '@vanilla-extract/css';
import { colors } from '../../theme.js';

// Visible corner square (screen px) — mirrors the HANDLE constant in Gizmo.tsx.
const HANDLE = 8;
// Corner resize hover/hit area — mirrors CORNER_HIT.
const CORNER_HIT = 18;
// Rotation hover area around each corner — mirrors ROT_ZONE.
const ROT_ZONE = 18;

// Per-instance geometry (left/top/width/height/transform) and per-handle
// cursor are applied inline; these classes carry the shared chrome.

export const frame = style({
  position: 'absolute',
  border: `1px solid ${colors.accent}`,
  boxSizing: 'border-box',
  pointerEvents: 'none',
});

// D-041 — per-element selected affordance in a multi-selection: a faint dashed
// outline. The solid `frame` above is reused for the single union bounding box.
export const memberOutline = style({
  position: 'absolute',
  border: `1px dashed ${colors.accent}`,
  opacity: 0.55,
  boxSizing: 'border-box',
  pointerEvents: 'none',
});

// Loopic-style corner handle: white fill, accent outline. Visual only — the
// (larger) cornerHit area below owns the resize gesture.
export const handle = style({
  position: 'absolute',
  width: `${HANDLE}px`,
  height: `${HANDLE}px`,
  background: '#FFF',
  border: `1px solid ${colors.accent}`,
  boxSizing: 'border-box',
  pointerEvents: 'none',
});

export const cornerHit = style({
  position: 'absolute',
  width: `${CORNER_HIT}px`,
  height: `${CORNER_HIT}px`,
  pointerEvents: 'auto',
  // No `background` — the .cg-gizmo-corner:hover rule paints the highlight, and
  // an inline value would beat it.
});

export const rotZone = style({
  position: 'absolute',
  width: `${ROT_ZONE}px`,
  height: `${ROT_ZONE}px`,
  pointerEvents: 'auto',
  background: 'transparent',
});

export const edge = style({
  position: 'absolute',
  pointerEvents: 'auto',
  // No `background` — .cg-gizmo-edge:hover paints the highlight.
});

// Centre pivot indicator (visual only).
export const pivot = style({
  position: 'absolute',
  width: '7px',
  height: '7px',
  borderRadius: '50%',
  border: `1px solid ${colors.accent}`,
  background: '#FFF',
  boxSizing: 'border-box',
  pointerEvents: 'none',
});
