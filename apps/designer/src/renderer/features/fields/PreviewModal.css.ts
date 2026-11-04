import { globalStyle, style } from '@vanilla-extract/css';
import { colors } from '../../theme.js';

// Fills a tall modal body: the preview stage on the left, the data form sidebar
// on the right.
export const layout = style({
  display: 'flex',
  gap: '0.7rem',
  flex: 1,
  width: '100%',
  maxWidth: '100%',
  minHeight: 0,
  minWidth: 0,
  overflow: 'hidden',
});

// Picture column: the stable frame/time readout sits immediately above the checkerboard stage.
export const stageColumn = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '0.45rem',
  flex: 1,
  minWidth: 0,
  minHeight: 0,
});

// The preview area. Letterbox is dark; the composition's own transparency
// checkerboard comes from inside the (scaled) iframe.
export const stage = style({
  position: 'relative',
  flex: 1,
  minHeight: 0,
  minWidth: 0,
  overflow: 'hidden',
  borderRadius: '0.3rem',
  border: `1px solid ${colors.border}`,
  background: colors.background,
});

// Native-resolution iframe, centred and scaled to fit the stage.
export const stageFrame = style({
  position: 'absolute',
  top: '50%',
  left: '50%',
  border: 0,
  display: 'block',
  background: 'transparent',
  transformOrigin: 'center',
});

// The sidebar is split so the (potentially long) data form scrolls on its own
// while the transport + timing overrides stay pinned and always reachable.
export const sidebar = style({
  width: 'clamp(390px, 31vw, 540px)',
  flexShrink: 0,
  minHeight: 0,
  minWidth: 0,
  overflow: 'hidden',
  display: 'flex',
  flexDirection: 'column',
});

// Data-key form — its OWN scroll region. Fields scroll here and never push the
// transport / timing controls out of view.
export const fieldsScroll = style({
  flex: 1,
  minHeight: 0,
  overflowY: 'auto',
  overflowX: 'auto',
  padding: '0.55rem 0.25rem 0 0',
  borderTop: `1px solid ${colors.border}`,
});

// Fixed, always-visible bar: the playout transport (pinned) + the session timing overrides.
// D-102 Phase 1 — per-element ticker rows can make the timing section tall (one row per ticker),
// so the bar is capped and its timing region scrolls; the transport stays reachable above it.
export const fixedBar = style({
  flexShrink: 0,
  minHeight: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: '0.55rem',
  paddingBottom: '0.55rem',
});

// D-102 Phase 1 — the timing overrides scroll within the capped fixed bar (the transport above
// stays pinned), so a scope with many tickers can't push controls out of the modal.
export const timingScroll = style({
  maxHeight: '30vh',
  minHeight: 0,
  overflowY: 'auto',
  paddingTop: '0.5rem',
});

export const advanced = style({
  borderTop: `1px solid ${colors.border}`,
  color: colors.textMuted,
  fontSize: '0.72rem',
});

globalStyle(`${advanced} > summary`, {
  cursor: 'pointer',
  paddingTop: '0.5rem',
  fontSize: '0.76rem',
  fontWeight: 700,
  color: colors.text,
  userSelect: 'none',
});
