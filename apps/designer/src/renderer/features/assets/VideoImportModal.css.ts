import { keyframes, style } from '@vanilla-extract/css';
import { colors } from '../../theme.js';

/** D-128 — the video import modal: crop preview, fps notice, convert progress. */

export const previewBox = style({
  position: 'relative',
  display: 'inline-block',
  lineHeight: 0,
  border: `1px solid ${colors.border}`,
  borderRadius: '0.25rem',
  overflow: 'hidden',
  // alpha sources render over a checkerboard so transparency reads as such
  background: 'repeating-conic-gradient(#3a3e55 0% 25%, #2a2d42 0% 50%) 0 0 / 16px 16px',
  alignSelf: 'center',
});

export const previewImg = style({
  display: 'block',
  maxWidth: '100%',
  userSelect: 'none',
});

export const cropRect = style({
  position: 'absolute',
  border: `1.5px solid ${colors.accent}`,
  boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.55)',
  cursor: 'move',
  touchAction: 'none',
});

export const cropHandle = style({
  position: 'absolute',
  width: 14,
  height: 14,
  margin: -7,
  background: colors.accent,
  border: `2px solid ${colors.panel}`,
  borderRadius: 3,
  touchAction: 'none',
});

export const fieldsRow = style({
  display: 'flex',
  gap: '0.5rem',
  alignItems: 'center',
  flexWrap: 'wrap',
});

export const fieldLabel = style({
  color: colors.textMuted,
  fontSize: '0.8rem',
  marginInlineEnd: 2,
});

export const numInput = style({
  width: '4.5em',
  background: colors.panelMuted,
  color: colors.text,
  border: `1px solid ${colors.border}`,
  borderRadius: 4,
  padding: '2px 6px',
  fontSize: 12,
});

export const body = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '0.75rem',
});

export const meta = style({
  color: colors.textMuted,
  // Message-surface size — 0.9rem app-wide (owner call, 2026-07-22).
  fontSize: '0.9rem',
});

export const progressTrack = style({
  height: 8,
  borderRadius: 4,
  background: colors.panelMuted,
  border: `1px solid ${colors.border}`,
  overflow: 'hidden',
});

export const progressFill = style({
  height: '100%',
  background: colors.accent,
  transition: 'width 120ms linear',
});

/** The ffmpeg log tail shown under a probe failure — the WHY, not a dead end. */
export const logTail = style({
  margin: 0,
  padding: '0.5rem',
  maxHeight: '9rem',
  overflowY: 'auto',
  background: colors.panelMuted,
  border: `1px solid ${colors.border}`,
  borderRadius: 4,
  color: colors.textMuted,
  fontFamily: 'monospace',
  fontSize: '0.75rem',
  whiteSpace: 'pre-wrap',
  direction: 'ltr', // ffmpeg output is LTR regardless of app locale
});

const spin = keyframes({ to: { transform: 'rotate(360deg)' } });

export const spinner = style({
  display: 'inline-block',
  width: 14,
  height: 14,
  border: `2px solid ${colors.border}`,
  borderTopColor: colors.accent,
  borderRadius: '50%',
  animation: `${spin} 0.8s linear infinite`,
  verticalAlign: '-2px',
  marginInlineEnd: 6,
});
