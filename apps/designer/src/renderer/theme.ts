/**
 * Centralized design tokens for the Designer renderer.
 *
 * Mirrors the Runtime palette (Phase 6 §1) but is its own copy — the
 * Designer doesn't share the renderer-only colors with the Runtime,
 * and the air-state colors specifically MUST NOT bleed into the
 * Designer's UI (Phase 6 §1: "the on-air rose is sacred").
 */

export const colors = {
  background: '#0F172A',
  panel: '#111827',
  panelMuted: '#1F2937',
  border: '#374151',
  text: '#E5E7EB',
  textMuted: '#9CA3AF',
  accent: '#38BDF8',
  accentMuted: '#0EA5E9',
} as const;
