import { style } from '@vanilla-extract/css';
import { colors } from '../../theme.js';

export const wrap = style({
  flex: 1,
  minHeight: 0,
  minWidth: 0,
  display: 'flex',
  flexDirection: 'column',
  width: '100%',
  boxSizing: 'border-box',
});

export const header = style({
  display: 'flex',
  alignItems: 'center',
  gap: '0.3rem',
  padding: '0.25rem 0.4rem',
  background: colors.panel,
  border: `1px solid ${colors.border}`,
  borderRadius: '0.22rem',
  marginBottom: '0.3rem',
  fontSize: '0.74rem',
  color: colors.textMuted,
});

export const headerButton = style({
  width: '22px',
  height: '22px',
  background: 'transparent',
  color: colors.textMuted,
  border: `1px solid ${colors.border}`,
  borderRadius: '0.2rem',
  fontSize: '0.78rem',
  lineHeight: 1,
  cursor: 'pointer',
  padding: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
});

export const zoomReadout = style({
  minWidth: '40px',
  textAlign: 'center',
  fontSize: '0.7rem',
  fontVariantNumeric: 'tabular-nums',
  color: colors.text,
});

export const spacer = style({ flex: 1 });

export const outer = style({
  flex: 1,
  background: '#161927',
  border: `1px solid ${colors.border}`,
  borderRadius: '0.25rem',
  minHeight: 0,
  minWidth: 0,
  overflow: 'auto',
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'flex-start',
  padding: '0.5rem',
  width: '100%',
  boxSizing: 'border-box',
  position: 'relative',
});

export const centerWrap = style({
  margin: 'auto',
  position: 'relative',
});

// Stage occupies the scaled footprint so layout reserves the right space and
// the overlay's hit-test math sees matching bounding-rect dimensions. Its
// width/height (scene × zoom) are applied inline. D-011: the checkerboard
// surfaces the scene's transparency.
export const stage = style({
  position: 'relative',
  backgroundColor: '#3d4253',
  backgroundImage:
    'linear-gradient(45deg, #5b6075 25%, transparent 25%),' +
    'linear-gradient(-45deg, #5b6075 25%, transparent 25%),' +
    'linear-gradient(45deg, transparent 75%, #5b6075 75%),' +
    'linear-gradient(-45deg, transparent 75%, #5b6075 75%)',
  backgroundSize: '48px 48px',
  backgroundPosition: '0 0, 0 24px, 24px -24px, -24px 0',
  boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
  overflow: 'hidden',
});

export const empty = style({
  color: colors.textMuted,
  fontSize: '0.9rem',
  textAlign: 'center',
  lineHeight: 1.6,
  margin: 'auto',
});

export const iframe = style({
  border: 0,
  display: 'block',
  width: '100%',
  height: '100%',
  background: 'transparent',
  pointerEvents: 'none',
});
