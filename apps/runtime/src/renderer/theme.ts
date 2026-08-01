/**
 * Centralized design tokens for the Runtime renderer. The shared page-chrome
 * palette comes from `@cg/ui` (kept in lockstep with the Designer, Phase 6
 * §1); the air-state colors stay here.
 *
 * The **air-state colors are sacred** — they're used in the stack rows + the
 * status bar's on-air indicator, and **nowhere else**. Decorative red is
 * forbidden anywhere in the UI to avoid confusion with "ON AIR".
 */

import type { StackItemStatus } from '@cg/shared-schema';
import { chrome } from '@cg/ui';

export const colors = {
  // Page chrome (shared)
  background: chrome.background,
  panel: chrome.panel,
  panelMuted: chrome.panelMuted,
  border: chrome.border,
  text: chrome.text,
  textMuted: chrome.textMuted,

  // Air-state contract (Phase 6 §1)
  idle: '#3F3F46',
  ready: '#0EA5E9',
  pending: '#F59E0B',
  onAir: '#E11D48',
  exit: '#F59E0B',
  error: '#991B1B',
  offline: '#94A3B8',
} as const;

/**
 * R-007 design-system tokens. `cssVars` is the SINGLE SOURCE OF TRUTH for the
 * `--r-*` custom properties declared in `controls.css` (a parity test asserts
 * they match). TS consumers (primitives, `airStateVisual`) read the same values
 * here so the stylesheet and the components never drift.
 *
 * The sacred air-state colors above are unchanged; the semantic roles below reuse
 * them (on-air red stays PLAY + ON AIR only) and add the interactive accent, the
 * caution/danger/success/dirty roles, and the spacing / radius / type / motion
 * scales. The look stays a calm dark broadcast console.
 */
export const cssVars = {
  // Semantic colors
  '--r-surface': chrome.panel,
  '--r-surface-raised': chrome.panelMuted,
  '--r-surface-sunken': chrome.background,
  '--r-border': chrome.border,
  '--r-border-strong': '#4B5563',
  '--r-text': chrome.text,
  '--r-text-muted': chrome.textMuted,
  '--r-accent': '#38BDF8', // sky — interactive / secondary
  '--r-accent-strong': '#0EA5E9',
  '--r-onair': colors.onAir, // sacred red — PLAY + ON AIR only
  '--r-caution': '#F59E0B', // amber — Out / EXIT / UNCONFIRMED / dirty
  '--r-danger': '#DC2626', // Remove
  '--r-danger-strong': '#B91C1C',
  '--r-success': '#10B981', // ack / healthy
  '--r-dirty': '#F59E0B',
  '--r-ready': colors.ready,
  '--r-idle': colors.idle,
  '--r-offline': colors.offline,
  /**
   * R-031 — THE STARTUP SPLASH's own greys, and the one thing to know about them:
   * the splash CANNOT READ THESE TOKENS.
   *
   * It paints before the bundle — that is its entire reason to exist — so
   * `controls.css` has not arrived yet and `var(--r-splash-bg)` would resolve to
   * nothing on the frame that matters. The inline `<style>` in `index.html` therefore
   * mirrors these VALUES as literals, each with a comment naming the token it mirrors,
   * and `tests/splashCss.test.ts` asserts every colour literal in that document is the
   * value of one of these (and that none of them is red).
   *
   * They live here anyway, rather than only in the HTML, for the reason every other
   * token does: this file is the single source of truth, so the mirror has something to
   * be checked AGAINST. A literal with no token behind it is a colour nobody can find
   * when the palette moves.
   *
   * WHY THEIR OWN FAMILY rather than reuse of `--r-surface-*`: the splash is a deeper,
   * near-black console than the app chrome (`--r-surface-sunken` is #0F172A, visibly
   * blue beside it) and its inks are tuned for large tracked-out type on that black,
   * not for panel text. Tying them to the chrome tokens would mean a chrome tweak
   * silently repainting the product's first frame.
   *
   * NO RED IN THIS FAMILY, EVER. Red is the sacred air-state colour and decorative red
   * is forbidden across this UI (see the header) — a boot screen is the LAST place it
   * may appear, because it would teach the operator's eye "red" before they have seen a
   * single real state. The accent is deliberately NOT a splash token either: the rail
   * reuses `--r-accent` / `--r-accent-strong`, so the first frame speaks the palette the
   * app already speaks rather than a parallel one beside it.
   */
  '--r-splash-bg': '#090B0F',
  '--r-splash-line': '#2A3441',
  '--r-splash-ink': '#E8EDF4',
  '--r-splash-ink-dim': '#5A6675',
  '--r-splash-ink-faint': '#3F4A58',
  '--r-splash-readout': '#8B97A6',
  '--r-splash-rail': '#1C232E',
  '--r-splash-mark-mid': '#3D4B5C',
  '--r-splash-mark-dim': '#28323E',
  '--r-splash-glow': 'rgba(56, 189, 248, 0.5)',
  '--r-splash-vignette': 'rgba(0, 0, 0, 0.55)',
  // Spacing (4px base)
  '--r-space-1': '4px',
  '--r-space-2': '8px',
  '--r-space-3': '12px',
  '--r-space-4': '16px',
  '--r-space-6': '24px',
  '--r-space-8': '32px',
  // Radii
  '--r-radius-sm': '4px',
  '--r-radius-md': '6px',
  '--r-radius-lg': '10px',
  '--r-radius-full': '9999px',
  // Type scale
  '--r-text-xs': '0.72rem',
  '--r-text-sm': '0.8rem',
  '--r-text-md': '0.9rem',
  '--r-text-lg': '1rem',
  '--r-text-xl': '1.2rem',
  '--r-weight-medium': '500',
  '--r-weight-semibold': '600',
  '--r-weight-bold': '700',
  // Borders / elevation
  '--r-focus-ring': '2px',
  '--r-shadow-1': '0 1px 3px rgba(0, 0, 0, 0.35)',
  '--r-shadow-2': '0 4px 16px rgba(0, 0, 0, 0.4)',
  // Motion
  '--r-dur-fast': '120ms',
  '--r-dur-med': '200ms',
  '--r-dur-spin': '700ms',
} as const;

