import { style } from '@vanilla-extract/css';
import { colors } from '../../theme.js';
import { ELEMENT_ROW_HEIGHT } from './metrics.js';

const ROW = `${ELEMENT_ROW_HEIGHT}px`;

export const labelCell = style({
  display: 'grid',
  gridTemplateColumns: '18px 16px 1fr auto auto',
  alignItems: 'center',
  gap: '0.3rem',
  padding: '0 0.4rem',
  background: colors.panel,
  borderRight: `1px solid ${colors.border}`,
  color: colors.textMuted,
  height: ROW,
  fontSize: '0.72rem',
  cursor: 'pointer',
  boxSizing: 'border-box',
});

// Loopic selects a layer row with a solid slate fill (#333642), not a tint.
export const rowSelected = style({ background: '#333642' });
// Label half of a selected row gets an accent left-bar on top of the fill.
export const labelSelectedAccent = style({ boxShadow: `inset 3px 0 0 ${colors.accent}` });
export const nameSelected = style({ color: colors.accent, fontWeight: 700 });

export const chevron = style({
  background: 'transparent',
  border: 'none',
  color: colors.textMuted,
  cursor: 'pointer',
  padding: 0,
  fontSize: '1.15rem',
  lineHeight: 1,
  width: '18px',
  textAlign: 'center',
});

export const typeIcon = style({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '16px',
  height: '16px',
});

export const name = style({
  color: '#bcc2e0',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  fontSize: '0.75rem',
});

export const toggleButton = style({
  background: 'transparent',
  border: 'none',
  padding: 0,
  width: '16px',
  height: '16px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  color: colors.textMuted,
  flexShrink: 0,
});

export const toggleButtonActive = style({ color: colors.text });

// Locked state — red icon on a faint red chip so a locked layer is obvious.
export const lockLocked = style({
  color: colors.danger,
  background: 'rgba(248,113,113,0.16)',
  borderRadius: '3px',
});

export const laneCell = style({
  position: 'relative',
  height: ROW,
  boxSizing: 'border-box',
  cursor: 'pointer',
});

// Lifespan bar. ROW_HEIGHT - 2 leaves 1px above and below so adjacent bars show
// a hairline gap. Bars stay fully opaque in every state — selection adds
// emphasis (see lifespanSelected) rather than fading the others. The resting
// bar is toned down slightly so the selected one has room to pop. Its colour,
// left and width are per-element and applied inline.
export const lifespan = style({
  position: 'absolute',
  top: '50%',
  height: `${ELEMENT_ROW_HEIGHT - 2}px`,
  transform: 'translateY(-50%)',
  borderRadius: '2px',
  opacity: 1,
  filter: 'brightness(0.92) saturate(0.95)',
  cursor: 'grab',
  touchAction: 'none',
});

// Selected lane bar: brighter + a crisp white inner edge, an accent ring and a
// soft glow so the selected colourful layer is unmistakable while staying solid.
export const lifespanSelected = style({
  opacity: 1,
  filter: 'brightness(1.15) saturate(1.1)',
  boxShadow: `inset 0 0 0 1px rgba(255,255,255,0.65), 0 0 0 2px ${colors.accent}, 0 0 9px rgba(56,189,248,0.6)`,
  zIndex: 1,
});

export const resizeHandle = style({
  position: 'absolute',
  top: 0,
  bottom: 0,
  width: '6px',
  cursor: 'ew-resize',
  touchAction: 'none',
});
