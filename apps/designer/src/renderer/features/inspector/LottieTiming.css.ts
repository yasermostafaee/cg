import { style } from '@vanilla-extract/css';
import { colors } from '../../theme.js';

/**
 * D-125 Phase 3b-1 — the Lottie timing panel.
 *
 * HIERARCHY IS THE POINT. Phase 3a rendered every number as equal-weight prose in two
 * mixed frame spaces, and the owner (who built this system) misread an ANIMATION-frame
 * marker as a point on the composition timeline. So: exactly ONE most-prominent number
 * (the settle frame — the only figure the designer acts on), the clear-time second,
 * everything else muted, and the warning outranking all of it.
 *
 * Colours are theme tokens only. `theme.ts` exposes no type scale, so sizes follow the
 * app's existing inspector convention (0.66–0.82rem) with one deliberate step up for the
 * hero number.
 */

/** The whole readout, separated from the controls above it. */
export const panel = style({
  marginTop: '0.5rem',
  paddingTop: '0.45rem',
  borderTop: `1px solid ${colors.border}`,
  display: 'flex',
  flexDirection: 'column',
  gap: '0.3rem',
});

/** THE decision line — "intro settles at frame N → put the out-point at N or later". */
export const settleLine = style({
  fontSize: '0.72rem',
  lineHeight: 1.35,
  color: colors.text,
});

/** The one number the designer acts on. The single loudest thing in the panel. */
export const settleFrame = style({
  color: colors.accent,
  fontSize: '1.05rem',
  fontWeight: 600,
  // Digits shouldn't reflow the sentence as the value changes.
  fontVariantNumeric: 'tabular-nums',
});

/** Second tier — a number to KNOW (clear time), not to act on. */
export const secondary = style({
  fontSize: '0.7rem',
  lineHeight: 1.35,
  color: colors.text,
});

export const secondaryNum = style({
  fontWeight: 600,
  fontVariantNumeric: 'tabular-nums',
});

/** Everything else: muted body text. */
export const muted = style({
  fontSize: '0.68rem',
  lineHeight: 1.4,
  color: colors.textMuted,
  margin: 0,
});

/**
 * The out-point overrun. Must DOMINATE the settle line above it — a left rule in the
 * danger token plus a panel fill, so it reads as a block, not another sentence.
 */
export const warn = style({
  margin: '0.15rem 0 0',
  padding: '0.35rem 0.45rem',
  borderLeft: `2px solid ${colors.danger}`,
  background: colors.panelMuted,
  color: colors.danger,
  fontSize: '0.72rem',
  fontWeight: 600,
  lineHeight: 1.4,
});

/** The "animation details" disclosure toggle — muted, never competing with the main level. */
export const disclosure = style({
  display: 'flex',
  alignItems: 'center',
  gap: '0.2rem',
  marginTop: '0.1rem',
  color: colors.textMuted,
  fontSize: '0.66rem',
  textAlign: 'left',
});

/** Expanded advanced content — stays muted even when open. */
export const advanced = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '0.15rem',
  paddingLeft: '0.55rem',
  borderLeft: `1px solid ${colors.border}`,
});

/** The comp-frame equivalent shown beside a manual animation-frame input. */
export const compEquiv = style({
  display: 'block',
  marginTop: '-0.15rem',
  paddingLeft: '74px',
  color: colors.accentMuted,
  fontSize: '0.66rem',
  fontVariantNumeric: 'tabular-nums',
});
