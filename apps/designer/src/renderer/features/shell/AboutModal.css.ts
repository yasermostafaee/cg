import { style } from '@vanilla-extract/css';
import { colors } from '../../theme.js';

/** `D-161` — the three facts, one per line, in the dialog's own type. */
export const facts = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '0.45rem',
  padding: '0.35rem 0.1rem 0.2rem',
});

export const brand = style({
  display: 'flex',
  alignItems: 'center',
  gap: '0.65rem',
  marginBottom: '0.35rem',
  color: colors.text,
  fontSize: '1.1rem',
  fontWeight: 800,
  letterSpacing: '0.08em',
  textDecoration: 'none',
  selectors: {
    '&:hover': { color: colors.accent },
    '&:focus-visible': { outline: `2px solid ${colors.accent}`, outlineOffset: 3 },
  },
});

export const brandLogo = style({
  width: '2.5rem',
  height: '2.5rem',
  borderRadius: '0.55rem',
});

export const name = style({
  color: colors.text,
  fontSize: '1rem',
  fontWeight: 700,
  letterSpacing: '0.02em',
});

export const fact = style({
  color: colors.textMuted,
  fontSize: '0.8rem',
  fontVariantNumeric: 'tabular-nums',
});
