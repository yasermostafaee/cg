import { style } from '@vanilla-extract/css';
import { colors } from '../theme.js';

/**
 * `RUN-NEXT-VERSION-03` 2.1 — the anchored panel (`Popover.tsx`). Position is resolved at run time and
 * applied inline; everything else is here. Above the Modal's 5000 (a panel can open from a control in a
 * dialog) and below the tooltip layer's 10000 — the Inspector popovers' own layer.
 */
export const panel = style({
  position: 'fixed',
  zIndex: 6000,
  maxWidth: `calc(100vw - 16px)`,
  maxHeight: `calc(100vh - 16px)`,
  overflow: 'auto',
  boxSizing: 'border-box',
  background: colors.panel,
  border: `1px solid ${colors.border}`,
  borderRadius: '0.4rem',
  padding: '0.5rem',
  boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
  outline: 'none',
});
