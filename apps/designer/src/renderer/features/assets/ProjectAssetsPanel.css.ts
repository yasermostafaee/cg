import { style } from '@vanilla-extract/css';
import { colors } from '../../theme.js';

export const panel = style({
  background: colors.panel,
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
  fontSize: '0.85rem',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 0,
});

export const searchWrap = style({
  padding: '0.4rem 0.55rem',
});

export const search = style({
  width: '100%',
  background: colors.panelMuted,
  color: colors.text,
  border: `1px solid ${colors.border}`,
  borderRadius: '0.25rem',
  padding: '0.25rem 0.45rem',
  fontSize: '0.74rem',
  boxSizing: 'border-box',
  outline: 'none',
});

export const grid = style({
  flex: 1,
  minHeight: 0,
  overflowY: 'auto',
  padding: '0.5rem 0.4rem',
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(70px, 1fr))',
  gap: '0.6rem 0.4rem',
  alignContent: 'start',
});

export const list = style({
  flex: 1,
  minHeight: 0,
  overflowY: 'auto',
  padding: '0.35rem 0.3rem',
  display: 'flex',
  flexDirection: 'column',
  gap: '0.05rem',
});

// Empty-state wrapper used for BOTH grid and list view so the hint sits at the
// same offset regardless of the active view.
export const emptyWrap = style({
  flex: 1,
  minHeight: 0,
  overflowY: 'auto',
  padding: '0.5rem 0.4rem',
});

export const empty = style({
  margin: 0,
  padding: '1rem 0.5rem',
  color: colors.textMuted,
  fontSize: '0.72rem',
  textAlign: 'center',
  lineHeight: 1.5,
});

// `left`/`top` are applied inline from the click position.
export const menu = style({
  position: 'fixed',
  background: colors.panel,
  border: `1px solid ${colors.border}`,
  borderRadius: '0.25rem',
  boxShadow: '0 6px 18px rgba(0,0,0,0.45)',
  minWidth: '140px',
  padding: '0.25rem 0',
  zIndex: 60,
  fontSize: '0.74rem',
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

export const menuItemDanger = style({ color: '#f87171' });

export const modalBody = style({
  fontSize: '0.78rem',
  color: colors.textMuted,
  lineHeight: 1.5,
  whiteSpace: 'pre-wrap',
});
