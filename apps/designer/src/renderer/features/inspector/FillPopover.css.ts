import { style } from '@vanilla-extract/css';
import { colors } from '../../theme.js';

// Transparent-checkerboard background, used behind swatches.
export const checker = style({
  backgroundColor: '#fff',
  backgroundImage:
    'linear-gradient(45deg, #999 25%, transparent 25%), ' +
    'linear-gradient(-45deg, #999 25%, transparent 25%), ' +
    'linear-gradient(45deg, transparent 75%, #999 75%), ' +
    'linear-gradient(-45deg, transparent 75%, #999 75%)',
  backgroundSize: '8px 8px',
  backgroundPosition: '0 0, 0 4px, 4px -4px, -4px 0',
});

// Row chrome. `gridTemplateColumns` depends on the labelWidth prop and stays
// inline.
export const row = style({
  display: 'grid',
  gap: '0.35rem',
  alignItems: 'center',
  padding: '0.1rem 0',
  fontSize: '0.74rem',
});

export const label = style({
  color: colors.textMuted,
  fontSize: '0.7rem',
  letterSpacing: '0.02em',
});

export const field = style({
  display: 'flex',
  alignItems: 'center',
  gap: '0.4rem',
});

export const kindLabel = style({
  flex: 1,
  color: colors.text,
  fontSize: '0.72rem',
  textTransform: 'capitalize',
});

export const point = style({ display: 'flex', alignItems: 'center' });

// Fill-preview swatch button chrome. `width`/`height` fixed; the checker
// background is applied via the `checker` class.
export const swatchButton = style({
  position: 'relative',
  width: '14px',
  height: '14px',
  borderRadius: '0.15rem',
  border: `1px solid ${colors.border}`,
  padding: 0,
  cursor: 'pointer',
  overflow: 'hidden',
  flexShrink: 0,
});

export const swatchFill = style({ position: 'absolute', inset: 0 });

// Popover container chrome. `top`/`left`/`visibility` are runtime-resolved and
// applied inline.
export const popover = style({
  position: 'fixed',
  width: '210px',
  background: '#1c1f2d',
  border: `1px solid ${colors.border}`,
  borderRadius: '0.4rem',
  padding: '0.6rem',
  boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
  zIndex: 4000,
  userSelect: 'none',
  touchAction: 'none',
});

export const modeSwitch = style({
  display: 'flex',
  gap: '4px',
  marginBottom: '0.55rem',
});

// Mode-switch button chrome. Active-state border/background/color/fontWeight
// are React-state-driven and applied inline.
export const modeButton = style({
  flex: 1,
  padding: '0.28rem 0',
  fontSize: '0.68rem',
  textTransform: 'capitalize',
  cursor: 'pointer',
  borderRadius: '0.2rem',
});

// Gradient preview bar. `background` (the gradient) is dynamic and inline.
export const gradientBar = style({
  height: '16px',
  borderRadius: '0.2rem',
  marginBottom: '0.45rem',
  border: `1px solid ${colors.border}`,
});

export const stopRow = style({
  display: 'flex',
  alignItems: 'center',
  gap: '4px',
  marginBottom: '0.45rem',
});

// Gradient-stop swatch button. `border` depends on selection state and stays
// inline; the checker background is applied via the `checker` class.
export const stopButton = style({
  position: 'relative',
  width: '18px',
  height: '18px',
  borderRadius: '0.15rem',
  padding: 0,
  cursor: 'pointer',
  overflow: 'hidden',
});

// Add / remove stop button. `opacity` (disabled state) is applied inline.
export const miniBtn = style({
  width: '18px',
  height: '18px',
  borderRadius: '0.15rem',
  border: `1px solid ${colors.border}`,
  background: 'transparent',
  color: colors.text,
  cursor: 'pointer',
  fontSize: '0.85rem',
  lineHeight: 1,
  padding: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
});

export const miniNumberRow = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '0.4rem',
  marginBottom: '0.4rem',
});

export const miniNumberLabel = style({ color: colors.textMuted, fontSize: '0.68rem' });

// Bordered field wrapper around the mini number input (combined with .cg-field).
export const miniNumberField = style({
  width: '72px',
  padding: '0.15rem 0.4rem',
  gap: '2px',
  justifyContent: 'flex-end',
});

export const miniNumberInput = style({
  flex: '1 1 0',
  minWidth: 0,
  color: colors.text,
  fontSize: '0.7rem',
  textAlign: 'right',
  fontVariantNumeric: 'tabular-nums',
});
