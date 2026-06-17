import { style } from '@vanilla-extract/css';
import { colors } from '../../theme.js';

/**
 * D-045 — the shared alignment button-group styling (extracted from TextStyleSection.css
 * so text / ticker / clock / sequence render ONE control). A bordered row of square,
 * bare icon buttons with an accent active state.
 */
export const group = style({
  display: 'flex',
  background: colors.panelMuted,
  border: `1px solid ${colors.border}`,
  borderRadius: '0.22rem',
  overflow: 'hidden',
});

export const button = style({
  width: '24px',
  height: '22px',
  background: 'transparent',
  color: colors.textMuted,
  border: 'none',
  cursor: 'pointer',
  fontSize: '0.7rem',
  padding: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
});

// D-048 — active state uses the neutral properties-panel fill (`menuHover` —
// documented as the active fill matching the Loopic reference), NOT the blue
// accent. Matches D-045-align-0/1.png.
export const buttonActive = style({
  background: colors.menuHover,
  color: colors.text,
});
