import { globalStyle, style } from '@vanilla-extract/css';
import { colors, hoverWash } from '../../theme.js';

export const header = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '1rem',
  marginBottom: '0.9rem',
});

export const intro = style({
  display: 'grid',
  gap: '0.25rem',
  minWidth: 0,
  color: colors.textMuted,
  fontSize: '0.78rem',
  lineHeight: 1.45,
});

globalStyle(`${intro} strong`, { color: colors.text, fontSize: '0.9rem', fontWeight: 650 });

export const count = style({ color: colors.textMuted, fontSize: '0.76rem' });

export const tableWrap = style({
  overflow: 'hidden',
  border: `1px solid ${colors.border}`,
  borderRadius: '8px',
  background: colors.panelMuted,
});

export const tableSummary = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '1rem',
  padding: '0.55rem 0.7rem',
  borderBottom: `1px solid ${colors.border}`,
  color: colors.textMuted,
  fontSize: '0.72rem',
});

globalStyle(`${tableSummary} span:first-child`, { color: colors.text, fontWeight: 600 });

export const table = style({
  width: '100%',
  borderCollapse: 'collapse',
  tableLayout: 'fixed',
  fontSize: '0.79rem',
});

globalStyle(`${table} th`, {
  color: colors.textMuted,
  fontWeight: 600,
  textAlign: 'left',
  padding: '0.5rem 0.7rem',
  background: colors.panel,
  borderBottom: `1px solid ${colors.border}`,
});
globalStyle(`${table} th:nth-child(1)`, { width: '42%' });
globalStyle(`${table} th:nth-child(2)`, { width: '28%' });
globalStyle(`${table} th:nth-child(3)`, { width: '30%' });
globalStyle(`${table} td`, {
  color: colors.text,
  padding: '0.5rem 0.7rem',
  borderBottom: `1px solid ${colors.border}`,
  verticalAlign: 'middle',
});
globalStyle(`${table} tbody tr:hover`, { backgroundImage: hoverWash() });
globalStyle(`${table} tr:last-child td`, { borderBottom: 'none' });

export const actionHeading = style({});
globalStyle(`${table} th.${actionHeading}`, { textAlign: 'right' });

export const delimiter = style({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  minWidth: '2.5rem',
  minHeight: '1.65rem',
  padding: '0.12rem 0.5rem',
  border: `1px solid ${colors.border}`,
  borderRadius: '5px',
  background: colors.background,
  color: colors.text,
  fontFamily: 'ui-monospace, SFMono-Regular, Consolas, monospace',
  textAlign: 'center',
});

export const actions = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'flex-end',
  gap: '0.35rem',
});

export const deleteControl = style({ color: colors.danger });

export const confirmGroup = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'flex-end',
  gap: '0.4rem',
  color: colors.danger,
  fontSize: '0.72rem',
});

export const form = style({
  display: 'grid',
  gap: '0.7rem',
  marginTop: '0.9rem',
  padding: '0.85rem',
  border: `1px solid ${colors.accentMuted}`,
  borderRadius: '8px',
  background: 'rgba(14, 165, 233, 0.06)',
});

export const formHeading = style({
  display: 'flex',
  alignItems: 'start',
  justifyContent: 'space-between',
  gap: '1rem',
});
globalStyle(`${formHeading} p`, {
  margin: '0.2rem 0 0',
  color: colors.textMuted,
  fontSize: '0.73rem',
});

export const formTitle = style({ margin: 0, color: colors.text, fontSize: '0.88rem' });

export const formFields = style({
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
  gap: '0.65rem',
  '@media': { 'screen and (max-width: 560px)': { gridTemplateColumns: '1fr' } },
});

export const formHelp = style({
  margin: 0,
  color: colors.textMuted,
  fontSize: '0.73rem',
  lineHeight: 1.45,
});

export const formActions = style({
  display: 'flex',
  justifyContent: 'flex-end',
  gap: '0.45rem',
  paddingTop: '0.1rem',
});

export const error = style({ margin: 0, color: colors.danger, fontSize: '0.76rem' });

export const bottom = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '0.75rem',
  marginTop: '0.9rem',
  paddingTop: '0.75rem',
  borderTop: `1px solid ${colors.border}`,
  color: colors.textMuted,
  fontSize: '0.75rem',
});

export const resetCopy = style({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '0.4rem',
});
