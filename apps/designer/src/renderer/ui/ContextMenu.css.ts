import { style } from '@vanilla-extract/css';
import { colors } from '../theme.js';

/**
 * B-058 — the app's SHARED context-menu chrome, extracted with the timeline
 * `LayerContextMenu` values as canonical (the app had six hand-rolled menus that
 * drifted on radius/shadow/padding/hover; this module is the single source both
 * the layer menu and the canvas anchor menu now consume — the other panels can
 * converge in a follow-up). Classes only — the two consumers keep their own
 * (different, both correct) interaction models: the layer menu's JS-hover divs
 * and the anchor menu's keyboard-complete `Control` buttons.
 *
 * `minWidth`, `left` and `top` are applied inline by consumers (viewport clamp).
 */

export const backdrop = style({
  position: 'fixed',
  inset: 0,
  zIndex: 1000,
});

export const menu = style({
  position: 'fixed',
  zIndex: 1001,
  background: colors.panel,
  border: `1px solid ${colors.border}`,
  borderRadius: '0.3rem',
  padding: '0.25rem',
  boxShadow: '0 8px 24px rgba(0,0,0,0.45)',
  fontSize: '0.74rem',
  color: colors.text,
  userSelect: 'none',
});

/**
 * One menu row. Carries the button resets a `Control variant="bare"` consumer
 * needs (the layer menu's divs ignore them), and a hover/focus rule written at
 * the SAME specificity as the bare Control's own hover (plus `filter: none`) so
 * the app's cyan menu-hover tint wins over the bare variant's gray brightness —
 * the drift the D-123 menu shipped with (B-058).
 */
export const item = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '0.5rem',
  width: '100%',
  padding: '0.3rem 0.5rem',
  borderRadius: '0.2rem',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
  background: 'none',
  border: 'none',
  textAlign: 'start',
  font: 'inherit',
  color: 'inherit',
  selectors: {
    '&:hover:not(:disabled):not([aria-pressed="true"]):not([hidden])': {
      background: 'rgba(56, 189, 248, 0.16)',
      filter: 'none',
    },
    '&:focus-visible': {
      background: 'rgba(56, 189, 248, 0.16)',
    },
  },
});

export const itemDisabled = style({
  opacity: 0.4,
  cursor: 'default',
});

// Keyboard-shortcut hint at the row's trailing edge (flex space-between) — in
// parentheses, smaller, muted gray.
export const shortcut = style({
  fontSize: '0.85em',
  color: '#9CA3AF',
});

export const divider = style({
  height: '1px',
  background: colors.border,
  margin: '0.25rem 0.2rem',
});
