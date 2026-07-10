import { style } from '@vanilla-extract/css';
import { colors } from '../../theme.js';

// D-123 — the anchor context menu, pattern-matched to the timeline's
// LayerContextMenu chrome (fixed backdrop + clamped floating menu).

export const backdrop = style({
  position: 'fixed',
  inset: 0,
  zIndex: 40,
});

export const menu = style({
  position: 'fixed',
  zIndex: 41,
  padding: '4px',
  borderRadius: '6px',
  background: colors.panel,
  border: `1px solid ${colors.border}`,
  boxShadow: '0 8px 24px rgba(0, 0, 0, 0.45)',
  display: 'flex',
  flexDirection: 'column',
});

export const item = style({
  display: 'flex',
  alignItems: 'center',
  gap: '0.5rem',
  width: '100%',
  padding: '0.3rem 0.6rem',
  borderRadius: '4px',
  fontSize: '0.8rem',
  color: colors.text,
  textAlign: 'start',
  cursor: 'pointer',
  selectors: {
    '&:hover, &:focus-visible': {
      background: 'rgba(56, 189, 248, 0.16)',
    },
  },
});
