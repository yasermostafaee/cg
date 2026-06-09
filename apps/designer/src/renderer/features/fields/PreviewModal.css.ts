import { style } from '@vanilla-extract/css';
import { colors } from '../../theme.js';

// Fills a tall modal body: the preview stage on the left, the data form sidebar
// on the right.
export const layout = style({
  display: 'flex',
  gap: '0.7rem',
  flex: 1,
  minHeight: 0,
});

// The preview area. Letterbox is dark; the composition's own transparency
// checkerboard comes from inside the (scaled) iframe.
export const stage = style({
  position: 'relative',
  flex: 1,
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
  width: '340px',
  flexShrink: 0,
  minHeight: 0,
  display: 'flex',
  flexDirection: 'column',
});

// Data-key form — its OWN scroll region. Fields scroll here and never push the
// transport / timing controls out of view.
export const fieldsScroll = style({
  flex: 1,
  minHeight: 0,
  overflowY: 'auto',
  paddingRight: '0.2rem',
});

// Fixed, always-visible bar: the playout transport + the session timing overrides.
export const fixedBar = style({
  flexShrink: 0,
  marginTop: '0.5rem',
  paddingTop: '0.55rem',
  borderTop: `1px solid ${colors.border}`,
  display: 'flex',
  flexDirection: 'column',
  gap: '0.55rem',
});
