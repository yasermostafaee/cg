/**
 * Centralized design tokens for the Designer renderer.
 *
 * The shared page-chrome palette lives in `@cg/ui`; the Designer layers
 * its own slightly darker, bluer chrome on top so the authoring shell
 * reads closer to a film/timeline editor (B-001) without bleeding into
 * the Runtime, which keeps the default `@cg/ui` chrome. The air-state
 * rose stays out of the Designer — it's sacred to the Runtime.
 */
import { chrome } from '@cg/ui';

const _sharedFallback = {
  text: chrome.text,
  textMuted: chrome.textMuted,
} as const;

export const colors = {
  background: '#1c1f31',
  panel: '#272b40',
  panelMuted: '#24273d',
  border: '#2e3247',
  text: _sharedFallback.text,
  textMuted: _sharedFallback.textMuted,
  accent: '#38BDF8',
  accentMuted: '#0EA5E9',
  /** Warning/locked accent — a soft red that reads on the dark chrome. */
  danger: '#F87171',
  /** Border colour used for unselected keyframe diamonds (D-009). */
  keyframeBorder: '#676f8f',
} as const;
