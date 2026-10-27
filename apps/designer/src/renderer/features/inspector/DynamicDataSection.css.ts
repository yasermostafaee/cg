import { style } from '@vanilla-extract/css';
import { colors } from '../../theme.js';
import { inlineMuted } from './prose.css.js';

// Live duplicate-key warning under the Data key input.
export const warn = style({
  margin: '0.1rem 0 0.3rem',
  color: colors.danger,
  fontSize: '0.76rem',
  lineHeight: 1.45,
});

/**
 * Hint shown while the element has no Data key (still static). `DESIGNER-FIX-0905` §4 —
 * this class is imported as `dds.hint` by half the Inspector; it IS the shared legible
 * default now rather than a 0.68rem copy of it.
 */
export const hint = inlineMuted;

export const emptySourceChoices = style({
  display: 'grid',
  justifyItems: 'start',
  gap: '0.4rem',
});

export const choiceDivider = style({
  color: colors.textMuted,
  fontSize: '0.7rem',
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
});

export const fixedSourceHeading = style({
  margin: '0.15rem 0 0.5rem',
  padding: '0.45rem 0.55rem',
  border: `1px solid ${colors.accentMuted}`,
  borderRadius: '5px',
  background: 'rgba(14, 165, 233, 0.08)',
  color: colors.text,
  fontSize: '0.75rem',
  fontWeight: 600,
});

export const checkbox = style({
  width: '14px',
  height: '14px',
  accentColor: colors.accent,
  cursor: 'pointer',
  margin: 0,
});

export const fileBrowseRow = style({
  display: 'flex',
  alignItems: 'center',
  flexWrap: 'wrap',
  gap: '0.4rem',
  margin: '0.35rem 0 0.25rem',
});

export const selectedFile = style({
  display: 'grid',
  gap: '0.2rem',
  margin: '0.35rem 0',
  padding: '0.45rem 0.55rem',
  border: `1px solid ${colors.border}`,
  borderRadius: '5px',
  background: colors.panelMuted,
  color: colors.textMuted,
  fontSize: '0.72rem',
});

export const selectedFilePath = style({
  color: colors.text,
  overflowWrap: 'anywhere',
  fontFamily: 'ui-monospace, SFMono-Regular, Consolas, monospace',
});
