import { style } from '@vanilla-extract/css';

export const layoutActions = style({
  display: 'grid',
  gridTemplateColumns: '1fr',
  gap: '0.3rem',
  padding: '0.1rem 0',
});

export const layoutButton = style({
  width: '100%',
});
