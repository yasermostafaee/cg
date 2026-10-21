import { style } from '@vanilla-extract/css';
import { colors } from '../../theme.js';

export const list = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '0.25rem',
});

export const itemRow = style({
  display: 'flex',
  alignItems: 'center',
  gap: '0.2rem',
});

export const itemInput = style({
  flex: 1,
  minWidth: 0,
  background: colors.panelMuted,
  color: colors.text,
  border: `1px solid ${colors.border}`,
  borderRadius: '0.2rem',
  padding: '0.2rem 0.35rem',
  fontSize: '0.74rem',
  boxSizing: 'border-box',
  outline: 'none',
});

/** D-118 — the multi-line item-text textarea filling the item row (the look lives in the shared
 * `Textarea` primitive; this only makes it flex to the row width). */
export const itemTextArea = style({
  flex: 1,
  minWidth: 0,
});

/** D-029 — the narrow per-item dwell (seconds) column for sequences. */
export const dwellInput = style({
  width: '3.2rem',
  background: colors.panelMuted,
  color: colors.text,
  border: `1px solid ${colors.border}`,
  borderRadius: '0.2rem',
  padding: '0.2rem 0.35rem',
  fontSize: '0.74rem',
  boxSizing: 'border-box',
  outline: 'none',
});

/**
 * `PERSIAN-DIGITS-01` — a number cell whose text can never be a number: the danger edge, with the
 * sentence on the box's tooltip. Declared AFTER the two input styles so it wins on equal
 * specificity.
 */
export const inputInvalid = style({
  borderColor: colors.danger,
});

/**
 * D-083 — a sequence item is TWO lines: a top control line (kind picker + dwell +
 * reorder/remove) and the VALUE on its own full-width line below, so a long headline
 * stays readable in the narrow inspector panel.
 */
export const seqItem = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '0.25rem',
  // `D-163` — a rule under each item, so an item's second line (a picture's file name, an item's
  // text) reads as ITS line and not as a label for the item below it.
  paddingBottom: '0.4rem',
  borderBottom: `1px solid ${colors.border}`,
  selectors: { '&:last-child': { borderBottom: 'none', paddingBottom: 0 } },
});

export const seqTopLine = style({
  display: 'flex',
  alignItems: 'center',
  gap: '0.2rem',
});

/** Right-aligned, fixed-size cluster (dwell + reorder/remove) so the kind picker fills the rest. */
export const itemActions = style({
  display: 'flex',
  alignItems: 'center',
  gap: '0.2rem',
  flex: 'none',
});

/**
 * D-083 follow-up — the optional per-item "data key" bind control on a TEXT item's
 * third line. Dashed + muted so it reads as an OPTIONAL bind affordance, distinct from
 * the solid value input above it. Empty = static; a key = operator-editable.
 */
export const seqBindRow = style({
  display: 'flex',
  alignItems: 'center',
  gap: '0.25rem',
  color: colors.textMuted,
});

export const seqBindKey = style({
  flex: 1,
  minWidth: 0,
  boxSizing: 'border-box',
  background: 'transparent',
  color: colors.text,
  border: `1px dashed ${colors.border}`,
  borderRadius: '0.2rem',
  padding: '0.15rem 0.35rem',
  fontSize: '0.68rem',
  outline: 'none',
});

/**
 * `TEXT-DIGITS-01` — a bound item's Digits choice, at the end of its data-key line: sized to its
 * words so the key keeps the rest of the line (the look is the shared `Select` primitive's).
 */
export const seqBindDigits = style({
  flex: 'none',
  width: '6.2rem',
});

export const addRow = style({
  marginTop: '0.3rem',
});

/** `B-106` — a row past the repeater's max items: still editable, visibly not shown. */
export const itemOverLimit = style({
  opacity: 0.55,
});

/** `B-106` — the "not shown" fact on such a row: text, no control chrome. */
export const overLimitTag = style({
  flexShrink: 0,
  fontSize: '0.68rem',
  fontStyle: 'italic',
  color: colors.textMuted,
  whiteSpace: 'nowrap',
});

/** `D-163` — `Add pictures…` / `Add folder…`, side by side. */
export const pageButtons = style({
  display: 'flex',
  gap: '0.3rem',
  marginTop: '0.3rem',
});

/** `D-163` — a picture item's file name: one line, cut with an ellipsis, the full name in its title. */
/** `RUN-NEXT-VERSION-03` 1.6 — a picture item: its thumbnail and its name, filling the row. */
export const pictureItem = style({
  flex: 1,
  minWidth: 0,
  display: 'flex',
  alignItems: 'center',
  gap: '0.35rem',
});

export const pictureThumb = style({
  height: '1.6rem',
  aspectRatio: '16 / 9',
  objectFit: 'contain',
  flex: 'none',
  borderRadius: '0.15rem',
  background: colors.background,
});

export const pageName = style({
  color: colors.text,
  fontSize: '0.72rem',
  lineHeight: 1.4,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  minWidth: 0,
});

export const empty = style({
  color: colors.textMuted,
  fontSize: '0.68rem',
  lineHeight: 1.4,
  margin: '0.2rem 0',
});
