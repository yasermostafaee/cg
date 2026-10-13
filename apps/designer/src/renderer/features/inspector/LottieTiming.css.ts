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

/**
 * Everything else: muted body text. `DESIGNER-FIX-0905` §4 — one step up from 0.68rem so the
 * derived-window readouts survive a narrow inspector; still a step under the settle line, so
 * the hierarchy this file exists for is kept.
 */
export const muted = style({
  fontSize: '0.72rem',
  lineHeight: 1.45,
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

/**
 * The "animation details" disclosure — a plain expandable ROW, not a button.
 *
 * It must read as "there is more section under here", so it mirrors the Inspector's own
 * section-header idiom (`CollapseSection.css.ts` `header` + `chevron`): full-width flex,
 * a fixed 16px chevron slot, muted, uppercase-ish letter-spacing, no box and no border.
 * It stays one step quieter than a real section header (weight 600 vs 700, no top rule)
 * because it is an ADVANCED affordance nested inside a panel, not a peer section.
 */
export const disclosure = style({
  display: 'flex',
  alignItems: 'center',
  gap: '0.35rem',
  width: '100%',
  marginTop: '0.15rem',
  padding: '0.3rem 0.1rem',
  color: colors.textMuted,
  fontSize: '0.66rem',
  fontWeight: 600,
  letterSpacing: '0.06em',
  textAlign: 'left',
  background: 'transparent',
  border: 'none',
});

/** Fixed chevron slot — same 16px gutter the section headers use, so the text aligns. */
export const disclosureChevron = style({
  width: '16px',
  display: 'inline-flex',
  justifyContent: 'center',
  color: colors.textMuted,
  lineHeight: 1,
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
