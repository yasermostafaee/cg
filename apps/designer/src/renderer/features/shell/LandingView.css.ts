import { style } from '@vanilla-extract/css';
import { colors } from '../../theme.js';

export const page = style({
  width: '100%',
  height: '100%',
  minHeight: 0,
  overflow: 'auto',
  background: colors.background,
  color: colors.text,
  boxSizing: 'border-box',
  padding: '2.5rem 3rem',
  display: 'flex',
  flexDirection: 'column',
  gap: '1.5rem',
  fontSize: '0.85rem',
});

export const brand = style({
  display: 'flex',
  alignItems: 'center',
  gap: '0.6rem',
  marginBottom: '0.5rem',
});

export const brandTitle = style({
  fontSize: '1.6rem',
  fontWeight: 700,
  margin: 0,
  letterSpacing: '0.02em',
});

export const brandSub = style({
  fontSize: '0.82rem',
  color: colors.textMuted,
  margin: 0,
});

export const newButton = style({
  background: colors.accent,
  color: '#000',
  border: 'none',
  padding: '0.6rem 1.1rem',
  borderRadius: '0.3rem',
  fontWeight: 700,
  fontSize: '0.85rem',
  cursor: 'pointer',
  alignSelf: 'flex-start',
});

export const sectionTitle = style({
  fontSize: '0.7rem',
  color: colors.textMuted,
  letterSpacing: '0.08em',
  fontWeight: 700,
  margin: '0.8rem 0 0.4rem',
});

export const grid = style({
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
  gap: '0.9rem',
});

export const card = style({
  position: 'relative',
  background: colors.panel,
  border: `1px solid ${colors.border}`,
  borderRadius: '0.5rem',
  padding: 0,
  cursor: 'pointer',
  textAlign: 'left',
  color: colors.text,
  display: 'flex',
  flexDirection: 'column',
  fontSize: '0.85rem',
  overflow: 'hidden',
});

export const newBadge = style({
  position: 'absolute',
  top: '0.55rem',
  right: '0.55rem',
  zIndex: 2,
  padding: '0.12rem 0.5rem',
  borderRadius: '999px',
  background: 'linear-gradient(105deg, #38BDF8, #8B5CF6)',
  color: '#06121F',
  fontSize: '0.62rem',
  fontWeight: 800,
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
  boxShadow: '0 2px 10px rgba(56,189,248,0.45)',
  pointerEvents: 'none',
});

export const cardThumb = style({
  width: '100%',
  aspectRatio: '16 / 9',
  objectFit: 'cover',
  display: 'block',
  background: '#0b0e16',
  borderBottom: `1px solid ${colors.border}`,
});

export const cardThumbFallback = style({
  width: '100%',
  aspectRatio: '16 / 9',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'linear-gradient(135deg, #1b2740, #0b1120)',
  color: colors.textMuted,
  fontSize: '0.72rem',
  letterSpacing: '0.1em',
  borderBottom: `1px solid ${colors.border}`,
});

export const cardBody = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '0.25rem',
  padding: '0.7rem 0.85rem 0.85rem',
});

export const cardLabel = style({ fontWeight: 700 });

export const cardDesc = style({ color: colors.textMuted, fontSize: '0.76rem', lineHeight: 1.35 });

// D-093 — a Recent row is the open button (the card) plus a sibling remove (×) control.
export const recentRowWrap = style({
  display: 'flex',
  alignItems: 'stretch',
  gap: '0.4rem',
});

export const recentRow = style({
  flexGrow: 1,
  minWidth: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  background: colors.panel,
  border: `1px solid ${colors.border}`,
  borderRadius: '0.3rem',
  padding: '0.6rem 0.9rem',
  cursor: 'pointer',
  color: colors.text,
  fontSize: '0.85rem',
});

// D-093 — "Remove from recent" (a list action, NOT a destructive file action). Muted until
// the row is hovered/focused so it never reads as primary or invites a mis-tap as Open.
export const recentRemove = style({
  flexShrink: 0,
  opacity: 0.35,
  fontSize: '1.05rem',
  lineHeight: 1,
  padding: '0 0.6rem',
  color: colors.textMuted,
  selectors: {
    [`${recentRowWrap}:hover &`]: { opacity: 1 },
    '&:hover': { opacity: 1, color: colors.danger },
  },
});

export const clearRecent = style({
  alignSelf: 'flex-start',
  marginTop: '0.3rem',
  color: colors.textMuted,
  fontSize: '0.76rem',
  selectors: {
    '&:hover': { color: colors.danger },
  },
});

export const recentMeta = style({
  color: colors.textMuted,
  fontSize: '0.74rem',
});

export const empty = style({
  color: colors.textMuted,
  fontSize: '0.82rem',
  padding: '0.5rem 0',
});
