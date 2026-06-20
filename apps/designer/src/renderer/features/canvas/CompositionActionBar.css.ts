import { style } from '@vanilla-extract/css';
import { colors } from '../../theme.js';

/**
 * D-086 Phase B — the per-composition action bar that sits sticky above the canvas.
 * Carries the composition-scoped Preview / Export actions that used to live in the
 * global top bar; the export engine is already per-composition (Phase A), so these
 * are just the relocated triggers.
 */
export const bar = style({
  display: 'flex',
  alignItems: 'center',
  gap: '0.4rem',
  padding: '0.3rem 0.5rem',
  marginBottom: '0.3rem',
  background: colors.panel,
  border: `1px solid ${colors.border}`,
  borderRadius: '0.22rem',
  position: 'sticky',
  top: 0,
  zIndex: 5,
});

/** The active composition's name — context for "what these actions export". */
export const label = style({
  fontSize: '0.74rem',
  fontWeight: 600,
  color: colors.text,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  maxWidth: '16rem',
});

export const grow = style({ flex: 1 });
