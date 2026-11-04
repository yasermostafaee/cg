import { globalStyle, style } from '@vanilla-extract/css';
import { colors } from '../../theme.js';

export const bar = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '0.4rem',
});

/** D-196 — the Preview-local Look switch, kept with the transport it affects. */
export const lookControl = style({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'stretch',
  gap: '0.35rem',
  minHeight: '2rem',
  padding: '0.45rem 0.5rem 0.5rem',
  border: `1px solid ${colors.border}`,
  borderRadius: '0.3rem',
  background: colors.panelMuted,
  color: colors.textMuted,
  fontSize: '0.72rem',
  fontWeight: 700,
});

export const lookLabel = style({
  color: colors.textMuted,
  fontSize: '0.6rem',
  letterSpacing: '0.07em',
  textTransform: 'uppercase',
});

/** D-196 — CG Control-style Look buttons wrap to visible rows; no hidden horizontal choices. */
export const lookStrip = style({
  display: 'flex',
  flexWrap: 'wrap',
  gap: '0.4rem',
  minWidth: 0,
  padding: '0.15rem',
});

export const lookButton = style({
  flex: '0 1 auto',
  width: 'fit-content',
  minWidth: '6.25rem',
  maxWidth: '12rem',
  height: '2.35rem',
  paddingInline: '0.75rem',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  selectors: {
    '&[aria-pressed="true"]': {
      background: colors.lookSurface,
      color: colors.look,
      boxShadow: `inset 0 0 0 1px ${colors.look}, 0 0 0 1px ${colors.lookSurface}`,
    },
  },
});

export const groupLabel = style({
  color: colors.textMuted,
  fontSize: '0.6rem',
  fontWeight: 700,
  letterSpacing: '0.07em',
  textTransform: 'uppercase',
});

export const statusRow = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '1rem',
  flexShrink: 0,
  minHeight: '3.2rem',
  padding: '0.45rem 0.8rem',
  border: `1px solid ${colors.border}`,
  borderRadius: '0.3rem',
  background: colors.panelMuted,
});

export const statusMetrics = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'flex-end',
  gap: '1.5rem',
  minWidth: 0,
});

export const compositionIdentity = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '0.15rem',
  minWidth: 0,
});

globalStyle(`${compositionIdentity} strong`, {
  maxWidth: '34rem',
  overflow: 'hidden',
  color: colors.text,
  fontSize: '0.9rem',
  fontWeight: 700,
  lineHeight: 1.25,
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const elapsed = style({
  display: 'inline-flex',
  alignItems: 'baseline',
  gap: '0.45rem',
  color: colors.textMuted,
  fontSize: '0.72rem',
});

export const frameStatus = style({
  display: 'inline-flex',
  alignItems: 'baseline',
  gap: '0.4rem',
  color: colors.textMuted,
  fontSize: '0.72rem',
});

globalStyle(`${elapsed} strong`, {
  display: 'inline-block',
  width: '7.75rem',
  color: colors.text,
  fontFamily: '"Cascadia Mono", "Consolas", monospace',
  fontSize: '1.35rem',
  fontWeight: 750,
  fontVariantNumeric: 'tabular-nums',
  fontFeatureSettings: '"tnum" 1',
  letterSpacing: '0.015em',
  direction: 'ltr',
  unicodeBidi: 'isolate',
  textAlign: 'center',
});

globalStyle(`${frameStatus} strong`, {
  display: 'inline-block',
  width: '7.25rem',
  color: colors.text,
  fontFamily: '"Cascadia Mono", "Consolas", monospace',
  fontSize: '1.25rem',
  fontWeight: 750,
  fontVariantNumeric: 'tabular-nums',
  fontFeatureSettings: '"tnum" 1',
  direction: 'ltr',
  unicodeBidi: 'isolate',
  textAlign: 'center',
});

/**
 * The real playout commands — Play / Pause / Stop share the first row, then Previous / Next split
 * the row below. Putting every command on one line does not fit the preview's side panel. A cell never
 * shrinks below its label (`min-content`; the labels do not wrap).
 */
export const commands = style({
  display: 'grid',
  gridTemplateColumns: 'repeat(6, minmax(0, 1fr))',
  gap: '0.3rem',
});

export const command = style({
  width: '100%',
  gridColumn: 'span 2',
});

/** Previous / Next — the step pair, half the row each. */
export const step = style({
  gridColumn: 'span 3',
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
