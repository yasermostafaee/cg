import { style, styleVariants } from '@vanilla-extract/css';
import { colors } from '../theme.js';

/**
 * App-local Button recipe (Designer design system). A self-contained base +
 * `variant` + `size` recipe built on the existing `renderer/theme.ts` palette —
 * no new colours, no `@cg/ui` change. Kept deliberately self-contained so it can
 * be lifted into a shared package if the Runtime app ever needs the same control.
 *
 * Every variant carries the full interactive-state set the rest of the app was
 * missing: hover, active, focus-visible (an accent ring), and disabled.
 */
export const base = style({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '0.32rem',
  border: `1px solid ${colors.border}`,
  borderRadius: '0.25rem',
  background: colors.panelMuted,
  color: colors.text,
  fontFamily: 'inherit',
  fontWeight: 600,
  lineHeight: 1.1,
  whiteSpace: 'nowrap',
  cursor: 'pointer',
  userSelect: 'none',
  transition: 'background 90ms ease, border-color 90ms ease, filter 90ms ease, box-shadow 90ms ease',
  selectors: {
    '&:hover:not(:disabled)': { background: colors.menuHover, borderColor: '#3a3f59' },
    '&:active:not(:disabled)': { filter: 'brightness(0.92)' },
    '&:focus-visible': { outline: 'none', boxShadow: `0 0 0 2px ${colors.accent}` },
    '&:disabled': { opacity: 0.4, cursor: 'not-allowed' },
  },
});

export const variant = styleVariants({
  /** Outlined chip — the default, momentary command look (Stop / Pause / Next). */
  secondary: {},
  /** Accent fill — the primary action (Play). Momentary, never a pressed toggle. */
  primary: {
    background: colors.accent,
    color: '#06121F',
    borderColor: colors.accentMuted,
    fontWeight: 700,
    selectors: {
      '&:hover:not(:disabled)': { background: colors.accent, filter: 'brightness(1.08)' },
      '&:active:not(:disabled)': { filter: 'brightness(0.96)' },
      '&:disabled': { background: colors.accent, borderColor: colors.accentMuted },
    },
  },
  /** Quiet, borderless — preview-only utilities (Reset), set apart from commands. */
  ghost: {
    background: 'transparent',
    borderColor: 'transparent',
    color: colors.textMuted,
    fontWeight: 600,
    selectors: {
      '&:hover:not(:disabled)': {
        background: colors.menuHover,
        borderColor: colors.border,
        color: colors.text,
      },
    },
  },
});

export const size = styleVariants({
  sm: { padding: '0.22rem 0.45rem', fontSize: '0.7rem' },
  md: { padding: '0.34rem 0.55rem', fontSize: '0.75rem' },
});
