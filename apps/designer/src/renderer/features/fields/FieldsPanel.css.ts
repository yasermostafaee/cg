import { style } from '@vanilla-extract/css';
import { colors } from '../../theme.js';

export const block = style({
  display: 'flex',
  flexDirection: 'column',
  minWidth: 0,
});

export const list = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '0.65rem',
  minWidth: 0,
});

export const empty = style({ color: colors.textMuted, fontSize: '0.78rem', margin: '0.2rem 0' });

const columns = 'minmax(44px, 0.72fr) minmax(66px, 1.12fr) minmax(84px, 1.42fr) 48px';

export const table = style({
  minWidth: 0,
  overflow: 'hidden',
  border: `1px solid ${colors.border}`,
  borderRadius: '0.25rem',
  background: colors.panel,
});

export const tableHeader = style({
  display: 'grid',
  gridTemplateColumns: columns,
  gap: '0.3rem',
  alignItems: 'center',
  padding: '0.34rem 0.4rem',
  borderBottom: `1px solid ${colors.border}`,
  background: colors.panelMuted,
  color: colors.textMuted,
  fontSize: '0.62rem',
  fontWeight: 700,
  letterSpacing: '0.035em',
  textTransform: 'uppercase',
});

export const actionsHeader = style({ textAlign: 'end' });

/** A nested child-instance namespace group (D-025) — read-only, indented. */
export const nsGroup = style({
  paddingInlineStart: '0.5rem',
  borderLeft: `2px solid ${colors.border}`,
  display: 'flex',
  flexDirection: 'column',
  gap: '0.2rem',
  marginTop: '0.25rem',
});

export const nsTitle = style({
  color: colors.accent,
  fontSize: '0.66rem',
  fontWeight: 700,
  letterSpacing: '0.05em',
  textTransform: 'uppercase',
});

export const fieldRow = style({
  display: 'grid',
  gridTemplateColumns: columns,
  gap: '0.3rem',
  alignItems: 'center',
  padding: '0.4rem',
  minWidth: 0,
  borderBottom: `1px solid ${colors.border}`,
  selectors: {
    '&:last-child': { borderBottom: 0 },
    '&:nth-child(even)': { background: colors.panelMuted },
    '&:hover': { background: colors.menuHover },
  },
});

export const readonlyRow = style({
  display: 'grid',
  gridTemplateColumns: columns,
  gap: '0.3rem',
  alignItems: 'center',
  padding: '0.4rem',
  minWidth: 0,
  borderBottom: `1px solid ${colors.border}`,
  selectors: {
    '&:last-child': { borderBottom: 0 },
    '&:nth-child(even)': { background: colors.panelMuted },
  },
});

export const readonlyLabel = style({ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' });

export const cardId = style({
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  fontSize: '0.72rem',
  color: colors.text,
  fontWeight: 600,
});

export const cardType = style({
  fontSize: '0.7rem',
  color: colors.textMuted,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
});

export const titleCell = style({ minWidth: 0 });

export const fieldDetails = style({
  minWidth: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: '0.12rem',
});

export const cardActions = style({
  display: 'grid',
  gridTemplateColumns: '22px 22px',
  justifyContent: 'end',
  gap: '0.1rem',
});

export const bindList = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '0.2rem',
  marginTop: '0.15rem',
});

export const bindRow = style({
  display: 'flex',
  alignItems: 'center',
  gap: '0.15rem',
  minWidth: 0,
  fontSize: '0.7rem',
  color: colors.text,
});

export const bindingText = style({
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const bindEmpty = style({
  fontSize: '0.75rem',
  color: colors.textMuted,
  fontStyle: 'italic',
});
