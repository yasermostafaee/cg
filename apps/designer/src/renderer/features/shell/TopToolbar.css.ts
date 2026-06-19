import { style } from '@vanilla-extract/css';
import { colors } from '../../theme.js';

export const bar = style({
  display: 'flex',
  alignItems: 'center',
  gap: '0.4rem',
  padding: '0.3rem 0.6rem',
  background: colors.panel,
  border: `1px solid ${colors.border}`,
  borderRadius: '0.25rem',
});

export const group = style({
  display: 'flex',
  alignItems: 'center',
  gap: '0.2rem',
});

export const menuItem = style({
  background: 'transparent',
  color: colors.textMuted,
  border: '1px solid transparent',
  borderRadius: '0.22rem',
  padding: '0.18rem 0.55rem',
  fontSize: '0.74rem',
  cursor: 'pointer',
  letterSpacing: '0.01em',
});

// Hover / open feedback for the top-level menu buttons and dropdown
// rows — a solid slate fill, matching the Loopic reference's menu bar.
export const menuItemActive = style({
  background: colors.menuHover,
  color: colors.text,
});

export const dropdownItemActive = style({
  background: colors.menuHover,
});

export const spacer = style({ flex: 1 });

export const saveButton = style({
  background: colors.accent,
  color: '#000',
  border: 'none',
  padding: '0.2rem 0.6rem',
  borderRadius: '0.22rem',
  fontSize: '0.74rem',
  fontWeight: 700,
  cursor: 'pointer',
  letterSpacing: '0.02em',
});

export const exportButton = style({
  background: 'transparent',
  color: colors.text,
  border: `1px solid ${colors.border}`,
  padding: '0.2rem 0.6rem',
  borderRadius: '0.22rem',
  fontSize: '0.74rem',
  cursor: 'pointer',
  letterSpacing: '0.02em',
});

export const menuItemWrap = style({
  position: 'relative',
});

export const dropdown = style({
  position: 'absolute',
  top: '100%',
  left: 0,
  marginTop: '2px',
  minWidth: '160px',
  background: colors.panel,
  border: `1px solid ${colors.border}`,
  borderRadius: '0.25rem',
  boxShadow: '0 6px 18px rgba(0,0,0,0.45)',
  padding: '0.25rem 0',
  zIndex: 60,
});

export const dropdownItem = style({
  display: 'block',
  width: '100%',
  background: 'transparent',
  color: colors.text,
  border: 'none',
  textAlign: 'left',
  padding: '0.35rem 0.7rem',
  fontSize: '0.76rem',
  cursor: 'pointer',
  letterSpacing: '0.01em',
});

export const dropdownItemDisabled = style({
  color: colors.textMuted,
  cursor: 'default',
});

export const dropdownDivider = style({
  height: '1px',
  background: colors.border,
  margin: '0.2rem 0',
});

// Leading checkmark slot for the View toggle items.
export const checkSlot = style({ display: 'inline-block', width: '14px' });

// D-089 — the SAVE control reflects unsaved state. It is NOT the blue primary variant;
// a transparent top border reserves space so toggling to the unsaved colour never shifts
// layout. When dirty, the top border turns the unsaved-amber `#ffdd40`.
export const saveCtl = style({ borderTop: '2px solid transparent' });
export const saveCtlDirty = style({ borderTop: '2px solid #ffdd40' });
