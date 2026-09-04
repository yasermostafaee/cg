import { style } from '@vanilla-extract/css';
import { colors } from '../../theme.js';
import { inlineMuted } from './prose.css.js';

/**
 * LOOKS phase 2 (`design.md` §14) — the Looks section's resting surfaces.
 *
 * Tokens + local literals only, the `ArrangementsSection.css.ts` precedent: the shared
 * `Button` / `Select` primitives supply every interactive state; nothing here restyles a
 * control.
 *
 * `DESIGNER-FIX-0905` §4 — the section's own `empty` / `summary` / `hint` (0.63–0.68rem) are
 * gone; what inline text remains uses the shared legible default (`prose.css.ts`).
 */

export const hint = inlineMuted;

export const groupLabel = style({
  fontSize: '0.62rem',
  fontWeight: 600,
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
  color: colors.textMuted,
  margin: '0.5rem 0 0.2rem',
});

/**
 * ⭐ `B-184` — the issue block's HEADING, in `danger`.
 *
 * Its own style rather than `groupLabel` recoloured: `groupLabel` is the neutral heading for
 * every other group in this panel, and turning it red would turn all of them red. Same
 * metrics on purpose, so only the colour distinguishes it.
 */
export const issueSummary = style({
  // `DESIGNER-FIX-0905` §4 — the refusal heading is set a step ABOVE the inline default
  // (0.76rem), not below it as it was (0.62rem): it names a blocking condition, and it is
  // louder now precisely because everything around it got shorter.
  fontSize: '0.8rem',
  fontWeight: 700,
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
  color: colors.danger,
  margin: '0.5rem 0 0.2rem',
});

const rowBase = {
  borderRadius: '0.25rem',
  marginBottom: '0.3rem',
  border: `1px solid ${colors.border}`,
} as const;

export const row = style({ ...rowBase, background: 'transparent' });

/** The ACTIVE look — the one the canvas is showing. Fill + accent bar, never hue alone. */
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

export const rowName = style({
  flex: 1,
  minWidth: 0,
  textAlign: 'start',
  justifyContent: 'flex-start',
});

export const addRow = style({
  display: 'flex',
  alignItems: 'center',
  gap: '0.3rem',
  marginTop: '0.35rem',
});

export const addField = style({ flex: 1, minWidth: 0 });

export const rowBody = style({ padding: '0.1rem 0.25rem 0.25rem' });

/**
 * ⭐ `B-184` — an EXPORT REFUSAL is drawn in `danger`, not `caution`.
 *
 * These rows are `severity: 'error'` preflight issues: the author cannot export at all while
 * one stands. They were amber while the status bar drew the same facts red, so one condition
 * had two colours and the softer one was in the panel the author actually works in.
 *
 * 🔴 The theme's own tokens already decide this. `caution` is documented as *"a legitimate
 * state the operator should NOTICE, but which is not an error"*, and `danger`'s comment
 * reserves red for *"real errors"*. A hard export refusal is the second, so the amber was
 * contradicting the token that carried it — no new colour is introduced here, and no third
 * state is invented.
 */
export const issue = style({
  // §4 — the refusal ROWS name the field and give an example value; they are read, not
  // scanned, so they get the inline default's size in the danger colour.
  fontSize: '0.76rem',
  color: colors.danger,
  margin: '0.2rem 0',
  lineHeight: 1.45,
  maxWidth: '46ch',
});
