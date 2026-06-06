import { style } from '@vanilla-extract/css';

// `width` / `height` and `cursor` depend on the axis and are applied inline.
export const handle = style({
  position: 'relative',
  flex: '0 0 auto',
  alignSelf: 'stretch',
  background: 'transparent',
});

// `background` (accent / border), the axis-dependent edges and `width` /
// `height` (the live thickness) are applied inline.
export const line = style({
  position: 'absolute',
  borderRadius: '2px',
  transition: 'background 90ms ease, height 90ms ease, width 90ms ease',
});
