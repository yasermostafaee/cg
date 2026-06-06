import { style } from '@vanilla-extract/css';
import { colors } from '../../theme.js';

// Static chrome for the inline text editor. Geometry (left/top/width/height),
// the element's colour, font, alignment and rotation transform are per-element
// and applied inline.
export const editor = style({
  position: 'absolute',
  background: 'rgba(56, 189, 248, 0.08)',
  outline: `2px solid ${colors.accent}`,
  outlineOffset: 0,
  padding: 0,
  margin: 0,
  boxSizing: 'border-box',
  cursor: 'text',
  whiteSpace: 'pre-wrap',
  wordWrap: 'break-word',
  transformOrigin: '0 0',
});
