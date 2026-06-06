import { style } from '@vanilla-extract/css';
import { colors } from '../../theme.js';
import { DISPLAY_ROW_HEIGHT } from './metrics.js';

const ROW = `${DISPLAY_ROW_HEIGHT}px`;

export const labelCell = style({
  color: colors.textMuted,
  padding: '0 0.6rem 0 2rem',
  display: 'grid',
  gridTemplateColumns: '1fr 64px 16px',
  alignItems: 'center',
  gap: '0.4rem',
  borderRight: `1px solid ${colors.border}`,
  background: colors.panel,
  height: ROW,
  fontSize: '0.75rem',
  boxSizing: 'border-box',
});

export const labelName = style({
  color: '#a9afca',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const labelValue = style({
  color: colors.text,
  fontVariantNumeric: 'tabular-nums',
  fontSize: '0.75rem',
  textAlign: 'center',
});

export const laneCell = style({
  position: 'relative',
  height: ROW,
  boxSizing: 'border-box',
});
