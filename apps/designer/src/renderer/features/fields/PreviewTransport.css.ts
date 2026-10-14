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

/**
 * The real playout commands — equal-weight cells, four to a row (Play / Pause / Out / Stop), then
 * the step pair (Previous / Next) halving the row below. Six in one line do not fit the preview's
 * side panel: the sixth was pushed past its edge, a command the author could not see. A cell never
 * shrinks below its label (`min-content`; the labels do not wrap).
 */
export const commands = style({
  display: 'grid',
  gridTemplateColumns: 'repeat(4, minmax(min-content, 1fr))',
  gap: '0.3rem',
});

export const command = style({
  width: '100%',
});

/** Previous / Next — the step pair, half the row each. */
export const step = style({
  gridColumn: 'span 2',
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
