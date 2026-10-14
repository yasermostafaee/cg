import { style } from '@vanilla-extract/css';
import { colors } from '../../theme.js';

export const body = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '0.4rem',
  padding: '0.1rem 0',
});

export const labeledRow = style({
  display: 'grid',
  gridTemplateColumns: '90px 1fr',
  alignItems: 'center',
  gap: '0.4rem',
});

export const label = style({
  color: colors.textMuted,
  fontSize: '0.7rem',
});

export const toggle = style({
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  background: colors.panelMuted,
  border: `1px solid ${colors.border}`,
  borderRadius: '0.22rem',
  overflow: 'hidden',
});

export const toggleOption = style({
  padding: '0.2rem 0',
  background: 'transparent',
  color: colors.textMuted,
  border: 'none',
  fontSize: '0.72rem',
  cursor: 'pointer',
  textAlign: 'center',
});

// D-048 — neutral properties-panel active fill (no blue accent), matching
// D-045-align-0/1.png.
export const toggleOptionActive = style({
  background: colors.menuHover,
  color: colors.text,
  fontWeight: 600,
});

export const colorRow = style({
  display: 'grid',
  gridTemplateColumns: '90px 1fr',
  alignItems: 'center',
  gap: '0.4rem',
});

export const colorChip = style({
  display: 'grid',
  gridTemplateColumns: 'auto 1fr auto',
  alignItems: 'center',
  gap: '0.35rem',
  background: colors.panelMuted,
  border: `1px solid ${colors.border}`,
  borderRadius: '0.22rem',
  padding: '0.1rem 0.35rem',
});

export const hexInput = style({
  background: 'transparent',
  color: colors.text,
  border: 'none',
  outline: 'none',
  padding: '0.05rem 0',
  fontSize: '0.72rem',
  fontVariantNumeric: 'tabular-nums',
  width: '100%',
  boxSizing: 'border-box',
});

export const fontSelect = style({
  background: colors.panelMuted,
  color: colors.text,
  border: `1px solid ${colors.border}`,
  borderRadius: '0.22rem',
  padding: '0.25rem 0.5rem',
  fontSize: '0.78rem',
  width: '100%',
  boxSizing: 'border-box',
});

export const chipIcon = style({
  color: colors.textMuted,
  fontSize: '0.7rem',
  fontWeight: 600,
  flexShrink: 0,
  textAlign: 'center',
});

export const chipInput = style({
  background: 'transparent',
  color: colors.text,
  border: 'none',
  outline: 'none',
  padding: '0.05rem 0',
  fontSize: '0.72rem',
  flex: '1 1 0',
  minWidth: 0,
  boxSizing: 'border-box',
  fontVariantNumeric: 'tabular-nums',
});

export const pairRow = style({
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: '0.3rem',
  alignItems: 'center',
});

export const alignmentRow = style({
  display: 'flex',
  alignItems: 'center',
  gap: '0.4rem',
  paddingTop: '0.15rem',
});

// D-045 — the align group/button styles moved to AlignButtonGroup.css.ts (the shared
// control). `alignmentRow` (the row that holds the two groups + the gear) stays here.
export const alignSpacer = style({ flex: 1 });

// D-048 — the gear button + its popover moved to TextSettingsPopover.tsx /
// TextSettingsPopover.css.ts (the "More text options" control).
