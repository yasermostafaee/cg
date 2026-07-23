import { style, styleVariants } from '@vanilla-extract/css';
import { colors } from '../theme.js';

/**
 * App-local Callout recipe — a prominent, distinct message box so important
 * notices (no out-point, duplicate data key, validation errors) read as alerts
 * rather than muted hints. Built on the existing palette: `info` is neutral
 * chrome with an accent edge; `danger` is a rose tint derived from
 * `colors.danger` (the same `rgba(248,113,113,…)` the app already uses), so no
 * new palette is introduced.
 */
export const base = style({
  display: 'flex',
  gap: '0.4rem',
  alignItems: 'flex-start',
  padding: '0.4rem 0.55rem',
  borderRadius: '0.25rem',
  borderLeft: '3px solid transparent',
  // Message text is READ, not scanned — 0.9rem app-wide for message surfaces
  // (owner call, 2026-07-22: modal/callout copy at 0.7rem was too small).
  fontSize: '0.9rem',
  lineHeight: 1.4,
});

export const icon = style({
  flexShrink: 0,
  lineHeight: 1.4,
  fontSize: '0.78rem',
});

export const variant = styleVariants({
  info: {
    background: colors.panelMuted,
    borderLeftColor: colors.accent,
    color: colors.text,
  },
  /**
   * CAUTION — a legitimate state worth noticing that is NOT an error (an infinite hold
   * driver; a content-driven graphic that won't auto-close). Previously these borrowed
   * `danger`, which cried wolf and left real errors nothing louder to escalate to.
   * Amber tint from the `caution` tokens; the label stays readable rather than shouting.
   */
  caution: {
    background: colors.cautionSurface,
    borderLeftColor: colors.caution,
    color: colors.text,
  },
  danger: {
    background: 'rgba(248, 113, 113, 0.13)',
    borderLeftColor: colors.danger,
    color: colors.danger,
  },
});
