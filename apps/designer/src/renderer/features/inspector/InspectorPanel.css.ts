import { style } from '@vanilla-extract/css';
import { colors } from '../../theme.js';

export const panel = style({
  background: colors.panel,
  border: `1px solid ${colors.border}`,
  borderRadius: '0.25rem',
  padding: '0.6rem',
  display: 'flex',
  flexDirection: 'column',
  gap: '0.3rem',
  minHeight: 0,
  overflowY: 'auto',
  fontSize: '0.74rem',
  width: '100%',
  boxSizing: 'border-box',
});

export const heading = style({
  fontSize: '0.66rem',
  fontWeight: 700,
  color: colors.textMuted,
  letterSpacing: '0.06em',
  margin: '0.35rem 0 0.15rem',
  paddingTop: '0.35rem',
  borderTop: `1px solid ${colors.border}`,
});

export const headingFirst = style({
  fontSize: '0.7rem',
  fontWeight: 700,
  color: colors.textMuted,
  letterSpacing: '0.06em',
  margin: 0,
});

export const row = style({
  display: 'grid',
  gridTemplateColumns: '90px 1fr',
  gap: '0.4rem',
  fontSize: '0.72rem',
  padding: '0.1rem 0',
});

export const label = style({ color: colors.textMuted, fontSize: '0.7rem' });

export const value = style({
  color: colors.text,
  fontWeight: 500,
  fontVariantNumeric: 'tabular-nums',
});

export const empty = style({ color: colors.textMuted, fontSize: '0.74rem' });

export const bindList = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '0.2rem',
});

export const bindRow = style({
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: '0.4rem',
});

export const bindRemove = style({
  background: 'transparent',
  color: colors.textMuted,
  border: `1px solid ${colors.border}`,
  padding: '0.08rem 0.3rem',
  borderRadius: '0.18rem',
  cursor: 'pointer',
  fontSize: '0.68rem',
});

export const keyRow = style({
  display: 'grid',
  gridTemplateColumns: '36px 1fr',
  gap: '0.4rem',
  alignItems: 'center',
  padding: '0.15rem 0 0.35rem',
});

export const keyLabel = style({
  color: colors.textMuted,
  fontSize: '0.66rem',
  fontWeight: 700,
  letterSpacing: '0.06em',
});

export const keyInput = style({
  background: colors.panelMuted,
  color: colors.text,
  border: `1px solid ${colors.border}`,
  padding: '0.15rem 0.35rem',
  borderRadius: '0.18rem',
  fontSize: '0.72rem',
  width: '100%',
  boxSizing: 'border-box',
});

// Shared numeric/select chip for the composition (document) rows. `width` is
// overridden inline on the frame-rate select (auto).
export const docNum = style({
  background: colors.panelMuted,
  color: colors.text,
  border: `1px solid ${colors.border}`,
  borderRadius: '0.18rem',
  padding: '0.1rem 0.35rem',
  fontSize: '0.72rem',
  width: '64px',
  fontVariantNumeric: 'tabular-nums',
  boxSizing: 'border-box',
});
