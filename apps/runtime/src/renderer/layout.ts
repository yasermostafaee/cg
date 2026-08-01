import type { CSSProperties } from 'react';
import { colors } from './theme.js';

/**
 * The app shell's layout contract: the PAGE never scrolls, each PANEL does.
 *
 * What was wrong, and why it produced two separate-looking bugs:
 *
 * `<main>` was a grid with `minHeight: 100vh` and `gridTemplateRows: '1fr auto'`. Two
 * defects fell out of that.
 *
 * 1. `minHeight` is a floor, not a cap, and nothing in the tree set `overflow`. The shell
 *    was free to grow past the viewport, so a long stack scrolled the DOCUMENT. The panels'
 *    own `overflowY: auto` never engaged: `auto` only scrolls against a BOUNDED height, and
 *    they were never bounded.
 *
 * 2. The row template was fixed at two rows, but the number of in-flow children VARIES —
 *    the connection banner renders only when the link is not live (the failover banner,
 *    toasts and overlays are all `position: fixed`, so they are not grid items at all).
 *    With a banner present it became the FIRST grid item and took the `1fr` track, so it
 *    stretched to fill the viewport while the three-panel shell dropped into a
 *    content-sized `auto` row. That — not its own padding — is why the NOT CONNECTED and
 *    TEST MODE banners looked half a screen tall.
 *
 * A flex column fixes both: it bounds the height (100vh, clipped), and it does not care how
 * many children there are. Banners and the status bar size to their content; only the shell
 * grows. Every scroll then happens INSIDE a panel, because the panels are finally bounded.
 */

export const appShell = {
  /** The page: exactly one viewport tall, and it never scrolls. */
  page: {
    fontFamily:
      'Inter, system-ui, -apple-system, "Segoe UI", Vazirmatn, "Noto Sans Arabic", sans-serif',
    color: colors.text,
    background: colors.background,
    height: '100vh',
    margin: 0,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },

  /** Banners / the status bar: content-sized, never stretched, never squeezed. */
  chrome: { flexShrink: 0 },

  /** The three panels. Takes all remaining height and clips — the panels scroll, not this. */
  shell: {
    display: 'grid',
    // R-028 — the 240px Library column is GONE (the panel was deleted, not
    // hidden): the workspace takes the space the library used to hold. The
    // columns are now COMPUTED per render (`useShellLayout`) — the operator
    // drags the divider, takes a panel fullscreen, or drops below the narrow
    // breakpoint — so this is only the server-rendered default.
    gridTemplateColumns: '1fr 6px 320px',
    /*
     * TIGHTER than the original 0.75rem (owner: the gap between panels is too big).
     *
     * On a playout console the space between panels is pure cost: it buys nothing and
     * it is taken from the row list, the monitor and the field editors, all of which
     * want every pixel. The panels already have their own borders and backgrounds, so
     * they read as separate without a wide gutter between them — the separation is
     * doing its job at 0.35rem just as well as at 0.75rem, and it hands ~13px back to
     * the columns on each seam.
     *
     * The 6px divider column is NOT part of this and is unchanged: it is a hit target,
     * not decoration, and shrinking it would make the resize handle harder to grab —
     * the opposite of the divider work the owner asked for in the same review.
     */
    gap: '0.35rem',
    padding: '0.35rem',
    flex: 1,
    minHeight: 0,
    overflow: 'hidden',
  },

  /** The centre column: monitor + orphan strip are content-sized; the stack takes the rest. */
  workspace: {
    display: 'flex',
    flexDirection: 'column',
    // Matched to the shell's gap above, for the same reason. Without this the
    // VERTICAL seams (monitor → fixed bank → stack) would stay twice as wide as the
    // horizontal ones, which reads as a mistake rather than as a tighter layout.
    gap: '0.35rem',
    minHeight: 0,
    overflow: 'hidden',
  },

  monitor: {
    background: colors.panel,
    borderRadius: '0.25rem',
    border: `1px solid ${colors.border}`,
    padding: '1rem',
    color: colors.textMuted,
    fontSize: '0.9rem',
    flexShrink: 0,
  },

  /**
   * R-021 — the fixed-bank panel, ABOVE the stack in the centre column. The
   * column now holds TWO scrollable panels, and both must stay bounded or the
   * page-never-scrolls invariant breaks: this one is content-sized up to a CAP
   * (`flex: '0 1 auto'` + `maxHeight` — a bank is at most 20 rows and must not
   * starve the stack, which keeps `flex: 1` and takes the rest), and it CLIPS
   * so the row list inside is what scrolls (the StackPanel pattern). `0 1
   * auto`, not `flexShrink: 0` like the monitor strip: a panel that refuses to
   * shrink under a small viewport would push the stack out of its bound and
   * hand the overflow to the page.
   */
  /**
   * R-028 part B — the narrow-screen Inspector overlay.
   *
   * A SCRIM plus a right-pinned panel, deliberately NOT a full-screen sheet:
   * the Layers list stays visible to its left, so the operator can still see
   * what is ON AIR while editing a live graphic's fields. That is the normal
   * case on this console, not an edge case. The scrim is the single-action
   * dismissal.
   */
  overlayScrim: {
    position: 'fixed' as const,
    inset: 0,
    background: 'rgba(0, 0, 0, 0.45)',
    zIndex: 800,
  },
  overlayPanel: {
    position: 'fixed' as const,
    top: 0,
    right: 0,
    bottom: 0,
    // Leaves a strip of the Layers list visible beside it — the on-air state
    // must never be fully covered.
    width: 'min(24rem, 82vw)',
    zIndex: 801,
    display: 'flex',
    flexDirection: 'column' as const,
    boxShadow: '-8px 0 24px rgba(0, 0, 0, 0.45)',
  },
  fixedPanel: {
    display: 'flex',
    flexDirection: 'column',
    flex: '0 1 auto',
    minHeight: 0,
    maxHeight: '40%',
    overflow: 'hidden',
  },
} as const satisfies Record<string, CSSProperties>;
