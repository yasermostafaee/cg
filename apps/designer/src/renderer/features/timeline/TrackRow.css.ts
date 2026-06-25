import { style } from '@vanilla-extract/css';
import { colors } from '../../theme.js';
import { TRACK_ROW_HEIGHT } from './metrics.js';

const ROW = `${TRACK_ROW_HEIGHT}px`;

export const labelCell = style({
  color: colors.textMuted,
  padding: '0 0.6rem 0 2rem',
  display: 'grid',
  // Fixed value column so numbers and colour chips line up across rows.
  gridTemplateColumns: '1fr 64px 16px',
  alignItems: 'center',
  gap: '0.4rem',
  borderRight: `1px solid ${colors.border}`,
  background: colors.panel,
  height: ROW,
  fontSize: '0.75rem',
  boxSizing: 'border-box',
});

export const laneCell = style({
  position: 'relative',
  height: ROW,
  boxSizing: 'border-box',
});

export const labelName = style({
  color: '#a9afca',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

// Editable numeric value — same look as the readout but interactive. The
// cursor/touchAction are set inline by RealtimeNumberInput per editing state.
export const valueNumberInput = style({
  width: '100%',
  background: 'transparent',
  color: colors.text,
  border: '1px solid transparent',
  borderRadius: '0.18rem',
  padding: '0 0.15rem',
  fontSize: '0.7rem',
  fontVariantNumeric: 'tabular-nums',
  textAlign: 'center',
  outline: 'none',
  boxSizing: 'border-box',
});

// Value + dim unit, centred in the cell (e.g. "85 %").
export const valueUnitWrap = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '1px',
  width: '100%',
});

// Content-sized variant used when a unit follows the value.
export const valueNumberInputAuto = style({
  flex: '0 0 auto',
  width: 'auto',
  minWidth: 0,
  maxWidth: '3rem',
  background: 'transparent',
  color: colors.text,
  border: '1px solid transparent',
  borderRadius: '0.18rem',
  padding: '0 0.1rem',
  fontSize: '0.7rem',
  fontVariantNumeric: 'tabular-nums',
  textAlign: 'center',
  outline: 'none',
  boxSizing: 'border-box',
});

// Colour value: swatch + editable hex in one row, centred in the cell.
export const colorValue = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '0.3rem',
  width: '100%',
});

export const valueHexInput = style({
  flex: '1 1 0',
  // D-079 — was minWidth:0, which let the input collapse inside the colorValue cell and
  // clip the value. A 7.5ch floor (the label drops the leading #) keeps it readable; the
  // flex-grow still expands it to fit a full #RRGGBBAA in the 300px label column.
  minWidth: '7.5ch',
  background: 'transparent',
  color: colors.text,
  border: '1px solid transparent',
  borderRadius: '0.18rem',
  padding: '0 0.15rem',
  fontSize: '0.7rem',
  fontVariantNumeric: 'tabular-nums',
  letterSpacing: '0.02em',
  textAlign: 'center',
  outline: 'none',
  boxSizing: 'border-box',
});

// B-003: lane diamonds are always yellow; a selected diamond's border turns
// blue (and its following interpolation line too — see interpLineSelected).
// Its left/top are per-keyframe and applied inline.
export const keyDiamond = style({
  position: 'absolute',
  top: '50%',
  width: '9px',
  height: '9px',
  transform: 'translate(-50%, -50%) rotate(45deg)',
  background: '#FDE047',
  border: `1px solid ${colors.keyframeBorder}`,
  cursor: 'grab',
});

export const keyDiamondSelected = style({
  border: `1.5px solid ${colors.accent}`,
  boxShadow: `0 0 0 1px ${colors.accent}`,
});

// D-009 / B-003 — line drawn between two adjacent keyframes on the same track.
// Muted by default; highlighted in accent blue if the earlier keyframe of the
// pair is selected.
export const interpLine = style({
  position: 'absolute',
  top: '50%',
  height: '1px',
  background: colors.textMuted,
  opacity: 0.55,
  transform: 'translateY(-0.5px)',
  pointerEvents: 'none',
});

export const interpLineSelected = style({
  background: colors.accent,
  opacity: 1,
  height: '1.5px',
});

// B-003: small SVG curve glyph centred on a segment. Its left is applied inline.
export const interpGlyphWrap = style({
  position: 'absolute',
  top: '50%',
  transform: 'translate(-50%, -50%)',
  width: '14px',
  height: '8px',
  background: '#1c1f2d',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  pointerEvents: 'none',
});

// Right-click keyframe menu. Its left/top are clamped inline to the viewport.
export const menu = style({
  position: 'fixed',
  minWidth: '140px',
  background: colors.panel,
  border: `1px solid ${colors.border}`,
  borderRadius: '0.25rem',
  boxShadow: '0 6px 18px rgba(0,0,0,0.45)',
  padding: '0.25rem 0',
  zIndex: 70,
  fontSize: '0.74rem',
});

export const menuHeader = style({
  padding: '0.2rem 0.6rem 0.3rem',
  color: colors.textMuted,
  fontSize: '0.66rem',
  letterSpacing: '0.05em',
  borderBottom: `1px solid ${colors.border}`,
  marginBottom: '0.2rem',
});

export const menuItem = style({
  display: 'block',
  width: '100%',
  background: 'transparent',
  color: colors.text,
  border: 'none',
  textAlign: 'left',
  padding: '0.3rem 0.7rem',
  fontSize: '0.76rem',
  cursor: 'pointer',
});

export const menuItemDanger = style({ color: '#fda4af' });

export const menuSeparator = style({
  height: '1px',
  background: colors.border,
  margin: '0.25rem 0',
});
