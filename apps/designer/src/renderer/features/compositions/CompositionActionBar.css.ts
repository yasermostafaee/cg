import { style } from '@vanilla-extract/css';
import { colors } from '../../theme.js';

/**
 * D-086 Phase B — the per-composition action footer pinned at the BOTTOM of the
 * left rail (Compositions / Project Assets / Shared Library). It sits OFF the canvas
 * so the editing surface keeps its full height; the rail's panels scroll above it
 * (flex:1) while this footer stays visible (flex-shrink:0).
 */
export const bar = style({
  flexShrink: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: '0.3rem',
  padding: '0.4rem',
  borderTop: `1px solid ${colors.border}`,
  background: colors.panel,
});

/** The active composition's name — context for "what these actions export". */
export const label = style({
  fontSize: '0.7rem',
  fontWeight: 600,
  color: colors.textMuted,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
});

/** The three compact actions share the rail width equally. */
export const actions = style({
  display: 'flex',
  gap: '0.3rem',
});

export const action = style({
  flex: 1,
  minWidth: 0,
});

/** Leading glyph (aria-hidden — the accessible name comes from each button's aria-label). */
export const glyph = style({ marginInlineEnd: '0.18rem' });
