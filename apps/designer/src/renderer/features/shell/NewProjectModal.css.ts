import { style } from '@vanilla-extract/css';
import { colors } from '../../theme.js';

export const row = style({
  display: 'grid',
  gridTemplateColumns: '120px 1fr',
  alignItems: 'center',
  gap: '0.5rem',
});

export const label = style({ color: colors.textMuted, fontSize: '0.78rem' });

export const input = style({
  background: colors.panelMuted,
  color: colors.text,
  border: `1px solid ${colors.border}`,
  borderRadius: '0.2rem',
  padding: '0.25rem 0.4rem',
  fontSize: '0.82rem',
  width: '100%',
  boxSizing: 'border-box',
});

export const inlinePair = style({
  display: 'grid',
  gridTemplateColumns: '1fr auto 1fr',
  gap: '0.3rem',
  alignItems: 'center',
});
