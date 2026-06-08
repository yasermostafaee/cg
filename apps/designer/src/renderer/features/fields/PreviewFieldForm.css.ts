import { style } from '@vanilla-extract/css';
import { colors } from '../../theme.js';

/** Header above the data-key form (its own scroll region in the modal). */
export const header = style({
  display: 'flex',
  alignItems: 'baseline',
  justifyContent: 'space-between',
  gap: '0.5rem',
  marginBottom: '0.4rem',
});

export const title = style({
  color: colors.textMuted,
  fontSize: '0.6rem',
  fontWeight: 700,
  letterSpacing: '0.07em',
  textTransform: 'uppercase',
});

export const count = style({
  color: colors.textMuted,
  fontSize: '0.66rem',
  fontVariantNumeric: 'tabular-nums',
});

export const row = style({
  display: 'grid',
  gridTemplateColumns: '1fr',
  gap: '0.15rem',
  margin: '0.3rem 0',
});

export const label = style({
  color: colors.textMuted,
  fontSize: '0.7rem',
});

export const required = style({ color: colors.accent });

export const input = style({
  width: '100%',
  background: colors.panelMuted,
  color: colors.text,
  border: `1px solid ${colors.border}`,
  borderRadius: '0.2rem',
  padding: '0.2rem 0.35rem',
  fontSize: '0.74rem',
  boxSizing: 'border-box',
  outline: 'none',
});

export const inputInvalid = style({
  borderColor: colors.danger,
});

/** Inline per-field error — distinct (danger) and announced, never muted. */
export const error = style({
  display: 'flex',
  alignItems: 'center',
  gap: '0.25rem',
  color: colors.danger,
  fontSize: '0.66rem',
  fontWeight: 600,
  lineHeight: 1.3,
});

export const hint = style({
  color: colors.textMuted,
  fontSize: '0.68rem',
  lineHeight: 1.4,
  margin: '0.2rem 0',
});

/** Spacing under a warning banner so it sits clearly above the fields. */
export const banner = style({
  marginBottom: '0.45rem',
});
