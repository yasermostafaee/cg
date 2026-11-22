import { style } from '@vanilla-extract/css';
import { colors } from '../../theme.js';

export const body = style({
  width: 390,
  maxWidth: 'calc(100vw - 32px)',
  display: 'grid',
  gridTemplateRows: 'auto minmax(0, 1fr) auto',
  maxHeight: 'calc(100dvh - 36px)',
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
export const scrollBody = style({
  display: 'grid',
  alignContent: 'start',
  minHeight: 0,
  gap: 10,
  overflowY: 'auto',
  overscrollBehavior: 'contain',
  padding: '2px 5px 2px 2px',
});
export const choices = style({
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(min(76px, 100%), 1fr))',
  maxHeight: 'clamp(64px, 24dvh, 180px)',
  overflowY: 'auto',
  overscrollBehavior: 'contain',
  alignContent: 'start',
  gap: 4,
  padding: 2,
});
export const choice = style({
  position: 'relative',
  display: 'flex',
  flexDirection: 'column',
  gap: 0,
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: 40,
  paddingInline: 10,
  selectors: {
    '&[aria-checked="true"]': { boxShadow: `inset 0 0 0 2px ${colors.accent}` },
  },
});
export const selectedMark = style({ position: 'absolute', insetInlineStart: 3, top: 3 });
export const footer = style({
  display: 'flex',
  justifyContent: 'flex-end',
  paddingTop: 6,
  borderTop: `1px solid ${colors.border}`,
});
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
export const hint = style({ margin: 0, fontSize: 11, color: colors.textMuted, lineHeight: 1.4 });
export const colorControl = style({ display: 'inline-flex', alignItems: 'center', gap: 4 });
export const colorHex = style([
  input,
  { width: 68, height: 24, padding: '2px 3px', fontSize: 11, fontVariantNumeric: 'tabular-nums' },
]);
export const placementControls = style({
  display: 'grid',
  gridTemplateColumns: 'auto minmax(0, 1fr)',
  alignItems: 'center',
  gap: 12,
});
export const anchorGrid = style({
  display: 'grid',
  gridTemplateColumns: 'repeat(3, 28px)',
  gap: 2,
});
export const anchorButton = style({
  minInlineSize: 0,
  paddingInline: 0,
  justifyContent: 'center',
});

export const frameOptions = style({
  display: 'grid',
  gap: 4,
});
export const borderRow = style({
  paddingInlineStart: 16,
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr) auto 24px',
  alignItems: 'center',
  gap: 5,
});
export const colorLabel = style({
  display: 'flex',
  alignItems: 'center',
  gap: 6,
});
export const help = style({
  fontSize: 11,
  color: colors.textMuted,
});

export const ratioControlRow = style({
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr) auto',
  alignItems: 'center',
  gap: 6,
});
export const visibleDot = style({
  position: 'absolute',
  insetInlineEnd: 4,
  top: 5,
  width: 6,
  height: 6,
  border: '1px solid currentColor',
  borderRadius: '50%',
});
