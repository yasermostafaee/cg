/**
 * Centralized design tokens for the Runtime renderer. The shared page-chrome
 * palette comes from `@cg/ui` (kept in lockstep with the Designer, Phase 6
 * §1); the air-state colors stay here.
 *
 * ON AIR IS GREEN, AND RED MEANS ERROR OR DANGER — NOTHING ELSE.
 *
 * Owner decision, taken deliberately over the tally convention (where red means
 * live), because it follows the Cinegy reference the client already reads. It
 * changes what the codebase's oldest colour rule is anchored to, so read this
 * before touching either hue:
 *
 *  - The **air-state colour is still sacred**. It is used by the layer rows and
 *    the status bar's on-air indicator and NOWHERE else. What changed is only
 *    WHICH colour that is: decorative GREEN is now forbidden across the UI, for
 *    exactly the reason decorative red was — nothing may imply "on air" but air.
 *  - **Red is now single-purpose**: errors and destructive confirmations. That is
 *    the payoff for moving on-air off it, and it is worth protecting — a red that
 *    means two things means neither.
 *
 * `R-006` and `B-087` are written as "a simulation may never wear the broadcast
 * RED" and "a frozen air claim is demoted [from red]". Those sentences protect
 * nothing until they are re-anchored to green, and the tests will NOT catch the
 * gap because they assert the badge's ROLE (`data-row-state`, `cg-badge--onair`)
 * rather than a hex value — which is the more durable form, and precisely why the
 * wording has to be updated by hand. Recorded in `DEBT.md` as a PRD edit owed.
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
  /** READY. The brighter sky of the mock-up, not the deeper `--r-accent-strong`. */
  ready: '#38BDF8',
  pending: '#F59E0B',
  /**
   * ON AIR. Green, per the owner's decision above — the ONE colour that may say a
   * graphic is on the output, and forbidden everywhere else.
   *
   * The exact value the owner specified, and deliberately the most saturated thing
   * in the palette: this is the mark an operator has to find from across a gallery,
   * so it is the one place allowed to be loud. Nothing else may approach it —
   * `--r-success` stays a softer emerald precisely so an ack flash on a button
   * cannot be misread as an air claim.
   */
  onAir: 'rgb(44 255 122)',
  exit: '#F59E0B',
  /** ERROR. Red, which now means only this and destructive intent. */
  error: '#991B1B',
  offline: '#94A3B8',
  /**
   * An EMPTY layer row — its mark and all of its text. Exact value from the owner.
   *
   * Dimmer than `textMuted`, deliberately: a row with nothing on it should recede so
   * the rows that can actually do something own the attention. It is still a
   * legible grey rather than a near-black, because the row's NAME is its identity and
   * an operator has to be able to read which slot is free.
   */
  emptyRow: 'rgb(91 93 96)',
} as const;

/**
 * R-007 design-system tokens. `cssVars` is the SINGLE SOURCE OF TRUTH for the
 * `--r-*` custom properties declared in `controls.css` (a parity test asserts
 * they match). TS consumers (primitives, `airStateVisual`) read the same values
 * here so the stylesheet and the components never drift.
 *
 * The sacred air-state colour above is reused here (`--r-onair` stays ON AIR only)
 * alongside the interactive accent, the caution/danger/success/dirty roles, and
 * the spacing / radius / type / motion scales. The look stays a calm dark
 * broadcast console.
 *
 * `--r-onair` and `--r-success` are both greens now, deliberately DIFFERENT ones:
 * on-air is the vivid green of the mock-up because it is the mark an operator has
 * to find from across a gallery, while success stays the softer emerald of an ack
 * flash. Same family, different jobs — and they keep separate names so a tweak to
 * one cannot silently move the other.
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
  '--r-onair': colors.onAir, // sacred GREEN — ON AIR only (see the header)
  '--r-caution': '#F59E0B', // amber — Out / EXIT / UNCONFIRMED / dirty
  '--r-danger': '#DC2626', // Remove
  '--r-danger-strong': '#B91C1C',
  '--r-success': '#10B981', // ack / healthy
  '--r-dirty': '#F59E0B',
  '--r-ready': colors.ready,
  '--r-idle': colors.idle,
  '--r-offline': colors.offline,
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
  // tone), NEVER the broadcast air colour and NEVER the amber of `unconfirmed`.
  if (status === 'unverified') return 'idle';
  if (status === 'exiting') return 'exit';
  // `loaded` AND `idle` are both READY — see `airStateVisual` for why they were
  // merged, and why the distinction lives in the tooltip instead.
  if (status === 'loaded' || status === 'idle') return 'ready';
  return 'idle';
}

/**
 * WHY a READY row still has two underlying states, and where the difference went.
 *
 * `idle` and `loaded` now render identically — same word, same icon, same colour —
 * because an operator does not perceive the difference and showing two states for
 * one perception is false precision.
 *
 * The difference is REAL, though, and it is about what pressing PLAY costs:
 *
 *  - `loaded` — the producer is already on the layer. PLAY plays it immediately.
 *  - `idle` — a template is chosen but nothing is on the layer yet. PLAY must
 *    reach CasparCG and build the producer FIRST, which takes time and can fail.
 *
 * That matters the moment a take fails: if both rows read READY and one of them
 * fails to come up, it reads as a bug rather than as "that one had to load first".
 * So the fact stays one hover away, in the tooltip — the same trade this surface
 * makes for the occupancy report and the layer number.
 */
export function readyDetail(status: StackItemStatus): string | undefined {
  if (status === 'loaded') {
    return 'Loaded on the layer — PLAY takes it to air immediately.';
  }
  if (status === 'idle') {
    return (
      'A template is chosen but nothing is on the layer yet. PLAY has to build it on ' +
      'CasparCG first, so this take is not instant and can fail.'
    );
  }
  return undefined;
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
  // `loaded` and `idle` are ONE presented state: READY. The operator cannot
  // perceive the difference between "the producer is already up" and "it will be
  // built when you press PLAY", so showing two states was false precision. The
  // difference is preserved in `readyDetail`, which the row's tooltip carries.
  if (status === 'loaded' || status === 'idle') {
    return { color: colors.ready, icon: '▸', label: 'READY' };
  }
  return { color: colors.idle, icon: '○', label: 'IDLE' };
}
