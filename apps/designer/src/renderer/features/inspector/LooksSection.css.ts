import { style } from '@vanilla-extract/css';
import { colors } from '../../theme.js';

/**
 * LOOKS phase 2 (`design.md` §14) — the Looks section's resting surfaces.
 *
 * Tokens + local literals only, the `ArrangementsSection.css.ts` precedent: the shared
 * `Button` / `Select` primitives supply every interactive state; nothing here restyles a
 * control.
 */

export const empty = style({
  fontSize: '0.68rem',
  color: colors.textMuted,
  margin: '0.25rem 0 0.5rem',
  lineHeight: 1.45,
});

export const summary = style({
  fontSize: '0.66rem',
  color: colors.textMuted,
  margin: '0.15rem 0 0.5rem',
  lineHeight: 1.45,
});

export const hint = style({
  fontSize: '0.63rem',
  color: colors.textMuted,
  margin: '0.3rem 0 0.1rem',
  lineHeight: 1.4,
});

export const groupLabel = style({
  fontSize: '0.62rem',
  fontWeight: 600,
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
  color: colors.textMuted,
  margin: '0.5rem 0 0.2rem',
});

const rowBase = {
  borderRadius: '0.25rem',
  marginBottom: '0.3rem',
  border: `1px solid ${colors.border}`,
} as const;

export const row = style({ ...rowBase, background: 'transparent' });

/** The ACTIVE look — the one the canvas is showing. Fill + accent bar, never hue alone. */
export const rowActive = style({
  ...rowBase,
  background: '#1a4d6b',
  borderInlineStartWidth: '3px',
  borderInlineStartColor: colors.accent,
});

export const rowHead = style({
  display: 'flex',
  alignItems: 'center',
  gap: '0.2rem',
  padding: '0.15rem 0.2rem',
});

export const rowName = style({
  flex: 1,
  minWidth: 0,
  textAlign: 'start',
  justifyContent: 'flex-start',
});

export const addRow = style({
  display: 'flex',
  alignItems: 'center',
  gap: '0.3rem',
  marginTop: '0.35rem',
});

export const addField = style({ flex: 1, minWidth: 0 });

export const issue = style({
  fontSize: '0.64rem',
  color: colors.caution,
  margin: '0.2rem 0',
  lineHeight: 1.4,
});
