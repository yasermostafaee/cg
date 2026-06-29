import { style } from '@vanilla-extract/css';
import { colors } from '../../theme.js';

export const wrap = style({
  flex: 1,
  minHeight: 0,
  minWidth: 0,
  display: 'flex',
  flexDirection: 'column',
  width: '100%',
  boxSizing: 'border-box',
});

export const header = style({
  display: 'flex',
  alignItems: 'center',
  gap: '0.3rem',
  padding: '0.25rem 0.4rem',
  background: colors.panel,
  border: `1px solid ${colors.border}`,
  borderRadius: '0.22rem',
  marginBottom: '0.3rem',
  fontSize: '0.74rem',
  color: colors.textMuted,
});

export const headerButton = style({
  width: '22px',
  height: '22px',
  background: 'transparent',
  color: colors.textMuted,
  border: `1px solid ${colors.border}`,
  borderRadius: '0.2rem',
  fontSize: '0.78rem',
  lineHeight: 1,
  cursor: 'pointer',
  padding: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
});

// Text variant of `headerButton` for the "100%" zoom-reset label: a self-contained
// style (not a class override) that keeps the 22px height + the shared look but
// grows in width to fit the text, so the hover background wraps the whole label
// instead of clipping it to a 22×22 square. Hover/active come from the bare
// `Control` recipe (same as the icon header buttons), so it stays consistent.
export const zoomResetButton = style({
  minWidth: '22px',
  width: 'auto',
  height: '22px',
  background: 'transparent',
  color: colors.textMuted,
  border: `1px solid ${colors.border}`,
  borderRadius: '0.2rem',
  fontSize: '0.78rem',
  lineHeight: 1,
  cursor: 'pointer',
  padding: '0 6px',
  whiteSpace: 'nowrap',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
});

export const zoomReadout = style({
  minWidth: '40px',
  textAlign: 'center',
  fontSize: '0.7rem',
  fontVariantNumeric: 'tabular-nums',
  color: colors.text,
});

export const spacer = style({ flex: 1 });

// The viewport wraps the scroll container + a NON-scrolling overlay (rulers +
// guides). The overlay must not live inside `outer` — absolutely-positioned
// children of a scroll container scroll WITH the content, so the rulers would
// slide out of view and the guide ticks would drift on scroll. Keeping them in
// this sibling layer pins them to the visible area while `rulerOrigin` tracks
// the scrolling stage.
export const viewport = style({
  position: 'relative',
  flex: 1,
  minHeight: 0,
  minWidth: 0,
  display: 'flex',
  width: '100%',
  boxSizing: 'border-box',
});

export const outer = style({
  flex: 1,
  // B-027 — the EMPTY SURROUND beyond the fixed pasteboard is a DARKER neutral (#0e1018)
  // than the pasteboard (the stage, #161927), so the workable area reads as a defined
  // rectangle instead of one flat dark field. (The frame-sized page backdrop is #3d4253,
  // drawn INSIDE the iframe as `.cg-stage`'s background-color.) Drags/nudges are clamped
  // to the pasteboard, so this tone + the stage edge ring are clarity/insurance.
  background: '#0e1018',
  border: `1px solid ${colors.border}`,
  borderRadius: '0.25rem',
  minHeight: 0,
  minWidth: 0,
  overflow: 'auto',
  // No DEFAULT scrollbars: the pasteboard overflows the viewport (the frame is fit
  // large), but the bars are hidden — the operator pans with the hand tool / wheel /
  // Ctrl-wheel zoom instead of dragging a scrollbar. Scroll stays programmatic.
  scrollbarWidth: 'none', // Firefox
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'flex-start',
  padding: '0.5rem',
  width: '100%',
  boxSizing: 'border-box',
  position: 'relative',
  // Establish a stacking context so the whole scrolling canvas subtree paints
  // BELOW the ruler/guide overlay (which is a sibling with a higher z-index).
  zIndex: 0,
  selectors: {
    '&::-webkit-scrollbar': { display: 'none' }, // Chromium / WebKit
  },
});

// Non-scrolling overlay aligned to the scroll viewport's border box (= `outer`).
// Rulers + guides draw here at viewport-relative coordinates; `overflow:hidden`
// clips anything past the visible edges. `pointerEvents:none` lets canvas
// interaction through — interactive children (ruler bars, guide handles) opt
// back in with `pointerEvents:'auto'`.
export const overlay = style({
  position: 'absolute',
  inset: 0,
  overflow: 'hidden',
  pointerEvents: 'none',
  zIndex: 1,
});

export const centerWrap = style({
  margin: 'auto',
  position: 'relative',
});

// Stage occupies the scaled footprint so layout reserves the right space and
// the overlay's hit-test math sees matching bounding-rect dimensions. Its
// width/height (scene × zoom) are applied inline. D-071 Phase B — the stage is
// the off-frame PASTEBOARD: a dark surface that the authoring iframe (sized to
// the same footprint) fills. The FRAME's checkerboard + outline + card shadow are
// drawn by the iframe's authoring `.cg-stage` (inset by `pad`); the dark margin
// here is the pasteboard the author parks shapes on (won't export).
export const stage = style({
  position: 'relative',
  backgroundColor: '#161927',
  overflow: 'hidden',
  // B-027 — a subtle 1px ring marks the pasteboard's edge against the darker surround, so
  // the boundary of the workable area is explicit. `box-shadow` (not `border`) keeps it
  // off the box model, so the absolutely-positioned iframe isn't offset.
  boxShadow: '0 0 0 1px #2b3146',
});

export const empty = style({
  color: colors.textMuted,
  fontSize: '0.9rem',
  textAlign: 'center',
  lineHeight: 1.6,
  margin: 'auto',
});

export const iframe = style({
  border: 0,
  display: 'block',
  width: '100%',
  height: '100%',
  background: 'transparent',
  pointerEvents: 'none',
});
