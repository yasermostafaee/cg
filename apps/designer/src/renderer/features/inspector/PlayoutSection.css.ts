import { style } from '@vanilla-extract/css';
import { colors } from '../../theme.js';
import { inlineMuted } from './prose.css.js';

/**
 * D-108 (visual) — the READ-ONLY nested-composition drill-in rows in the Playout
 * checklist. A solid filled chip (no border, tighter vertical padding) so the
 * nested group reads as a distinct, openable surface. Paired with the shared
 * Button `variant="bare"`, which supplies the focus-visible / active-press /
 * disabled states; only the resting + hover FILL live here.
 *
 * The hover re-asserts the chip's own (lighter) blue so the `bare` neutral hover
 * (`menuHover`) doesn't clobber it — same `:hover`-selector shape as the recipe's
 * `bare`, defined here (imported after `Button.css`) so it wins the tie, exactly
 * as the recipe's `selected` is "defined after `variant` so it wins". A literal
 * hover shade matches the recipe's own variants (e.g. `secondary`'s `#3a3f59`);
 * `#1a4d6b` has no palette token, so it stays a local literal (no ad-hoc token).
 */
export const nestedRow = style({
  display: 'flex',
  alignItems: 'center',
  gap: '0.35rem',
  width: '100%',
  justifyContent: 'flex-start',
  textAlign: 'start',
  fontSize: '0.7rem',
  color: colors.text,
  background: '#1a4d6b',
  border: 'none',
  borderRadius: '0.22rem',
  padding: '7px 0.5rem',
  selectors: {
    '&:hover:not(:disabled):not([aria-pressed="true"])': { background: '#21618c' },
  },
});

/**
 * D-125 Phase 3b-1 — a Playout ACTION row: `label · current value · [button]`.
 *
 * These four actions (clear/add out point, pin/reset content start) used to be
 * underlined text links buried mid-sentence — visually weightless relative to what
 * they do, and labelled by their prose ("Clear" alone does not say what it clears).
 * The row makes the action a first-class control: the label names the setting, the
 * value shows its current state, and the button carries a self-contained verb. Any
 * genuinely instructional copy moves to a muted caption BELOW (see `caption`), so
 * prose is no longer the container for actions.
 */
export const actionRow = style({
  display: 'flex',
  alignItems: 'center',
  gap: '0.4rem',
  marginTop: '0.4rem',
});

/** The setting's name — matches the inspector's other row labels. */
export const actionLabel = style({
  color: colors.textMuted,
  fontSize: '0.7rem',
  flex: '0 0 74px',
});

/** The setting's CURRENT value, the thing the button acts on. */
export const actionValue = style({
  color: colors.text,
  fontSize: '0.7rem',
  fontVariantNumeric: 'tabular-nums',
  flex: '1 1 auto',
});

/**
 * Instructional prose, demoted out of the action itself. `DESIGNER-FIX-0905` §4 — the shared
 * legible default, not a 0.66rem copy of it.
 */
export const caption = inlineMuted;
