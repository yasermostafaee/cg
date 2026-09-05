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
  /**
   * ERROR. Red, which now means only this and destructive intent.
   *
   * ⚠ A BACKGROUND colour: the alarm banners, the command toast and the refusal
   * `Notice` paint it behind white text. As TEXT on this palette's dark surfaces it
   * measures 2.13:1 — illegible — which `Modal`, `Notice` and the Server settings
   * panel each discovered separately. Error TEXT on a dark background takes
   * `errorText` below.
   */
  error: '#991B1B',
  /**
   * ERROR, as TEXT on a dark background. The exact value the owner specified
   * (2026-09-04, `RUNTIME-FIX-0904`): _"use rgb(255 28 28) for errors on dark
   * backgrounds"_. The row's ERROR mark, the header's in-error count, the
   * status bar's hard failure, the link indicator, the lock overlay's refusal, the
   * Inspector's file error and the audit log's `failed` outcome all read through
   * this. Saturated on purpose, like `onAir`: it is the mark an operator has to find,
   * and it is the other colour that means one thing.
   */
  errorText: 'rgb(255 28 28)',
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
  /**
   * R-022 — REHEARSING. Violet, and every other candidate in the palette was
   * ruled out for a specific reason rather than on taste:
   *
   *   - GREEN is out absolutely. It is the sacred ON AIR hue, and rehearse is the
   *     one state that most needs to not be confusable with air — it is precisely
   *     "this graphic CANNOT reach air".
   *   - SKY (`ready`) is out because READY is the state a row was in immediately
   *     before rehearse, so sharing the hue would make the mode change invisible
   *     at exactly the glance that matters.
   *   - AMBER (`pending`) is out because it means ATTENTION here (OCCUPIED,
   *     UNKNOWN, UNCONFIRMED). Rehearse is a deliberate, safe operator choice,
   *     not something to go and look at.
   *   - RED is out: error and destructive intent only.
   *
   * Violet is new to the state vocabulary, which is the point — a mode nobody has
   * seen before should not arrive wearing a colour that already means something.
   * And per the rule this whole module is built on, the hue is never alone: the
   * state carries its own SHAPE (a monitor, unique among a set of circles) and its
   * own WORD as well.
   */
  rehearsing: '#A78BFA',
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
  /**
   * R-055 — the sky's HOVER weight, LIGHTER than `--r-accent`.
   *
   * A lit toggle must lift under the pointer rather than darken, or it reads as
   * having switched off. The violet `.is-on` family already worked that way; the
   * sky one had no lighter weight to lift to, which is why the maximised panel's
   * hover borrowed the violet and with it the PVW meaning. One more weight of the
   * same hue — NOT a state colour, and it must not become one.
   */
  '--r-accent-lift': '#7DD3FC',
  /**
   * THE ACCENTED ACTION — the same sky, in the weights a FILLED control needs.
   *
   * Owner: «فقط از ایده تفاوت رنگ بین دکمه هاش استفاده کن. رنگ apply/update/add
   * item متفاوته.» Exactly three controls wear it — Apply position, Add item,
   * Update — and every other control in the Inspector stays neutral.
   *
   * SAME HUE FAMILY AS `--r-accent`, deliberately, so this is one more weight of
   * a colour the palette already speaks rather than a parallel palette beside it.
   * `--r-accent` is a TEXT sky and makes an unreadable background; these are the
   * dark fill, the line and the light ink that a filled control needs — the same
   * two-weight split `--r-danger`/`--r-danger-strong` and
   * `--r-rehearsing`/`--r-rehearsing-strong` already use.
   *
   * IT IS NOT A STATE COLOUR AND MUST NOT BECOME ONE. See `.cg-btn--accent` in
   * `controls.css` for why this may live in the Inspector and may not spread to
   * the layer table.
   */
  '--r-accent-fill': '#153B56',
  '--r-accent-fill-hover': '#1A4A6B',
  '--r-accent-line': '#2F7BA8',
  '--r-accent-line-hover': '#4AA8E0',
  '--r-accent-ink': '#CFE8F8',
  /**
   * THE INPUT SURFACE — one background and one line for every field in the app.
   *
   * Owner-specified. It is its own pair rather than `--r-surface-*` because an
   * input is not a panel: it reads as a well SUNK INTO the surface it sits on, and
   * `--r-surface-raised` made the fields sit slightly proud of the panel instead.
   *
   * ONE PAIR, ON `.cg-field`, so the text inputs, the textareas, the selects and
   * `NumericInput` cannot diverge — the owner's report was that the dx/dy boxes
   * rendered differently from the text inputs, and the durable answer is a single
   * surface rather than a second one tuned to look close. Two surfaces tuned to
   * match are two surfaces that drift at the next change.
   */
  '--r-field-bg': '#0E1822',
  '--r-field-line': '#2D4150',
  '--r-onair': colors.onAir, // sacred GREEN — ON AIR only (see the header)
  '--r-caution': '#F59E0B', // amber — Out / EXIT / UNCONFIRMED / dirty
  '--r-danger': '#DC2626', // Remove
  '--r-danger-strong': '#B91C1C',
  '--r-success': '#10B981', // ack / healthy
  '--r-dirty': '#F59E0B',
  /**
   * READY — the state a row is in when it is loaded and selected and not playing.
   *
   * 🔴 **IDENTICAL IN VALUE TO `--r-accent` (`#38BDF8`) AND OPPOSITE IN RULE, which is
   * exactly why the choice has to be made deliberately rather than by whichever name comes
   * to hand.** `--r-accent` is the INTERACTIVE sky and its own comment says it _"IS NOT A
   * STATE COLOUR AND MUST NOT BECOME ONE"_. This one IS the state colour. Anything saying
   * "this row is ready / selected, not playing" takes THIS token; anything saying "this is
   * interactive" takes the accent. Picking the wrong one compiles, looks identical today,
   * and silently drifts the day either is retuned — the failure has no moment at which it
   * announces itself, so the only defence is naming the rule where both are declared.
   * (Session BP, on the Inspector's LOOK INPUTS badge.)
   */
  '--r-ready': colors.ready,
  '--r-idle': colors.idle,
  '--r-offline': colors.offline,
  /**
   * R-022 — the REHEARSE hue, in the two weights a hue needs on this surface.
   *
   * `--r-rehearsing` is the state colour itself, as worn by the row's REHEARSING
   * mark. `--r-rehearsing-strong` is the darker weight a FILL needs so light text
   * on it stays legible — the same two-weight split `--r-accent`/`--r-accent-strong`
   * and `--r-danger`/`--r-danger-strong` already use, and for the same reason: the
   * light state hue is a text colour and makes an unreadable background.
   *
   * The ONLY control allowed to wear this is the REHEARSE toggle while rehearse is
   * ENGAGED. That is not a hole in the "row verbs are neutral" rule, it is the
   * other side of it: neutral bans colour used to advertise AVAILABILITY (which is
   * what drowned the state signal across thirty rows), and this says a MODE IS ON
   * — the same thing the row's own state mark says, in the same colour, so the two
   * cannot disagree about which row is rehearsing.
   *
   * 🔴 **SESSION BP — THE RULE IS ABOUT CONTROLS, AND IT IS WIDENED HERE DELIBERATELY
   * RATHER THAN QUIETLY OVERRIDDEN.** Owner's decision, 2026-08-21: the Inspector's LOOK
   * INPUTS badge reads `SHOWING IN PVW` while the row is rehearsing, and wears this hue.
   *
   * Read the justification above and it already licenses that: the ban is on colour that
   * advertises AVAILABILITY, and what this hue is FOR is saying a mode is on, _"the same
   * thing the row's own state mark says, in the same colour, so the two cannot disagree"_.
   * A badge naming the rehearse mode is a STATE INDICATOR in exactly that category — the
   * row's REHEARSING mark already wears it — not a control offering an action.
   *
   * **So: STATE INDICATORS that name the rehearse mode may wear this. CONTROLS still may
   * not, with the REHEARSE toggle-while-engaged the one exception, for the reason above.**
   * The distinction that matters is indicator-vs-control, never which component it is in.
   */
  '--r-rehearsing': colors.rehearsing,
  '--r-rehearsing-strong': '#7C3AED',
  /**
   * R-055 — the REHEARSING toggle's HOVER and PRESS weights.
   *
   * They lived as three bare literals inside `controls.css`'s `.is-on` rules, and
   * that is precisely how the defect hid: the hover's border was `#A78BFA`, which
   * IS `--r-rehearsing`, and nothing on the page said so. A sky-based toggle that
   * inherited those rules wore the PVW hue while claiming to be about the chrome.
   * Named here so the next reader can see whose colour they are.
   */
  '--r-rehearsing-mid': '#8B5CF6',
  '--r-rehearsing-deep': '#6D28D9',
  /**
   * PER-VERB HOVER FILLS (owner-specified) — used on HOVER AND NOWHERE ELSE.
   *
   * The row verbs rest neutral and that decision is unchanged: colour was taken
   * off them because thirty coloured affordances drowned the state signal, which
   * is a statement about what the operator sees while SCANNING the table. A hover
   * fill is on at most one button at a time, under the pointer the operator is
   * already looking at, and it disambiguates a column of icon-only glyphs at the
   * moment of the click — which is the moment this product can least afford a
   * mis-click, since its STOP and CLEAR mean the opposite of the reference
   * product's.
   *
   * Deliberately DARK, so the shared `--r-text` stays legible on every one of
   * them. Do not reuse these anywhere a control RESTS ON THE LAYER TABLE: that
   * would be the neutral rule reopened, one surface at a time.
   *
   * ONE CARVE-OUT, and it is narrow by construction: `--r-verb-play` is also the
   * Inspector's UPDATE at rest (`.cg-btn--commit`, owner's call). That does NOT
   * reopen the rule, because the rule is about what an operator sees while
   * SCANNING THIRTY ROWS — it exists so a table of coloured affordances cannot
   * drown the one row that is live. The Inspector shows ONE item and has no such
   * competition. The table's verbs are unchanged and still rest neutral.
   *
   * It is `--r-verb-play` rather than `--r-onair` on purpose: UPDATE reads as the
   * play-family action it is without wearing the hue that means a graphic is
   * actually on the output. `--r-onair` remains PLAY's alone.
   */
  '--r-verb-load': '#1AACD8',
  '--r-verb-remove': '#FF0000',
  '--r-verb-play': '#22DD7A',
  '--r-verb-next': '#2EBEA1',
  '--r-verb-stop': '#B38D18',
  '--r-verb-clear': '#DE5105',
  /**
   * R-035 — THE STARTUP SPLASH's own greys, and the one thing to know about them:
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
   * WHY THEIR OWN FAMILY rather than reuse of `--r-surface-*`: the splash ground is a
   * PANEL LIFTED ABOVE the console — lighter than `--r-surface-sunken` (#0F172A) rather
   * than the near-black it started as — so the dismissal reads as a curtain rising off
   * the app instead of one dark screen becoming another. Its inks are tuned for large
   * tracked-out type on that ground, not for panel text. Tying them to the chrome tokens
   * would mean a chrome tweak silently repainting the product's first frame.
   *
   * THE WHOLE FAMILY MOVES TOGETHER OR NOT AT ALL. Lifting the ground alone would have
   * sunk the lines and the rail track into it — `#1C232E` is within two points of the
   * ground, so the progress rail would simply have had no visible track. Every value
   * below the inks was lifted with it, in one step, for that reason.
   *
   * NO RED IN THIS FAMILY, EVER. Red is the sacred air-state colour and decorative red
   * is forbidden across this UI (see the header) — a boot screen is the LAST place it
   * may appear, because it would teach the operator's eye "red" before they have seen a
   * single real state.
   *
   * THE ACCENT IS NOT IN THIS FAMILY, and no longer borrows `--r-accent` either. The
   * splash is the BRAND screen, so its chrome is APASAI's own blue `#00AEEF` — an exact
   * company value that is not ours to alter — declared as a splash-local constant in the
   * inline CSS beside the scene's violet and amber, NOT as a `--r-*` token, because
   * nothing in the console UI may ever wear them. The app's own sky `--r-accent` is
   * deliberately UNCHANGED by that decision. `--r-splash-glow` is the one exception and
   * only because it must be an `rgba()` a `box-shadow` can take.
   */
  '--r-splash-bg': '#1A212D',
  /** Strong border — the corner brackets, the rule, the scene's row and monitor strokes. */
  '--r-splash-line': '#3D4959',
  '--r-splash-ink': '#E8EDF4',
  '--r-splash-ink-dim': '#5A6675',
  '--r-splash-ink-faint': '#55637A',
  '--r-splash-readout': '#8B97A6',
  /** Subtle border — the rail's TRACK, the scene's wires and the monitor's safe ticks. */
  '--r-splash-rail': '#2C3644',
  /** The dim filler bars inside the playout scene's stack rows. */
  '--r-splash-scene-bar': '#3A4557',
  /** The APASAI wordmark beside the mark — brighter than a tagline, dimmer than `ink`. */
  '--r-splash-company-ink': '#C9D3DF',
  /**
   * The APASAI mark, RELIT FOR A DARK GROUND at the owner's explicit direction: the
   * source artwork's bars are near-black and its swoosh mid-grey, which disappear on
   * `--r-splash-bg`. The arc is NOT here — it keeps the exact brand blue, untouched.
   */
  '--r-splash-logo-bars': '#EEF3F9',
  '--r-splash-logo-swoosh': '#5C6A7C',
  /** The rail's halo — the brand blue at half alpha, in the form `box-shadow` takes. */
  '--r-splash-glow': 'rgba(0, 174, 239, 0.5)',
  /**
   * Softer than it was, and for the same reason the ground was lifted: a heavy vignette on
   * a lighter panel darkens the corners until the thing stops reading as ONE rectangle.
   */
  '--r-splash-vignette': 'rgba(0, 0, 0, 0.22)',
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
  /**
   * THE PANEL BAR'S HEIGHT — one number for all four panels.
   *
   * A FLOOR, not an intrinsic height, and that distinction is the whole fix: the
   * bars used to be as tall as their contents, so LAYERS (36px bulk verbs) stood
   * ~52px and the Inspector (small icon buttons only) stood ~39px. Neither was
   * wrong on its own, which is exactly why nobody found it by reading a file.
   * See `.cg-panel-header` in `controls.css`.
   */
  '--r-panel-bar-h': '52px',
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
  if (status === 'error') return { color: colors.errorText, icon: '✕', label: 'ERROR' };
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
