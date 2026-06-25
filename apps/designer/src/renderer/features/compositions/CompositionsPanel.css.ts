import { style } from '@vanilla-extract/css';
import { colors } from '../../theme.js';

export const panel = style({
  background: colors.panel,
  // Match the Project Assets / Shared Library panels so switching the left-rail
  // slot keeps the bordered rounded-card look.
  border: `1px solid ${colors.border}`,
  borderRadius: '0.25rem',
  display: 'flex',
  flexDirection: 'column',
  minHeight: 0,
  height: '100%',
  width: '100%',
  boxSizing: 'border-box',
  overflow: 'hidden',
});

export const header = style({
  display: 'flex',
  alignItems: 'center',
  gap: '0.5rem',
  padding: '0.45rem 0.55rem',
  borderBottom: `1px solid ${colors.border}`,
});

export const title = style({
  flex: 1,
  fontSize: '0.78rem',
  fontWeight: 700,
  color: colors.text,
  letterSpacing: '0.02em',
});

export const iconButton = style({
  width: '22px',
  height: '22px',
  background: 'transparent',
  color: colors.textMuted,
  border: '1px solid transparent',
  borderRadius: '0.22rem',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 0,
});

export const list = style({
  flex: 1,
  minHeight: 0,
  overflowY: 'auto',
  padding: '0.3rem 0.3rem',
  display: 'flex',
  flexDirection: 'column',
  gap: '0.1rem',
});

export const row = style({
  display: 'flex',
  alignItems: 'center',
  gap: '0.45rem',
  padding: '0.35rem 0.5rem',
  borderRadius: '0.25rem',
  cursor: 'pointer',
  color: colors.text,
  fontSize: '0.78rem',
  userSelect: 'none',
});

// Active = a solid slate fill only, no border (matches the icon-rail).
export const rowActive = style({ background: '#333642' });

// `background` (active accent / transparent) is applied inline.
export const dot = style({
  width: '9px',
  height: '9px',
  borderRadius: '50%',
  flexShrink: 0,
  boxSizing: 'border-box',
});

export const name = style({
  flex: 1,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const nameInput = style({
  flex: 1,
  background: colors.panelMuted,
  color: colors.text,
  border: `1px solid ${colors.accent}`,
  borderRadius: '0.2rem',
  padding: '0.05rem 0.3rem',
  fontSize: '0.78rem',
  outline: 'none',
  minWidth: 0,
});

// `left`/`top` are applied inline from the click position.
export const menu = style({
  position: 'fixed',
  background: '#1c1f2d',
  border: `1px solid ${colors.border}`,
  borderRadius: '0.25rem',
  boxShadow: '0 6px 18px rgba(0,0,0,0.45)',
  minWidth: '180px',
  padding: '0.25rem 0',
  zIndex: 3000,
  fontSize: '0.76rem',
});

export const menuItem = style({
  display: 'block',
  width: '100%',
  background: 'transparent',
  color: colors.text,
  border: 'none',
  textAlign: 'left',
  padding: '0.4rem 0.7rem',
  fontSize: '0.78rem',
  cursor: 'pointer',
});

export const menuItemDisabled = style({
  color: colors.textMuted,
  cursor: 'not-allowed',
  opacity: 0.6,
});

export const menuItemDanger = style({ color: '#f87171' });

export const empty = style({
  color: colors.textMuted,
  fontSize: '0.72rem',
  textAlign: 'center',
  padding: '0.6rem 0.5rem',
  lineHeight: 1.5,
});
