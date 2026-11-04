import { style } from '@vanilla-extract/css';
import { colors } from '../../theme.js';

export const group = style({
  display: 'flex',
  alignItems: 'center',
  gap: '0.12rem',
  minWidth: 0,
  position: 'relative',
});

export const button = style({
  width: '26px',
  height: '26px',
  background: 'transparent',
  color: colors.textMuted,
  border: 'none',
  borderRadius: '0.22rem',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  fontSize: '0.95rem',
  padding: 0,
});

// Hover and selected both use a brighter background (no border); selected
// is a touch brighter and brightens the icon so it still reads as active.
export const buttonHover = style({
  background: 'rgba(255, 255, 255, 0.10)',
});

export const buttonActive = style({
  color: colors.text,
  background: 'rgba(255, 255, 255, 0.18)',
});

export const moreWrap = style({
  position: 'relative',
  flex: '0 0 auto',
});

export const moreMenu = style({
  position: 'absolute',
  top: 'calc(100% + 5px)',
  left: 0,
  zIndex: 20,
  width: '190px',
  maxHeight: 'min(420px, calc(100vh - 150px))',
  overflowY: 'auto',
  padding: '0.3rem',
  border: `1px solid ${colors.border}`,
  borderRadius: '0.35rem',
  background: colors.panel,
  boxShadow: '0 10px 28px rgba(0, 0, 0, 0.45)',
});

export const moreItem = style({
  width: '100%',
  minHeight: '30px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'flex-start',
  gap: '0.55rem',
  padding: '0.3rem 0.45rem',
  border: 0,
  borderRadius: '0.25rem',
  background: 'transparent',
  color: colors.textMuted,
  fontSize: '0.75rem',
  textAlign: 'left',
  cursor: 'pointer',
});

export const moreItemActive = style({
  color: colors.text,
  background: 'rgba(255, 255, 255, 0.12)',
});

export const moreDivider = style({
  height: '1px',
  margin: '0.25rem 0.2rem',
  background: colors.border,
});

/**
 * `multibox-layout-switch` C2 — the ACTIVE-ARRANGEMENT selector in the canvas header.
 *
 * Sized to its content with a floor rather than a fixed width: arrangement names are
 * authored, so a fixed width either truncates a real name or reserves space for one nobody
 * wrote. It sits beside the tool group and inherits every interactive state from the shared
 * `Select` primitive — only the resting size and spacing live here.
 */
export const arrangementPicker = style({
  marginInlineStart: '0.5rem',
  minWidth: '11rem',
  maxWidth: '18rem',
  fontSize: '0.72rem',
  height: '28px',
});

/**
 * B-387 — constrain the SELECT SHELL, not only its native select. The shared
 * shell normally owns all available width, which made a short Look name consume
 * most of a compact canvas header.
 */
export const lookPickerWrap = style({
  flex: '0 1 8rem',
  width: '8rem',
  minWidth: '6.5rem',
  maxWidth: '8rem',
  marginInlineStart: '0.2rem',
});

/** LOOKS phase 2 — the look selector's surface (its own class; A′'s is deleted with A′). */
export const lookPicker = style({
  minWidth: 0,
  fontSize: '0.72rem',
  height: '26px',
});
