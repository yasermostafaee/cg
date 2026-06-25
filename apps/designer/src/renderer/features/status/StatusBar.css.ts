import { globalStyle, style } from '@vanilla-extract/css';
import { colors } from '../../theme.js';

export const bar = style({
  display: 'flex',
  alignItems: 'center',
  gap: '0.45rem',
  padding: '0.18rem 0.75rem',
  background: colors.panel,
  borderTop: `1px solid ${colors.border}`,
  fontSize: '0.78rem',
  color: colors.textMuted,
});

export const pill = style({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '0.4rem',
  padding: '0.1rem 0.5rem',
  borderRadius: '0.25rem',
  border: `1px solid ${colors.border}`,
  background: colors.panelMuted,
});

export const spacer = style({ flex: 1 });

export const zoomWrap = style({
  display: 'flex',
  alignItems: 'center',
  gap: '0.45rem',
  fontSize: '0.7rem',
  color: colors.textMuted,
});

// D-074 — strip the native range chrome (the boxy track outline) and draw a clean,
// borderless track + thumb. `appearance: none` removes the box; the element's own
// background is the track and the vendor pseudo-elements below draw the thumb.
export const zoomSlider = style({
  appearance: 'none',
  WebkitAppearance: 'none',
  width: '140px',
  height: '4px',
  background: colors.border,
  borderRadius: '9999px',
  border: 'none',
  margin: 0,
  accentColor: colors.accent,
  cursor: 'pointer',
});

globalStyle(`${zoomSlider}::-webkit-slider-thumb`, {
  WebkitAppearance: 'none',
  appearance: 'none',
  width: '12px',
  height: '12px',
  marginTop: '-4px', // centre the 12px thumb on the 4px track
  borderRadius: '50%',
  background: colors.accent,
  border: 'none',
  cursor: 'pointer',
});

globalStyle(`${zoomSlider}::-moz-range-thumb`, {
  width: '12px',
  height: '12px',
  borderRadius: '50%',
  background: colors.accent,
  border: 'none',
  cursor: 'pointer',
});

globalStyle(`${zoomSlider}::-moz-range-track`, {
  height: '4px',
  background: colors.border,
  borderRadius: '9999px',
  border: 'none',
});

export const zoomReadout = style({
  minWidth: '36px',
  textAlign: 'right',
  fontVariantNumeric: 'tabular-nums',
});

export const zoomButton = style({
  background: colors.panelMuted,
  color: colors.textMuted,
  border: `1px solid ${colors.border}`,
  borderRadius: '0.2rem',
  padding: '0 0.45rem',
  fontSize: '0.9rem',
  cursor: 'pointer',
  lineHeight: 1.25,
  minWidth: '22px',
});
