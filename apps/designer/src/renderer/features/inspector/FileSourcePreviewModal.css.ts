import { globalStyle, style } from '@vanilla-extract/css';
import { colors } from '../../theme.js';

export const layout = style({
  display: 'grid',
  gridTemplateRows: 'auto auto minmax(0, 1fr)',
  gap: '0.85rem',
  minHeight: '60vh',
});

export const sourceCard = style({
  display: 'grid',
  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
  gap: '0.75rem',
  padding: '0.75rem',
  border: `1px solid ${colors.border}`,
  borderRadius: '8px',
  background: colors.panelMuted,
  '@media': { 'screen and (max-width: 720px)': { gridTemplateColumns: '1fr' } },
});

globalStyle(`${sourceCard} > div`, { display: 'grid', gap: '0.3rem', minWidth: 0 });
globalStyle(`${sourceCard} span`, { color: colors.textMuted, fontSize: '0.7rem', fontWeight: 600 });
globalStyle(`${sourceCard} code`, {
  overflow: 'hidden',
  color: colors.text,
  fontFamily: 'ui-monospace, SFMono-Regular, Consolas, monospace',
  fontSize: '0.78rem',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});
globalStyle(`${sourceCard} small`, {
  color: colors.textMuted,
  fontSize: '0.68rem',
  lineHeight: 1.45,
});
globalStyle(`${sourceCard} button`, { justifySelf: 'start', marginTop: '0.15rem' });

export const reloadError = style({
  margin: '-0.3rem 0 0',
  padding: '0.55rem 0.7rem',
  border: `1px solid ${colors.danger}`,
  borderRadius: '6px',
  color: colors.danger,
  fontSize: '0.74rem',
});

export const delimiterRow = style({
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr) minmax(220px, 0.45fr)',
  alignItems: 'center',
  gap: '1rem',
  padding: '0.7rem 0.8rem',
  border: `1px solid ${colors.border}`,
  borderRadius: '8px',
  background: colors.panel,
  '@media': { 'screen and (max-width: 620px)': { gridTemplateColumns: '1fr' } },
});

globalStyle(`${delimiterRow} > span`, { display: 'grid', gap: '0.2rem' });
globalStyle(`${delimiterRow} strong`, { color: colors.text, fontSize: '0.82rem' });
globalStyle(`${delimiterRow} small`, { color: colors.textMuted, fontSize: '0.7rem' });

export const delimiterActions = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'flex-end',
  flexWrap: 'wrap',
  gap: '0.55rem',
});

globalStyle(`${delimiterActions} select`, { minWidth: '220px', flex: '1 1 220px' });

export const contentGrid = style({
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
  gap: '0.85rem',
  minHeight: 0,
  '@media': { 'screen and (max-width: 780px)': { gridTemplateColumns: '1fr' } },
});

export const panel = style({
  display: 'grid',
  gridTemplateRows: 'auto minmax(0, 1fr)',
  minWidth: 0,
  minHeight: '360px',
  overflow: 'hidden',
  border: `1px solid ${colors.border}`,
  borderRadius: '8px',
  background: colors.panelMuted,
});

export const panelHeading = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '0.75rem',
  padding: '0.65rem 0.75rem',
  borderBottom: `1px solid ${colors.border}`,
});

globalStyle(`${panelHeading} strong`, { color: colors.text, fontSize: '0.8rem' });
globalStyle(`${panelHeading} small`, { color: colors.textMuted, fontSize: '0.68rem' });
globalStyle(`${panel} textarea`, {
  width: '100%',
  height: '100%',
  minHeight: '320px',
  resize: 'none',
  border: 0,
  outline: 0,
  padding: '0.75rem',
  boxSizing: 'border-box',
  background: colors.background,
  color: colors.text,
  fontFamily: 'ui-monospace, SFMono-Regular, Consolas, monospace',
  fontSize: '0.78rem',
  lineHeight: 1.6,
});

export const previewBody = style({
  minHeight: 0,
  overflow: 'auto',
  padding: '0.6rem',
});

globalStyle(`${previewBody} pre`, {
  margin: 0,
  whiteSpace: 'pre-wrap',
  overflowWrap: 'anywhere',
  color: colors.text,
  font: 'inherit',
  lineHeight: 1.55,
});

export const items = style({
  display: 'grid',
  gap: '0.35rem',
  margin: 0,
  padding: 0,
  listStyle: 'none',
});

globalStyle(`${items} li`, {
  display: 'grid',
  gridTemplateColumns: '2.2rem minmax(0, 1fr)',
  alignItems: 'start',
  gap: '0.55rem',
  padding: '0.48rem 0.55rem',
  border: `1px solid ${colors.border}`,
  borderRadius: '6px',
  background: colors.panel,
  color: colors.text,
  fontSize: '0.78rem',
  lineHeight: 1.45,
});
globalStyle(`${items} li > span`, {
  color: colors.textMuted,
  fontVariantNumeric: 'tabular-nums',
  textAlign: 'right',
});

export const empty = style({ margin: '0.35rem', color: colors.textMuted, fontSize: '0.76rem' });
