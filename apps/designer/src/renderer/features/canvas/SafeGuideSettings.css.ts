import { style } from '@vanilla-extract/css';
import { colors } from '../../theme.js';

export const body = style({
  width: 390,
  maxWidth: 'calc(100vw - 32px)',
  display: 'grid',
  gap: 10,
  fontSize: 12,
  color: colors.text,
});
export const heading = style({
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: 8,
});
export const choices = style({ display: 'flex', gap: 4 });
export const outputSettings = style({
  display: 'grid',
  gap: 6,
  padding: 8,
  border: `1px solid ${colors.border}`,
  borderRadius: 4,
});
export const outputGrid = style({
  display: 'grid',
  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
  gap: 10,
});
export const outputField = style({
  display: 'grid',
  gridTemplateColumns: 'max-content minmax(0, 1fr)',
  alignItems: 'center',
  gap: 7,
});
export const check = style({ display: 'inline-flex', alignItems: 'center', gap: 7 });
export const checkbox = style({ width: 14, height: 14, margin: 0, accentColor: colors.accent });
export const list = style({ display: 'grid', gap: 6, maxHeight: 250, overflowY: 'auto' });
export const row = style({
  display: 'grid',
  gridTemplateColumns: '16px 18px minmax(70px,1fr) 64px 94px 22px 22px',
  alignItems: 'center',
  gap: 5,
});
export const axis = style({ color: colors.textMuted, fontSize: 11, textAlign: 'center' });
export const input = style({
  minWidth: 0,
  width: '100%',
  boxSizing: 'border-box',
  height: 27,
  padding: '3px 6px',
  background: colors.panelMuted,
  color: colors.text,
  border: `1px solid ${colors.border}`,
  borderRadius: 3,
  fontFamily: 'inherit',
  fontSize: 12,
  colorScheme: 'dark',
  selectors: {
    '&:focus': { outline: `1px solid ${colors.accent}`, outlineOffset: 0 },
    '&[aria-invalid="true"]': { borderColor: colors.danger },
  },
});
export const position = style({
  display: 'grid',
  gridTemplateColumns: 'minmax(0,1fr) auto',
  alignItems: 'center',
  gap: 3,
});
export const hint = style({ margin: 0, fontSize: 11, color: colors.textMuted, lineHeight: 1.4 });
export const colorControl = style({ display: 'inline-flex', alignItems: 'center', gap: 4 });
export const colorHex = style([
  input,
  { width: 68, height: 24, padding: '2px 3px', fontSize: 11, fontVariantNumeric: 'tabular-nums' },
]);
