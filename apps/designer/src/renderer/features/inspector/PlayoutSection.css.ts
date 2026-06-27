import { style } from '@vanilla-extract/css';
import { colors } from '../../theme.js';

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
