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
 * D-083 — a sequence item is TWO lines: a top control line (kind picker + dwell +
 * reorder/remove) and the VALUE on its own full-width line below, so a long headline
 * stays readable in the narrow inspector panel.
 */
export const seqItem = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '0.25rem',
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

/** The full-width value (text input OR composition picker) on the item's second line. */
export const seqValue = style({
  width: '100%',
  boxSizing: 'border-box',
  background: colors.panelMuted,
  color: colors.text,
  border: `1px solid ${colors.border}`,
  borderRadius: '0.2rem',
  padding: '0.25rem 0.4rem',
  fontSize: '0.74rem',
  outline: 'none',
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

export const addRow = style({
  marginTop: '0.3rem',
});

export const empty = style({
  color: colors.textMuted,
  fontSize: '0.68rem',
  lineHeight: 1.4,
  margin: '0.2rem 0',
});
