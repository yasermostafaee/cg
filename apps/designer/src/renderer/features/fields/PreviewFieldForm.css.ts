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

/** D-106 — auto-grow textarea for long text/multiline values (height set inline to scrollHeight). */
export const grow = style({
  resize: 'none',
  overflow: 'hidden',
  minHeight: '1.4rem',
  lineHeight: 1.4,
});

/** D-106 — a field edited but NOT yet applied: an amber left accent (reuses the
 *  D-088/D-089 unsaved-amber `#ffdd40`). */
export const rowPending = style({
  borderLeft: '2px solid #ffdd40',
  paddingLeft: '0.4rem',
  marginLeft: '-0.42rem',
});

/** The small "pending" tag next to a dirty field's label. */
export const pendingTag = style({
  marginLeft: '0.4rem',
  color: '#ffdd40',
  fontSize: '0.58rem',
  fontWeight: 700,
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
});

/** The per-field "Update" affordance (applies just this field). */
export const updateField = style({
  justifySelf: 'start',
  marginTop: '0.05rem',
});

/** The global "Update all" control in the form header; amber when anything is pending. */
export const updateAllPending = style({
  borderColor: '#ffdd40',
  color: '#ffdd40',
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

/** A nested child-instance namespace group (D-025) — indented + left rule. */
export const group = style({
  marginTop: '0.5rem',
  paddingLeft: '0.5rem',
  borderLeft: `2px solid ${colors.border}`,
});

/** The namespace (instance name) heading for a group. */
export const groupTitle = style({
  color: colors.accent,
  fontSize: '0.62rem',
  fontWeight: 700,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
});