/**
 * Badge "tone" for a stack status — the `StatusBadge` maps this to a CSS class so
 * every state has a coherent color role. Labels/icons still come from
 * `airStateVisual` (kept verbatim so the Playwright badge-word hooks stay stable).
 */
export type BadgeTone = 'onair' | 'transient' | 'ready' | 'idle' | 'attention' | 'error' | 'exit';

export function badgeTone(status: StackItemStatus, pending: boolean): BadgeTone {
  if (status === 'disconnected') return 'error';
  if (status === 'error') return 'error';
  if (status === 'on-air') return 'onair';
  if (status === 'playing') return pending ? 'transient' : 'onair';
  if (status === 'updating') return 'transient';
  if (status === 'unconfirmed') return 'attention';
  // B-086 — link down, on-air claim unverifiable: muted grey (the health-UNKNOWN
  // tone), NEVER the broadcast red and NEVER the amber of `unconfirmed`.
  if (status === 'unverified') return 'idle';
  if (status === 'exiting') return 'exit';
  if (status === 'loaded') return 'ready';
  return 'idle';
}

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
  // B-044 — bounded-timeout state: the command was sent but no ack arrived in
  // time; the on-air result is unknown. Minimal visual for now (the queued
  // runtime UI-polish item restyles all badge states).
  if (status === 'unconfirmed') return { color: colors.pending, icon: '?', label: 'UNCONFIRMED' };
  // B-086 — the CasparCG link is down: this item WAS on air, but the wire can no
  // longer confirm it. Muted grey (health-UNKNOWN tone); the last-known "ON AIR"
  // lives in the row's tooltip. Restores to on-air or resets to idle on reconnect.
  if (status === 'unverified') return { color: colors.textMuted, icon: '◌', label: 'WAS ON AIR' };
  if (status === 'exiting') return { color: colors.exit, icon: '◐', label: 'EXIT' };
  if (status === 'loaded') return { color: colors.ready, icon: '▸', label: 'READY' };
  return { color: colors.idle, icon: '○', label: 'IDLE' };
}
