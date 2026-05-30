/**
 * Shared design tokens for the CG platform. Both apps render a dark,
 * broadcast-control aesthetic (Phase 6 §1). These are the *chrome* tokens
 * common to Designer and Runtime; app-specific accents (the Designer's sky
 * accent, the Runtime's sacred air-state colors) stay in each app's theme.
 */

/** Common page-chrome palette shared by both apps. */
export const chrome = {
  background: '#0F172A',
  panel: '#111827',
  panelMuted: '#1F2937',
  border: '#374151',
  text: '#E5E7EB',
  textMuted: '#9CA3AF',
} as const;

/** Spacing scale in pixels (4px base). */
export const spacing = {
  0: '0',
  1: '4px',
  2: '8px',
  3: '12px',
  4: '16px',
  6: '24px',
  8: '32px',
} as const;

export const radius = {
  sm: '4px',
  md: '6px',
  lg: '10px',
  full: '9999px',
} as const;

export const fontSize = {
  xs: '11px',
  sm: '12px',
  md: '13px',
  lg: '15px',
  xl: '18px',
} as const;

/**
 * Font stack. Vazirmatn first for correct Persian/Arabic shaping (loaded by
 * the host page), then Inter for Latin, then platform fallbacks including
 * Noto Sans Arabic so RTL never falls back to a non-shaping face.
 */
export const fontStack =
  "Vazirmatn, Inter, system-ui, -apple-system, 'Segoe UI', 'Noto Sans Arabic', Tahoma, sans-serif";

export const tokens = { chrome, spacing, radius, fontSize, fontStack } as const;
