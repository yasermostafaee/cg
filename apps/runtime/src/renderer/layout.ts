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
    gridTemplateColumns: '240px 1fr 320px',
    gap: '0.75rem',
    padding: '0.75rem',
    flex: 1,
    minHeight: 0,
    overflow: 'hidden',
  },

  /** The centre column: monitor + orphan strip are content-sized; the stack takes the rest. */
  workspace: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
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
  fixedPanel: {
    display: 'flex',
    flexDirection: 'column',
    flex: '0 1 auto',
    minHeight: 0,
    maxHeight: '40%',
    overflow: 'hidden',
  },
} as const satisfies Record<string, CSSProperties>;
