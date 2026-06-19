import { style } from '@vanilla-extract/css';

/** Spacing for the skipped-files notice, sitting between the search box and the grid. */
export const notice = style({
  margin: '0 0.55rem 0.4rem',
});

/** Inline dismiss affordance after the message. */
export const dismiss = style({
  marginLeft: '0.35rem',
  padding: '0 0.3rem',
  lineHeight: 1.2,
  fontSize: '0.85rem',
});
