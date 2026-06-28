import { style } from '@vanilla-extract/css';
import { colors } from '../theme.js';

/**
 * D-118 — the design-system multi-line text input. Same panel-input look as the single-line
 * inspector inputs (token colours, border, radius, padding, font) but multi-line + vertically
 * resizable, so long item text (and explicit `\n` line breaks) is comfortable to author. A native
 * `<textarea>` inserts a newline on Enter (it does NOT submit/blur), which is exactly the behavior
 * D-118 wants. Per-site `className` EXTENDS the layout (flex/width), never the look.
 */
export const textarea = style({
  display: 'block',
  width: '100%',
  boxSizing: 'border-box',
  minHeight: '2.6rem', // ~2–3 lines: comfortable, not a tiny one-line box (no auto-grow needed)
  maxHeight: '12rem',
  resize: 'vertical',
  overflowY: 'auto',
  background: colors.panelMuted,
  color: colors.text,
  border: `1px solid ${colors.border}`,
  borderRadius: '0.2rem',
  padding: '0.25rem 0.4rem',
  fontSize: '0.74rem',
  fontFamily: 'inherit', // shaping-capable UI font (Persian/RTL), not a monospace textarea default
  lineHeight: 1.4,
  whiteSpace: 'pre-wrap', // honor the authored `\n` while editing
  outline: 'none',
  selectors: {
    '&:focus-visible': { borderColor: colors.accent },
  },
});
