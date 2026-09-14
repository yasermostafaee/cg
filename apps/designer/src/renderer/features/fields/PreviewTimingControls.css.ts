import { style } from '@vanilla-extract/css';
import { colors } from '../../theme.js';

/** Full-width mode select. Border/hover/focus come from the global input chrome. */
export const select = style({
  width: '100%',
  fontSize: '0.72rem',
});

/**
 * ADR 0009 — a designer-owned value shown as a FACT (playout mode / hold source). It sits in
 * the same column as the controls beside it and deliberately carries NONE of their chrome: no
 * border, no background, no control padding. That absence is the whole point — a bordered box
 * reads as a control, and a greyed bordered box reads as a control the operator failed to earn,
 * when the truth is that the value is the template's to state and was never theirs to set.
 * Full text colour, not muted: this is a live statement about the template, not disabled text.
 */
export const fact = style({
  width: '100%',
  fontSize: '0.72rem',
  color: colors.text,
  lineHeight: 1.35,
});

/** Compact numeric input (hold ms / repeat count). */
export const num = style({
  width: '76px',
  fontSize: '0.72rem',
  fontVariantNumeric: 'tabular-nums',
});

export const inline = style({
  display: 'flex',
  alignItems: 'center',
  gap: '0.35rem',
});

export const repeatControls = style({
  display: 'flex',
  alignItems: 'center',
  gap: '0.5rem',
});

export const muted = style({
  color: colors.textMuted,
  fontSize: '0.66rem',
});

export const checkLabel = style({
  display: 'flex',
  alignItems: 'center',
  gap: '0.25rem',
  color: colors.textMuted,
  fontSize: '0.66rem',
});

export const hint = style({
  color: colors.textMuted,
  fontSize: '0.66rem',
  lineHeight: 1.4,
  margin: '0.35rem 0 0',
});

/** Spacing around the out-point callout so it reads as a distinct notice. */
export const notice = style({
  margin: '0.1rem 0 0.4rem',
});
