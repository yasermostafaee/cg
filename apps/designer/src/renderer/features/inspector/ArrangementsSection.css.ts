import { style } from '@vanilla-extract/css';
import { colors } from '../../theme.js';

/**
 * `multibox-layout-switch` C2 — the Arrangements section's own surfaces.
 *
 * Tokens + local literals only, matching `PlayoutSection.css.ts`'s precedent: the shared
 * `Button` / `Select` primitives supply every hover / active / focus-visible / disabled
 * state, so nothing here restyles an interactive control — only the resting surfaces the
 * rows sit on.
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

const rowBase = {
  borderRadius: '0.25rem',
  marginBottom: '0.3rem',
  border: `1px solid ${colors.border}`,
} as const;

export const row = style({ ...rowBase, background: 'transparent' });

/**
 * The ACTIVE arrangement — the one the canvas is showing.
 *
 * It gets a filled surface AND a left accent bar rather than colour alone: which
 * arrangement the canvas shows changes what the author is looking at, so it must be
 * readable without relying on hue.
 */
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

export const pick = style({
  display: 'flex',
  alignItems: 'center',
  gap: '0.4rem',
  flex: 1,
  minWidth: 0,
  justifyContent: 'flex-start',
  textAlign: 'start',
});

export const badge = style({
  fontSize: '0.6rem',
  fontWeight: 600,
  letterSpacing: '0.02em',
  padding: '0.1rem 0.32rem',
  borderRadius: '0.2rem',
  background: colors.panel,
  color: colors.text,
  flexShrink: 0,
});

export const name = style({
  fontSize: '0.7rem',
  color: colors.text,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const body = style({
  padding: '0.1rem 0.35rem 0.4rem',
  borderTop: `1px solid ${colors.border}`,
});

export const cellsHead = style({
  fontSize: '0.6rem',
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color: colors.textMuted,
  margin: '0.5rem 0 0.2rem',
});

/** `B-218` — the per-arrangement CELLS lock row: label + the shared `Button`, nothing restyled. */
export const cellLockRow = style({
  display: 'flex',
  alignItems: 'center',
  gap: '0.4rem',
  margin: '0.1rem 0 0.35rem',
});

export const cell = style({
  marginBottom: '0.3rem',
  paddingInlineStart: '0.3rem',
  borderInlineStart: `2px solid ${colors.border}`,
});

export const cellFields = style({ display: 'block' });

export const addRow = style({
  display: 'flex',
  flexWrap: 'wrap',
  gap: '0.25rem',
  marginTop: '0.4rem',
});

// ────────────────────── D-153 — the box readout and the guidance ──────────────────────

const boxRowBase = {
  display: 'flex',
  alignItems: 'baseline',
  justifyContent: 'space-between',
  gap: '0.4rem',
  margin: '0.12rem 0',
  fontSize: '0.66rem',
} as const;

export const boxRow = style(boxRowBase);

/**
 * A box with no cell in the ACTIVE arrangement.
 *
 * Dimmed AND labelled, never dimmed alone: "hidden" is a legitimate on-air state (§12.4 —
 * the source is HELD, muted and idle, not torn down), and an author who reads it as "broken"
 * will go looking for a fault that is not there.
 */
export const boxRowHidden = style({ ...boxRowBase, opacity: 0.62 });

export const boxName = style({
  color: colors.text,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const boxWhere = style({ color: colors.accent, flexShrink: 0 });

export const boxWhereHidden = style({ color: colors.caution, textAlign: 'end' });

/** The empty-state callout — the screen the owner was actually on when he asked. */
export const callout = style({
  border: `1px solid ${colors.border}`,
  borderInlineStartWidth: '3px',
  borderInlineStartColor: colors.caution,
  borderRadius: '0.25rem',
  padding: '0.4rem 0.5rem',
  margin: '0.3rem 0',
  background: colors.panelMuted,
});

export const calloutHead = style({
  margin: '0 0 0.3rem',
  fontSize: '0.7rem',
  fontWeight: 600,
  color: colors.text,
});

export const calloutBody = style({
  margin: '0 0 0.35rem',
  fontSize: '0.66rem',
  lineHeight: 1.5,
  color: colors.textMuted,
});

export const calloutWarn = style({
  margin: '0 0 0.15rem',
  fontSize: '0.64rem',
  lineHeight: 1.5,
  color: colors.caution,
});
