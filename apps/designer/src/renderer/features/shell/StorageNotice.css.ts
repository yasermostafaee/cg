import { style } from '@vanilla-extract/css';
import { colors } from '../../theme.js';

/**
 * D-150 — the storage notice strip. It sits ABOVE the app chrome, full width, so it
 * is present on the landing screen (where the author decides what to open) and in the
 * editor alike. It is not dismissable: the condition it reports does not go away
 * because someone clicked an X, and a dismissed warning about unsaved work is worse
 * than none.
 */
export const wrap = style({
  display: 'flex',
  alignItems: 'center',
  gap: '0.6rem',
  padding: '0.35rem 0.6rem',
  borderBottom: `1px solid ${colors.border}`,
  background: colors.panel,
  flex: '0 0 auto',
});

export const body = style({
  display: 'block',
  lineHeight: 1.35,
});

export const detail = style({
  color: colors.textMuted,
});
