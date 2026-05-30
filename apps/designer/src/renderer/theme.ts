/**
 * Centralized design tokens for the Designer renderer.
 *
 * The shared page-chrome palette now lives in `@cg/ui` (so Designer and
 * Runtime stay in lockstep, Phase 6 §1); the Designer layers its own sky
 * accent on top. The air-state rose stays out of the Designer — it's
 * sacred to the Runtime.
 */
import { chrome } from '@cg/ui';

export const colors = {
  background: chrome.background,
  panel: chrome.panel,
  panelMuted: chrome.panelMuted,
  border: chrome.border,
  text: chrome.text,
  textMuted: chrome.textMuted,
  accent: '#38BDF8',
  accentMuted: '#0EA5E9',
} as const;
