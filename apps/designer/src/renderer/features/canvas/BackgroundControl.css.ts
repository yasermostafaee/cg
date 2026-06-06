import { style } from '@vanilla-extract/css';
import { colors } from '../../theme.js';

export const compactWrap = style({
  display: 'flex',
  alignItems: 'center',
  gap: '0.3rem',
  fontSize: '0.7rem',
  color: colors.textMuted,
});

export const fullRow = style({
  display: 'grid',
  gridTemplateColumns: '90px 1fr',
  gap: '0.4rem',
  alignItems: 'center',
  padding: '0.15rem 0',
  fontSize: '0.72rem',
});

export const label = style({ color: colors.textMuted, fontSize: '0.7rem' });

export const swatchButton = style({
  width: '22px',
  height: '22px',
  border: `1px solid ${colors.border}`,
  borderRadius: '0.18rem',
  padding: 0,
  cursor: 'pointer',
  position: 'relative',
  overflow: 'hidden',
});

export const transparentChip = style({
  backgroundImage:
    'linear-gradient(45deg, #888 25%, transparent 25%, transparent 75%, #888 75%, #888),' +
    'linear-gradient(45deg, #888 25%, transparent 25%, transparent 75%, #888 75%, #888)',
  backgroundSize: '8px 8px',
  backgroundPosition: '0 0, 4px 4px',
  backgroundColor: '#fff',
});

export const colorInput = style({
  position: 'absolute',
  inset: 0,
  width: '100%',
  height: '100%',
  opacity: 0,
  cursor: 'pointer',
  border: 'none',
  padding: 0,
  background: 'transparent',
});

export const toggle = style({
  background: colors.panelMuted,
  color: colors.textMuted,
  border: `1px solid ${colors.border}`,
  borderRadius: '0.18rem',
  padding: '0.12rem 0.4rem',
  fontSize: '0.66rem',
  cursor: 'pointer',
  letterSpacing: '0.04em',
});

export const toggleActive = style({
  background: colors.accent,
  color: '#000',
  border: `1px solid ${colors.accentMuted}`,
  fontWeight: 700,
});

export const hexInput = style({
  background: colors.panelMuted,
  color: colors.text,
  border: `1px solid ${colors.border}`,
  borderRadius: '0.18rem',
  padding: '0.15rem 0.35rem',
  fontSize: '0.7rem',
  width: '76px',
  boxSizing: 'border-box',
  fontVariantNumeric: 'tabular-nums',
});

// Inline row of controls inside the full-variant layout.
export const controlsRow = style({
  display: 'flex',
  alignItems: 'center',
  gap: '0.3rem',
});
