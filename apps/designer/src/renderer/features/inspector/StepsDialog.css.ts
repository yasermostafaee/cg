import { style } from '@vanilla-extract/css';
import { colors } from '../../theme.js';

/**
 * `DELTA-RUN-NEXT-VERSION-01-H` — the Steps dialog's LAYOUT only: the header row, the rehearse
 * strip, the two columns (they wrap into one at 200 % text), the step list, the one-line editor rows
 * and the changes table. Every control inside is a shared primitive with its own look.
 */

export const head = style({
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: '0.6rem',
});

export const clockName = style({ fontWeight: 700, minWidth: 0 });

export const grow = style({ flex: '1 1 12rem', minWidth: 0 });

export const strip = style({
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: '0.25rem',
});

export const stripLabel = style({ color: colors.textMuted, fontSize: '0.72rem' });

export const columns = style({
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'flex-start',
  gap: '0.9rem',
});

export const listColumn = style({
  flex: '1 1 13rem',
  minWidth: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: '0.4rem',
});

export const list = style({
  listStyle: 'none',
  margin: 0,
  padding: '0.15rem',
  display: 'flex',
  flexDirection: 'column',
  gap: '2px',
  border: `1px solid ${colors.border}`,
  borderRadius: '0.25rem',
});

export const row = style({
  display: 'flex',
  alignItems: 'center',
  gap: '0.2rem',
  padding: '0.1rem 0.2rem',
  borderRadius: '0.2rem',
  selectors: {
    '&[data-selected="true"]': { background: colors.panelMuted },
    '&[data-drop="true"]': { boxShadow: `inset 0 2px 0 ${colors.textMuted}` },
  },
});

/** The space a pinned row's (absent) drag handle would take, so the names line up. */
export const pin = style({ width: '22px', flexShrink: 0 });

export const rowMain = style({
  flex: 1,
  minWidth: 0,
  display: 'flex',
  alignItems: 'baseline',
  gap: '0.4rem',
  overflow: 'hidden',
  textAlign: 'start',
  padding: '0.2rem 0.25rem',
});

export const meta = style({
  color: colors.textMuted,
  fontSize: '0.72rem',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
});

export const addRow = style({ display: 'flex', flexWrap: 'wrap', gap: '0.3rem' });

export const editor = style({
  flex: '2 1 22rem',
  minWidth: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: '0.35rem',
});

export const line = style({
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: '0.35rem',
});

export const narrow = style({ flex: '0 1 8rem', minWidth: '5rem' });

export const tableHead = style({
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '0.5rem',
  marginTop: '0.3rem',
  fontWeight: 600,
});

export const table = style({
  width: '100%',
  tableLayout: 'fixed',
  borderCollapse: 'collapse',
  fontSize: '0.74rem',
});

export const th = style({
  textAlign: 'start',
  color: colors.textMuted,
  fontWeight: 600,
  padding: '0.2rem 0.25rem',
  borderBottom: `1px solid ${colors.border}`,
});

export const actionsCol = style({ width: '2.2rem' });

export const td = style({ padding: '0.1rem 0.25rem', verticalAlign: 'middle', minWidth: 0 });

export const notice = style({
  display: 'flex',
  alignItems: 'center',
  gap: '0.5rem',
  padding: '0.3rem 0.5rem',
  border: `1px solid ${colors.border}`,
  borderRadius: '0.25rem',
  background: colors.panelMuted,
  fontSize: '0.78rem',
});

/** The Inspector's summary: one line per step. */
export const summary = style({
  listStyle: 'none',
  margin: '0.2rem 0',
  padding: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: '0.15rem',
  fontSize: '0.74rem',
});

export const summaryLine = style({
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: '0.3rem',
  minWidth: 0,
});

export const swatch = style({
  display: 'inline-block',
  width: '10px',
  height: '10px',
  border: `1px solid ${colors.border}`,
  verticalAlign: 'middle',
  marginInlineEnd: '0.25rem',
});
