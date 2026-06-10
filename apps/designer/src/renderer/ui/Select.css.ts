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
 */
export const select = style({
  colorScheme: 'dark',
  appearance: 'none',
  backgroundColor: colors.panelMuted,
  color: colors.text,
  border: `1px solid ${colors.border}`,
  borderRadius: '0.25rem',
  padding: '0.22rem 1.2rem 0.22rem 0.45rem',
  fontFamily: 'inherit',
  fontSize: '0.72rem',
  lineHeight: 1.2,
  cursor: 'pointer',
  transition: 'background 90ms ease, border-color 90ms ease, color 90ms ease',
  // An inline chevron so `appearance: none` doesn't leave the control naked.
  backgroundImage:
    "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='8' height='6'><path d='M1 1l3 3 3-3' stroke='%238b90ad' stroke-width='1.4' fill='none' stroke-linecap='round'/></svg>\")",
  backgroundRepeat: 'no-repeat',
  backgroundPosition: 'right 0.4rem center',
  selectors: {
    // backgroundColor (not the shorthand) so the chevron image survives hover.
    '&:hover:not(:disabled)': { backgroundColor: colors.menuHover, borderColor: '#3a3f59' },
    '&:focus-visible': { outline: 'none', boxShadow: `0 0 0 2px ${colors.accent}` },
    '&:disabled': { opacity: 0.4, cursor: 'not-allowed' },
  },
});

// The popup list rows (Chromium honours these with color-scheme: dark).
globalStyle(`${select} option, ${select} optgroup`, {
  background: colors.panelMuted,
  color: colors.text,
});
