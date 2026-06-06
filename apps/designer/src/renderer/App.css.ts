import { style } from '@vanilla-extract/css';
import { colors } from './theme.js';

export const page = style({
  fontFamily:
    '"Exo 2", Inter, system-ui, -apple-system, "Segoe UI", Vazirmatn, "Noto Sans Arabic", sans-serif',
  color: colors.text,
  background: colors.background,
  height: '100vh',
  margin: 0,
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
});

export const studioTop = style({
  padding: '0.5rem 0.5rem 0',
});

export const shell = style({
  display: 'flex',
  flex: 1,
  minHeight: 0,
  minWidth: 0,
  padding: '0.4rem 0.5rem 0',
  gap: 0,
});

// Fixed-width side panel slot (Compositions/Assets, Inspector). Its width is a
// per-slot constant applied inline.
export const sidePanel = style({
  flexShrink: 0,
  display: 'flex',
  minHeight: 0,
});

export const centerCol = style({
  display: 'flex',
  flexDirection: 'column',
  flex: 1,
  minWidth: 0,
  minHeight: 0,
  gap: '0.4rem',
  padding: '0 0.4rem',
});

export const canvasWrap = style({
  display: 'flex',
  flexDirection: 'column',
  flex: 1,
  minHeight: 0,
  minWidth: 0,
});

// `height` (the resizable timeline height) is applied inline.
export const timelineWrap = style({
  flexShrink: 0,
  display: 'flex',
  minWidth: 0,
  overflow: 'hidden',
});

export const rail = style({
  width: '40px',
  flexShrink: 0,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: '0.3rem',
  padding: '0.2rem 0',
  // Same surface as the adjacent panels — just divided by a border.
  background: colors.panel,
  borderRight: `1px solid ${colors.border}`,
});

export const railBtn = style({
  width: '30px',
  height: '30px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'transparent',
  color: colors.textMuted,
  border: '1px solid transparent',
  borderRadius: '0.3rem',
  cursor: 'pointer',
  padding: 0,
});

// Active = a solid slate fill only (no border).
export const railBtnActive = style({
  background: '#2e3346',
  color: colors.text,
});

export const emptyStage = style({
  flex: 1,
  minWidth: 0,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '1.1rem',
  color: colors.textMuted,
});

export const emptyTitle = style({
  fontSize: '1.5rem',
  fontWeight: 700,
  color: colors.textMuted,
  letterSpacing: '0.01em',
});

export const emptyButton = style({
  background: 'transparent',
  color: colors.text,
  border: `1px solid ${colors.accentMuted}`,
  borderRadius: '0.35rem',
  padding: '0.7rem 1.4rem',
  fontSize: '0.92rem',
  cursor: 'pointer',
});

// Transient bottom-centre toast for user-facing notices.
export const toast = style({
  position: 'fixed',
  left: '50%',
  bottom: '28px',
  transform: 'translateX(-50%)',
  maxWidth: '460px',
  display: 'flex',
  alignItems: 'flex-start',
  gap: '0.6rem',
  background: '#1c1f2d',
  color: '#e5e7f3',
  border: '1px solid #f87171',
  borderRadius: '0.4rem',
  padding: '0.6rem 0.7rem 0.6rem 0.9rem',
  fontSize: '0.78rem',
  lineHeight: 1.4,
  boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
  zIndex: 5000,
});

export const toastClose = style({
  flexShrink: 0,
  width: '18px',
  height: '18px',
  lineHeight: '16px',
  textAlign: 'center',
  background: 'transparent',
  color: '#fca5a5',
  border: 'none',
  borderRadius: '0.2rem',
  fontSize: '0.95rem',
  cursor: 'pointer',
  padding: 0,
});
