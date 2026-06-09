import { style } from '@vanilla-extract/css';
import { colors } from '../../theme.js';

export const bar = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '0.4rem',
});

export const groupLabel = style({
  color: colors.textMuted,
  fontSize: '0.6rem',
  fontWeight: 700,
  letterSpacing: '0.07em',
  textTransform: 'uppercase',
});

/** The real playout commands (Play / Pause / Stop / Next) — equal-weight row. */
export const commands = style({
  display: 'flex',
  gap: '0.3rem',
});

export const command = style({
  flex: '1 1 0',
});

/**
 * Preview-only utilities (Reset), set apart from the playout commands by a
 * divider + right alignment so the operator never confuses a preview helper with
 * an on-air command.
 */
export const utilities = style({
  display: 'flex',
  justifyContent: 'flex-end',
  paddingTop: '0.4rem',
  borderTop: `1px solid ${colors.border}`,
});
