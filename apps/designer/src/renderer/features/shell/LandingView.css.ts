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

export const brandSub = style({
  fontSize: '0.82rem',
  color: colors.textMuted,
  margin: 0,
});

export const brandLockup = style({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '0.85rem',
  marginBottom: '0.8rem',
  color: colors.text,
  textDecoration: 'none',
  borderRadius: '0.55rem',
  padding: '0.35rem 0.55rem 0.35rem 0.35rem',
  transition: 'background 140ms ease, transform 140ms ease',
  selectors: {
    '&:hover': { background: colors.panel, transform: 'translateY(-1px)' },
    '&:focus-visible': { outline: `2px solid ${colors.accent}`, outlineOffset: 3 },
  },
});

export const brandLogo = style({
  width: '3.15rem',
  height: '3.15rem',
  display: 'block',
  borderRadius: '0.7rem',
  boxShadow: '0 12px 32px rgba(0, 174, 239, 0.18)',
});

export const brandName = style({
  display: 'block',
  fontSize: '1.5rem',
  lineHeight: 1,
  letterSpacing: '0.08em',
  fontWeight: 800,
});

export const brandProduct = style({
  display: 'block',
  marginTop: '0.3rem',
  color: colors.accent,
  fontSize: '0.66rem',
  fontWeight: 700,
  letterSpacing: '0.18em',
});

export const projectActions = style({
  display: 'flex',
  alignItems: 'center',
  flexWrap: 'wrap',
  gap: '0.55rem',
  alignSelf: 'flex-start',
});

/**
 * LAYOUT ONLY. The colour (accent fill, on-accent label, weight) now comes from the
 * shared `primary` Button variant. It used to re-declare the accent here on a `bare`
 * button, which (a) duplicated — and drifted from — the token (`#000` vs
 * `colors.onAccent`) and (b) meant `bare`'s neutral hover clobbered the accent, turning
 * the button grey on hover. Paired with `size="none"` so these paddings still govern.
 */
export const newButton = style({
  padding: '0.6rem 1.1rem',
  borderRadius: '0.3rem',
  fontSize: '0.85rem',
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
  transition: 'border-color 160ms ease, box-shadow 160ms ease, transform 160ms ease',
  selectors: {
    '&:hover': {
      borderColor: colors.accent,
      boxShadow: '0 18px 42px rgba(0, 0, 0, 0.28)',
      transform: 'translateY(-2px)',
    },
    '&:focus-visible': {
      borderColor: colors.accent,
      boxShadow: `0 0 0 2px ${colors.accent}`,
      outline: 'none',
    },
  },
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
});

export const cardThumbWrap = style({
  position: 'relative',
  width: '100%',
  aspectRatio: '16 / 9',
  display: 'block',
  overflow: 'hidden',
  background: '#0b0e16',
  borderBottom: `1px solid ${colors.border}`,
});

export const cardMotion = style({
  position: 'absolute',
  inset: 0,
  width: '100%',
  height: '100%',
  display: 'block',
  objectFit: 'cover',
  opacity: 0,
  transition: 'opacity 120ms ease',
  pointerEvents: 'none',
});

export const cardMotionVisible = style({ opacity: 1 });

export const motionHint = style({
  position: 'absolute',
  left: '0.65rem',
  bottom: '0.6rem',
  display: 'inline-flex',
  alignItems: 'center',
  gap: '0.35rem',
  padding: '0.3rem 0.55rem',
  borderRadius: '999px',
  background: 'rgba(5, 12, 24, 0.78)',
  border: '1px solid rgba(255, 255, 255, 0.2)',
  color: '#F8FAFC',
  fontSize: '0.62rem',
  fontWeight: 700,
  letterSpacing: '0.02em',
  backdropFilter: 'blur(8px)',
  transition: 'opacity 120ms ease, transform 120ms ease',
  pointerEvents: 'none',
});

export const motionHintHidden = style({
  opacity: 0,
  transform: 'translateY(3px)',
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

/**
 * `DESIGNER-FIX-0905` — the playout badge: what this starter does on air, as a chip in the
 * accent so five cards can be compared on the one thing they differ in.
 */
export const cardBadge = style({
  alignSelf: 'flex-start',
  fontSize: '0.68rem',
  fontWeight: 600,
  letterSpacing: '0.02em',
  padding: '0.12rem 0.45rem',
  borderRadius: '999px',
  background: colors.panelMuted,
  border: `1px solid ${colors.border}`,
  color: colors.accent,
  whiteSpace: 'nowrap',
});

export const cardDesc = style({ color: colors.textMuted, fontSize: '0.78rem', lineHeight: 1.4 });

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
