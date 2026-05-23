/**
 * Centralized design tokens for the Runtime renderer. Mirrors Phase 6 §1.
 *
 * The **air-state colors are sacred** — they're used in the stack rows + the
 * status bar's on-air indicator, and **nowhere else**. Decorative red is
 * forbidden anywhere in the UI to avoid confusion with "ON AIR".
 */

import type { StackItemStatus } from '@cg/shared-schema';

export const colors = {
  // Page chrome
  background: '#0F172A',
  panel: '#111827',
  panelMuted: '#1F2937',
  border: '#374151',
  text: '#E5E7EB',
  textMuted: '#9CA3AF',

  // Air-state contract (Phase 6 §1)
  idle: '#3F3F46',
  ready: '#0EA5E9',
  pending: '#F59E0B',
  onAir: '#E11D48',
  exit: '#F59E0B',
  error: '#991B1B',
  offline: '#94A3B8',
} as const;

export interface AirStateVisual {
  color: string;
  icon: string;
  label: string;
}

/**
 * Air-state visual for a given `StackItemStatus`. Always returns
 * { color, icon, label } so consumers never reach for hue alone.
 */
export function airStateVisual(status: StackItemStatus, pending: boolean): AirStateVisual {
  if (status === 'disconnected') return { color: colors.offline, icon: '⚠', label: 'OFFLINE' };
  if (status === 'error') return { color: colors.error, icon: '✕', label: 'ERROR' };
  if (status === 'on-air') return { color: colors.onAir, icon: '●', label: 'ON AIR' };
  if (status === 'playing')
    return pending
      ? { color: colors.pending, icon: '⟳', label: 'TAKING' }
      : { color: colors.onAir, icon: '●', label: 'ON AIR' };
  if (status === 'updating') return { color: colors.onAir, icon: '⟳', label: 'UPDATING' };
  if (status === 'exiting') return { color: colors.exit, icon: '◐', label: 'EXIT' };
  if (status === 'loaded') return { color: colors.ready, icon: '▸', label: 'READY' };
  return { color: colors.idle, icon: '○', label: 'IDLE' };
}
