import { style } from '@vanilla-extract/css';
import { colors } from '../../theme.js';

// Scene + group-header rows are this tall in BOTH columns. Sharing one constant
// keeps each row's label and lane halves the exact same height so the two
// scroll columns never drift apart. (Matches the track-row height.)
const SCENE_ROW = '22px';

export const dock = style({
  background: colors.panel,
  borderTop: `1px solid ${colors.border}`,
  display: 'flex',
  flexDirection: 'column',
  fontSize: '0.72rem',
  flex: 1,
  minHeight: 0,
  minWidth: 0,
  width: '100%',
  paddingTop: '16px',
  boxSizing: 'border-box',
});

export const body = style({
  flex: 1,
  display: 'flex',
  minHeight: 0,
  minWidth: 0,
  overflow: 'hidden',
});

// `width` (the label column width) is applied inline from LABEL_COL_PX.
export const leftCol = style({
  flex: '0 0 auto',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  borderRight: `1px solid ${colors.border}`,
  background: colors.panel,
});

export const leftHeader = style({
  background: 'transparent',
  borderBottom: `1px solid ${colors.border}`,
  color: colors.textMuted,
  fontVariantNumeric: 'tabular-nums',
  padding: '0 0.6rem',
  height: '34px',
  display: 'flex',
  alignItems: 'baseline',
  gap: '0.15rem',
  boxSizing: 'border-box',
});

export const leftBody = style({
  flex: 1,
  minHeight: 0,
  overflow: 'hidden',
});

// Scrolled by translateY (mirroring the lane body's scrollTop), applied
// imperatively — see TimelineDock's syncScroll for why a transform beats
// scrollTop here.
export const leftBodyInner = style({
  willChange: 'transform',
  // D-047 — anchor the absolutely-positioned reorder drop indicator.
  position: 'relative',
});

// D-047 — the horizontal drop-indicator line shown while dragging a layer row to
// reorder it. Positioned at the target gap (top set inline); accent-colored, with a
// small dot on the left so the insertion point reads at a glance. Pointer-inert.
export const reorderIndicator = style({
  position: 'absolute',
  left: 0,
  right: 0,
  height: 0,
  borderTop: `2px solid ${colors.accent}`,
  pointerEvents: 'none',
  zIndex: 5,
  '::before': {
    content: '""',
    position: 'absolute',
    left: '2px',
    top: '-3px',
    width: '5px',
    height: '5px',
    borderRadius: '50%',
    background: colors.accent,
  },
});

export const rightCol = style({
  flex: 1,
  minWidth: 0,
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
});

export const topScroll = style({
  overflowX: 'hidden',
  overflowY: 'hidden',
  height: '34px',
  borderBottom: `1px solid ${colors.border}`,
  background: '#32364b',
  // Reserve the same gutter as the body so the ruler's inner width matches the
  // lane body's inner width — keeps per-frame grid lines aligned across regions.
  scrollbarGutter: 'stable',
});

export const rightBody = style({
  flex: 1,
  minHeight: 0,
  overflow: 'auto',
  scrollbarGutter: 'stable',
});

// `width` (zoom × 100%) is applied inline.
export const zoomInner = style({
  minWidth: '100%',
});

// `width`, `backgroundColor` and the grid `backgroundImage` are applied inline.
export const rightBodyInner = style({
  position: 'relative',
  minWidth: '100%',
  // Fill the whole body height even with no layers, so the frame grid and the
  // playhead run to the bottom of the timeline (not just behind the rows).
  minHeight: '100%',
});

// `left` (the playhead frame position) is applied inline.
export const bodyPlayhead = style({
  position: 'absolute',
  top: 0,
  bottom: 0,
  width: 0,
  borderLeft: `1.5px solid ${colors.accent}`,
  pointerEvents: 'none',
  // D-078 — above the pinned scene lane (a sticky z-index:3 stacking context) so the
  // playhead/index line stays visible ON the scene row, not hidden under it. It is
  // pointer-events:none, so drawing over the scene lane's resize handle / out-point
  // marker doesn't block their clicks.
  zIndex: 6,
});

