import { globalStyle, style } from '@vanilla-extract/css';
import { colors } from '../../theme.js';

/** Header above the data-key form (its own scroll region in the modal). */
export const header = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '0.5rem',
  padding: '0.15rem 0.35rem 0.45rem',
});

export const title = style({
  color: colors.textMuted,
  fontSize: '0.68rem',
  fontWeight: 700,
  letterSpacing: '0.07em',
  textTransform: 'uppercase',
});

export const row = style({
  display: 'grid',
  gridTemplateColumns: 'minmax(8.5rem, 0.8fr) minmax(0, 2fr)',
  alignItems: 'start',
  columnGap: '0.7rem',
  rowGap: '0.3rem',
  padding: '0.55rem 0.4rem',
  borderBottom: `1px solid ${colors.border}`,
});

export const columns = style({
  display: 'grid',
  gridTemplateColumns: 'minmax(8.5rem, 0.8fr) minmax(0, 2fr)',
  gap: '0.7rem',
  padding: '0.28rem 0.4rem',
  borderTop: `1px solid ${colors.border}`,
  borderBottom: `1px solid ${colors.border}`,
  background: colors.panelMuted,
  color: colors.textMuted,
  fontSize: '0.56rem',
  fontWeight: 700,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
});

export const label = style({
  minWidth: 0,
  lineHeight: 1.3,
  display: 'flex',
  flexDirection: 'column',
  gap: '0.15rem',
});

export const keyLine = style({
  display: 'flex',
  alignItems: 'center',
  gap: '0.25rem',
  minWidth: 0,
});

export const key = style({
  color: colors.text,
  fontFamily: 'inherit',
  fontSize: '0.74rem',
  fontWeight: 700,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const friendlyLabel = style({
  color: colors.textMuted,
  fontSize: '0.64rem',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const required = style({ color: colors.accent });

export const readOnlyTag = style({
  marginLeft: '0.4rem',
  color: colors.accent,
  fontSize: '0.58rem',
  fontWeight: 700,
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
});

export const input = style({
  width: '100%',
  minHeight: '2rem',
  background: colors.background,
  color: colors.text,
  border: `1px solid ${colors.keyframeBorder}`,
  borderRadius: '0.25rem',
  padding: '0.35rem 0.5rem',
  fontSize: '0.78rem',
  fontWeight: 500,
  boxSizing: 'border-box',
  outline: 'none',
  selectors: {
    '&:focus-visible': {
      borderColor: colors.accent,
      boxShadow: `0 0 0 1px ${colors.accent}`,
    },
  },
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

export const readOnlyValue = style({
  resize: 'none',
  cursor: 'text',
});

export const fileManagedValue = style({
  display: 'grid',
  gap: '0.2rem',
  minWidth: 0,
  padding: '0.45rem 0.55rem',
  border: `1px solid ${colors.border}`,
  borderRadius: '4px',
  background: colors.panelMuted,
  color: colors.text,
  fontSize: '0.7rem',
});

globalStyle(`${fileManagedValue} > span`, {
  color: colors.checkPass,
  fontWeight: 700,
});

globalStyle(`${fileManagedValue} > code`, {
  minWidth: 0,
  overflowWrap: 'anywhere',
  color: colors.textMuted,
  fontFamily: 'inherit',
});

export const readOnlyItems = style({
  display: 'grid',
  gap: '0.25rem',
  margin: 0,
  padding: 0,
  listStyle: 'none',
});

globalStyle(`${readOnlyItems} li`, {
  display: 'grid',
  gridTemplateColumns: '1.7rem minmax(0, 1fr)',
  gap: '0.45rem',
  padding: '0.35rem 0.45rem',
  border: `1px solid ${colors.border}`,
  borderRadius: '4px',
  background: colors.panelMuted,
  color: colors.text,
  fontSize: '0.72rem',
  lineHeight: 1.4,
});

globalStyle(`${readOnlyItems} li > span`, {
  color: colors.textMuted,
  textAlign: 'right',
  fontVariantNumeric: 'tabular-nums',
});

/** D-106 — a field edited but NOT yet applied: an amber left accent (reuses the
 *  D-088/D-089 unsaved-amber `#ffdd40`). */
export const rowPending = style({
  borderLeft: `3px solid ${colors.caution}`,
  paddingLeft: '0.5rem',
  background: colors.cautionSurface,
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
  gridColumn: 2,
});

export const hint = style({
  color: colors.textMuted,
  fontSize: '0.68rem',
  lineHeight: 1.4,
  margin: '0.2rem 0',
  paddingInlineStart: '0.8rem',
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

globalStyle(`${row} > :nth-child(2)`, {
  gridColumn: 2,
  minWidth: 0,
});

globalStyle(`${row} > ${readOnlyItems}`, {
  gridColumn: 2,
});

globalStyle(`${row} > ${fileManagedValue}`, {
  gridColumn: 2,
});

const previewControl = {
  backgroundColor: colors.background,
  color: colors.text,
  borderColor: colors.keyframeBorder,
  fontWeight: 500,
} as const;

globalStyle(`${row} input:not([type='checkbox'])`, previewControl);
globalStyle(`${row} textarea`, previewControl);
globalStyle(`${row} select`, previewControl);
globalStyle(`${row} input:not([type='checkbox']):focus-visible`, {
  borderColor: colors.accent,
  boxShadow: `0 0 0 1px ${colors.accent}`,
});
globalStyle(`${row} textarea:focus-visible`, {
  borderColor: colors.accent,
  boxShadow: `0 0 0 1px ${colors.accent}`,
});
globalStyle(`${row} select:focus-visible`, {
  borderColor: colors.accent,
  boxShadow: `0 0 0 1px ${colors.accent}`,
});

/** The namespace (instance name) heading for a group. */
export const groupTitle = style({
  color: colors.accent,
  fontSize: '0.62rem',
  fontWeight: 700,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
});
