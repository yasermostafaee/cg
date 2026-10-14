import { style } from '@vanilla-extract/css';
import { colors } from '../../theme.js';

/*
 * `D-163` — a book's pages: the Inspector's compact card and the Pages manager. The Inspector
 * says how many pages there are and shows the first few; every page is seen and arranged in the
 * manager, so a 300-page book costs the Inspector the same few lines as a 3-page one.
 */

// ── The Inspector's card ──────────────────────────────────────────────────────────────────────

export const summary = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '0.4rem',
});

export const strip = style({
  display: 'flex',
  alignItems: 'center',
  gap: '0.25rem',
});

export const stripThumb = style({
  width: '3.6rem',
  aspectRatio: '16 / 9',
  borderRadius: '0.2rem',
  overflow: 'hidden',
  background: colors.background,
  border: `1px solid ${colors.border}`,
  flex: 'none',
});

export const more = style({
  color: colors.textMuted,
  fontSize: '0.7rem',
  fontVariantNumeric: 'tabular-nums',
  paddingInlineStart: '0.2rem',
});

// ── The Pages manager ─────────────────────────────────────────────────────────────────────────

export const toolbar = style({
  display: 'flex',
  alignItems: 'center',
  flexWrap: 'wrap',
  gap: '0.4rem',
  paddingBottom: '0.6rem',
  borderBottom: `1px solid ${colors.border}`,
});

export const count = style({
  color: colors.text,
  fontSize: '0.8rem',
  fontWeight: 700,
  fontVariantNumeric: 'tabular-nums',
});

export const chosen = style({
  color: colors.textMuted,
  fontSize: '0.72rem',
  fontVariantNumeric: 'tabular-nums',
});

export const spacer = style({ flex: 1 });

export const viewGroup = style({
  display: 'flex',
  gap: '0.15rem',
});

export const listView = style({
  paddingTop: '0.75rem',
});

export const grid = style({
  listStyle: 'none',
  margin: 0,
  padding: '0.75rem 0 0',
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
  gap: '0.6rem',
});

export const card = style({
  position: 'relative',
  display: 'flex',
  flexDirection: 'column',
  gap: '0.25rem',
  padding: '0.3rem',
  borderRadius: '0.35rem',
  background: colors.panelMuted,
  border: `1px solid ${colors.border}`,
  cursor: 'grab',
});

export const cardSelected = style({
  borderColor: colors.accent,
  boxShadow: `0 0 0 1px ${colors.accent}`,
});

export const cardDragging = style({
  opacity: 0.45,
});

/** Where a dragged page will land: a bar at the card's leading or trailing edge. */
const dropBar = {
  content: '""',
  position: 'absolute',
  top: 0,
  bottom: 0,
  width: '3px',
  borderRadius: '2px',
  background: colors.accent,
} as const;

export const dropBefore = style({
  selectors: { '&::before': { ...dropBar, left: '-0.4rem' } },
});

export const dropAfter = style({
  selectors: { '&::after': { ...dropBar, right: '-0.4rem' } },
});

/** A card's 16:9 box: a picture's thumbnail, or a text / composition item's own editor. */
export const thumbBox = style({
  position: 'relative',
  width: '100%',
  aspectRatio: '16 / 9',
  borderRadius: '0.25rem',
  overflow: 'hidden',
  background: colors.background,
});

/** A text or composition item: its editor below the number, filling the box. */
export const itemBox = style({
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'center',
  gap: '0.3rem',
  padding: '1.6rem 0.3rem 0.3rem',
  boxSizing: 'border-box',
});

export const cardText = style({
  flex: 1,
  width: '100%',
  minHeight: 0,
  resize: 'none',
  fontSize: '0.72rem',
  boxSizing: 'border-box',
});

/** The thumbnail is the picture card's select toggle (a `bare` Control brings no chrome). */
export const thumbButton = style({
  display: 'block',
  width: '100%',
  height: '100%',
  padding: 0,
  border: 'none',
  background: 'transparent',
  cursor: 'pointer',
});

/** The number is every card's select toggle too. */
export const badgeButton = style({
  border: 'none',
  cursor: 'pointer',
});

/** The manager's add row, under its toolbar. */
export const addBar = style({
  paddingTop: '0.5rem',
});

export const addButtons = style({
  display: 'flex',
  flexWrap: 'wrap',
  gap: '0.3rem',
});

export const thumbImg = style({
  display: 'block',
  width: '100%',
  height: '100%',
  objectFit: 'contain',
});

/** A text or composition item in a mixed sequence: its words where a picture would be. */
export const thumbText = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  height: '100%',
  padding: '0.4rem',
  boxSizing: 'border-box',
  color: colors.text,
  fontSize: '0.72rem',
  textAlign: 'center',
  overflow: 'hidden',
});

export const badge = style({
  position: 'absolute',
  top: '0.25rem',
  left: '0.25rem',
  minWidth: '1.3rem',
  padding: '0 0.3rem',
  borderRadius: '0.6rem',
  background: colors.panel,
  color: colors.text,
  fontSize: '0.66rem',
  fontWeight: 700,
  lineHeight: '1.2rem',
  textAlign: 'center',
  fontVariantNumeric: 'tabular-nums',
});

export const badgeSelected = style({
  background: colors.accent,
  color: colors.onAccent,
});

export const cardFoot = style({
  display: 'flex',
  alignItems: 'center',
  gap: '0.1rem',
});

export const cardName = style({
  flex: 1,
  minWidth: 0,
  color: colors.text,
  fontSize: '0.7rem',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const empty = style({
  color: colors.textMuted,
  fontSize: '0.8rem',
  textAlign: 'center',
  padding: '3rem 0',
});