// Top-of-body "Scene" row — a single bar covering the active scene range.
// D-078 — pinned at the top of the layers panel so the element rows scroll UNDER it.
// LEFT: `leftBodyInner` is scrolled by an imperative `translateY(-scrollTop)`, so the
// scene label can't use `position: sticky`; instead it counteracts the parent transform
// with its own `translateY(+scrollTop)` (set in `syncScroll`). The opaque background +
// z-index keep the element rows from showing through as they pass under it.
export const sceneLabel = style({
  height: SCENE_ROW,
  boxSizing: 'border-box',
  background: colors.panel,
  position: 'relative',
  zIndex: 3,
  willChange: 'transform',
});

// RIGHT: the lanes live in a NATIVE scroll container (`rightBody`), so `position: sticky`
// pins the scene lane vertically while it still scrolls horizontally with the lanes (it
// spans the zoomed width). The solid background (applied inline as TIMELINE_BG) + z-index
// keep the element lanes from showing through.
export const sceneLane = style({
  position: 'sticky',
  top: 0,
  zIndex: 3,
  height: SCENE_ROW,
  boxSizing: 'border-box',
});

// `width` (the active range) is applied inline; `right` is overridden inline.
export const sceneBar = style({
  position: 'absolute',
  top: '50%',
  left: 0,
  right: 0,
  height: '20px',
  transform: 'translateY(-50%)',
  background: colors.accent,
  opacity: 0.45,
  borderRadius: '2px',
  pointerEvents: 'none',
});

// `left` and the centring `transform` are applied inline.
export const sceneBarHandle = style({
  position: 'absolute',
  top: '50%',
  width: '8px',
  height: '20px',
  transform: 'translateY(-50%)',
  background: colors.accent,
  borderRadius: '2px',
  cursor: 'ew-resize',
  touchAction: 'none',
  pointerEvents: 'auto',
  zIndex: 4,
});

// Dimmed overlay over the trailing frames [activeOut .. total]. `left` inline.
export const inactiveTail = style({
  position: 'absolute',
  top: 0,
  bottom: 0,
  right: 0,
  background: 'rgba(12, 14, 22, 0.55)',
  borderLeft: `1px dashed ${colors.accentMuted}`,
  pointerEvents: 'none',
  // Above the lifespan bars (incl. a selected bar's zIndex:1) so the inactive
  // region dims the selected layer too, but below the playhead/handle.
  zIndex: 2,
});

export const empty = style({
  padding: '0.6rem',
  color: colors.textMuted,
  fontSize: '0.72rem',
  textAlign: 'center',
});

export const groupHeaderLabel = style({
  color: '#bcc2e0',
  fontSize: '0.7rem',
  fontWeight: 600,
  letterSpacing: '0.04em',
  padding: '0 0.6rem 0 1.4rem',
  background: colors.panel,
  borderRight: `1px solid ${colors.border}`,
  height: SCENE_ROW,
  display: 'flex',
  alignItems: 'center',
  gap: '0.3rem',
  boxSizing: 'border-box',
});

export const groupHeaderLane = style({
  height: SCENE_ROW,
  boxSizing: 'border-box',
});

export const groupChevron = style({
  background: 'transparent',
  border: 'none',
  color: colors.textMuted,
  cursor: 'pointer',
  padding: 0,
  fontSize: '1rem',
  lineHeight: 1,
  width: '16px',
  textAlign: 'center',
});

// D-020 — the single draggable `outPoint` marker inside the scene lane (amber):
// where the intro ends, the hold sits, and the exit begins (Loopic-style).
export const phaseMarkerOut = style({
  position: 'absolute',
  top: 0,
  bottom: 0,
  width: '4px',
  transform: 'translateX(-50%)',
  cursor: 'ew-resize',
  touchAction: 'none',
  pointerEvents: 'auto',
  zIndex: 5,
  opacity: 0.9,
  borderRadius: '2px',
  background: '#ffae57',
});
