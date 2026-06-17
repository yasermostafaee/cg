import { style } from '@vanilla-extract/css';
import { colors } from '../../theme.js';

/**
 * D-048 — the "More text options" gear + its popover. The gear matches the
 * sizing/align controls' chrome; its open state uses the neutral properties-panel
 * fill (no blue accent). The popover mirrors the FillPopover/ColorPopover chrome
 * and the reference gear popover (D-045-align-1.png).
 */
export const gearButton = style({
  width: '22px',
  height: '22px',
  background: 'transparent',
  color: colors.textMuted,
  border: `1px solid ${colors.border}`,
  borderRadius: '0.22rem',
  cursor: 'pointer',
  fontSize: '0.75rem',
  padding: 0,
});

/** Open state — neutral fill (NOT the blue accent), consistent with the toggles. */
export const gearButtonOpen = style({
  background: colors.menuHover,
  color: colors.text,
});

// Popover container chrome (top/left/visibility resolved at runtime, applied inline).
export const popover = style({
  position: 'fixed',
  width: '210px',
  background: '#1c1f2d',
  border: `1px solid ${colors.border}`,
  borderRadius: '0.4rem',
  padding: '0.6rem',
  boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
  zIndex: 4000,
  display: 'flex',
  flexDirection: 'column',
  gap: '0.5rem',
  userSelect: 'none',
});

export const row = style({
  display: 'grid',
  gridTemplateColumns: '78px 1fr',
  alignItems: 'center',
  gap: '0.4rem',
});

export const label = style({
  color: colors.textMuted,
  fontSize: '0.7rem',
  letterSpacing: '0.02em',
});

export const select = style({
  width: '100%',
  boxSizing: 'border-box',
});
