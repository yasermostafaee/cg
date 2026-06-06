import { style } from '@vanilla-extract/css';
import { colors } from '../../theme.js';

export const bar = style({
  display: 'flex',
  alignItems: 'center',
  gap: '0.45rem',
  padding: '0.18rem 0.75rem',
  background: colors.panel,
  borderTop: `1px solid ${colors.border}`,
  fontSize: '0.78rem',
  color: colors.textMuted,
});

export const pill = style({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '0.4rem',
  padding: '0.1rem 0.5rem',
  borderRadius: '0.25rem',
  border: `1px solid ${colors.border}`,
  background: colors.panelMuted,
});

export const spacer = style({ flex: 1 });

export const zoomWrap = style({
  display: 'flex',
  alignItems: 'center',
  gap: '0.45rem',
  fontSize: '0.7rem',
  color: colors.textMuted,
});

export const zoomSlider = style({
  width: '140px',
  accentColor: colors.accent,
  cursor: 'pointer',
});

export const zoomReadout = style({
  minWidth: '36px',
  textAlign: 'right',
  fontVariantNumeric: 'tabular-nums',
});

export const zoomButton = style({
  background: colors.panelMuted,
  color: colors.textMuted,
  border: `1px solid ${colors.border}`,
  borderRadius: '0.2rem',
  padding: '0 0.45rem',
  fontSize: '0.9rem',
  cursor: 'pointer',
  lineHeight: 1.25,
  minWidth: '22px',
});
