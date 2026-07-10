import { style } from '@vanilla-extract/css';
import { colors } from '../../theme.js';

// B-058 — the menu chrome moved to the SHARED `ui/ContextMenu.css.ts` (these
// values were adopted as canonical there); this module re-exports it so the
// timeline markup is untouched and keeps only its layer-menu-specific extras
// (chevron / submenu / swatches) local.
export { backdrop, menu, item, itemDisabled, shortcut, divider } from '../../ui/ContextMenu.css.js';

export const chevron = style({
  color: colors.textMuted,
  fontSize: '0.7rem',
});

// `width`, `left`, `top` and `maxHeight` are applied inline.
export const submenu = style({
  position: 'fixed',
  overflowY: 'auto',
  background: colors.panel,
  border: `1px solid ${colors.border}`,
  borderRadius: '0.3rem',
  padding: '0.25rem',
  boxShadow: '0 8px 24px rgba(0,0,0,0.45)',
});

export const swatchRow = style({
  display: 'flex',
  alignItems: 'center',
  gap: '0.5rem',
  padding: '0.22rem 0.45rem',
  borderRadius: '0.2rem',
  cursor: 'pointer',
});

// `background` (the swatch colour) is applied inline.
export const swatch = style({
  width: '13px',
  height: '13px',
  borderRadius: '3px',
  flexShrink: 0,
  border: '1px solid rgba(255,255,255,0.18)',
});
