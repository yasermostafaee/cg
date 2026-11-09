import { style } from '@vanilla-extract/css';
import { colors } from '../../theme.js';

// Full-bleed input overlay. `cursor` is per-tool and applied inline.
export const layer = style({
  position: 'absolute',
  inset: 0,
  pointerEvents: 'auto',
});

export const bindTargetLayer = style({
  position: 'absolute',
  inset: 0,
  width: '100%',
  height: '100%',
  overflow: 'visible',
  pointerEvents: 'none',
  zIndex: 6,
});

export const toolHint = style({
  position: 'absolute',
  top: '8px',
  right: '8px',
  padding: '0.2rem 0.5rem',
  background: 'rgba(0, 0, 0, 0.6)',
  color: colors.textMuted,
  fontSize: '0.75rem',
  borderRadius: '0.25rem',
  pointerEvents: 'none',
  letterSpacing: '0.05em',
});

export const maskEditor = style({
  position: 'absolute',
  zIndex: 7,
  border: `1px solid ${colors.accent}`,
  boxShadow: '0 0 0 1px rgba(0, 0, 0, 0.65)',
  cursor: 'move',
  touchAction: 'none',
});

export const maskEditorHandle = style({
  position: 'absolute',
  width: '10px',
  height: '10px',
  transform: 'translate(-50%, -50%)',
  border: `1px solid ${colors.accent}`,
  background: colors.onAccent,
});

// Snap guide lines. Their position (left/top) and orientation extent are
// per-guide and applied inline; this holds the shared chrome.
export const snapGuide = style({
  position: 'absolute',
  background: '#FF3DAE',
  pointerEvents: 'none',
  zIndex: 5,
});
