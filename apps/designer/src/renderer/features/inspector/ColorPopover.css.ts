import { style } from '@vanilla-extract/css';
import { colors } from '../../theme.js';

// Transparent-checkerboard background, used behind swatches and the alpha
// slider so transparency reads correctly.
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

// Swatch button chrome. `width`/`height` come from the `size` prop and stay
// inline; the checker background is applied via the `checker` class.
export const swatchButton = style({
  position: 'relative',
  borderRadius: '0.15rem',
  border: `1px solid ${colors.border}`,
  padding: 0,
  cursor: 'pointer',
  overflow: 'hidden',
  flexShrink: 0,
});

export const swatchFill = style({ position: 'absolute', inset: 0 });

// Popover container chrome. `top`/`left`/`visibility` are resolved at runtime
// and applied inline.
export const popover = style({
  position: 'fixed',
  width: '200px',
  background: '#1c1f2d',
  border: `1px solid ${colors.border}`,
  borderRadius: '0.4rem',
  padding: '0.6rem',
  boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
  zIndex: 4000,
  userSelect: 'none',
  touchAction: 'none',
});

export const hexInput = style({
  marginTop: '0.55rem',
  width: '100%',
  background: '#24273d',
  color: colors.text,
  border: `1px solid ${colors.border}`,
  borderRadius: '0.2rem',
  padding: '0.3rem 0.45rem',
  fontSize: '0.72rem',
  letterSpacing: '0.06em',
  textAlign: 'center',
  fontVariantNumeric: 'tabular-nums',
  boxSizing: 'border-box',
});

// Knob marker chrome; `left`/`top`/`background` are dynamic and applied inline.
export const knob = style({
  position: 'absolute',
  width: '12px',
  height: '12px',
  transform: 'translate(-50%, -50%)',
  borderRadius: '50%',
  border: '2px solid #fff',
  boxShadow: '0 0 0 1px rgba(0,0,0,0.5)',
  pointerEvents: 'none',
});
