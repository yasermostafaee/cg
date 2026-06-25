import { globalStyle, style } from '@vanilla-extract/css';
import { colors } from '../theme.js';

/**
 * App-local Select recipe — THE way to render a dropdown in the Designer
 * (same rule as Button/Control: no raw `<select>` outside renderer/ui).
 *
 * `colorScheme: 'dark'` is the load-bearing line: without it Chromium renders
 * the POPUP list with the OS light theme (bright background + items) no
 * matter how the closed control is styled. The rest is the design-system
 * resting look + the standard interaction states.
 *
 * The down-chevron is a REAL lucide `<Icon>` overlaid by the `Select` component
 * inside `wrap` — NOT a `background-image` (a `background` shorthand override at a
 * call site kept wiping the data-URI). `pointer-events: none` lets clicks fall
 * through to the `<select>`.
 */
export const wrap = style({
  position: 'relative',
  display: 'block',
  width: '100%',
});

export const select = style({
  colorScheme: 'dark',
  appearance: 'none',
  width: '100%',
  boxSizing: 'border-box',
  backgroundColor: colors.panelMuted,
  color: colors.text,
  border: `1px solid ${colors.border}`,
  borderRadius: '0.25rem',
  // Right padding leaves room for the overlaid chevron so the value never runs under it.
  padding: '0.22rem 1.2rem 0.22rem 0.45rem',
  fontFamily: 'inherit',
  fontSize: '0.72rem',
  lineHeight: 1.2,
  cursor: 'pointer',
  transition: 'background 90ms ease, border-color 90ms ease, color 90ms ease',
  selectors: {
    '&:hover:not(:disabled)': { backgroundColor: colors.menuHover, borderColor: '#3a3f59' },
    '&:focus-visible': { outline: 'none', boxShadow: `0 0 0 2px ${colors.accent}` },
    '&:disabled': { opacity: 0.4, cursor: 'not-allowed' },
  },
});

/** The overlaid lucide chevron, anchored to the wrapper's right edge. */
export const chevron = style({
  position: 'absolute',
  right: '0.45rem',
  top: '50%',
  transform: 'translateY(-50%)',
  pointerEvents: 'none',
  color: colors.textMuted,
  display: 'block',
});

// The popup list rows (Chromium honours these with color-scheme: dark).
globalStyle(`${select} option, ${select} optgroup`, {
  background: colors.panelMuted,
  color: colors.text,
});
