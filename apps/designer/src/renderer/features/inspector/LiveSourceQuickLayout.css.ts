import { style } from '@vanilla-extract/css';

export const actions = style({
  display: 'grid',
  gridTemplateColumns: '1fr',
  gap: '0.35rem',
  paddingTop: '0.25rem',
});

export const action = style({
  width: '100%',
});
