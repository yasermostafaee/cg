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
  fontSize: '0.7rem',
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
  danger: {
    background: 'rgba(248, 113, 113, 0.13)',
    borderLeftColor: colors.danger,
    color: colors.danger,
  },
});
