import { colors, cssVars } from '../../theme.js';
import { Button } from '../../ui/Button.js';
import { useLink } from '../../hooks/useLink.js';
import { setTestMode } from '../../../platform/testMode.js';

/**
 * R-006 — the loud half of "the Runtime never pretends to be on air".
 *
 * The failure this replaces: an amber "OFFLINE (mock)" pill sat beside a green "PRIMARY A
 * HEALTHY" pill, same size, same row. Two contradictory claims, and the reassuring one won
 * — the operator pressed PLAY, saw ON AIR, and believed a graphic was up. Nothing was.
 *
 * A pill is not enough for a state in which NOTHING CAN REACH AIR. Both not-live states get
 * a full-width, persistent, `role="alert"` banner at the top of the app:
 *
 * - **DISCONNECTED** — the bridge is unreachable. Commands are refused. Offers a retry (and,
 *   inside CG Control, Set up again).
 * - **TEST MODE** — an explicit simulation. Says plainly that nothing is on air and no
 *   command reaches CasparCG, and offers an explicit way out.
 *
 * 🔴 `R-087` (`RELEASE-0112-01-A` A1, the owner 2026-10-04: "it has no use for now") — **THE
 * OPERATOR HAS NO WAY INTO TEST MODE.** This banner offered "Enter test mode", the only door
 * there ever was; it is gone. The mode's own code stays: every Playwright spec boots it through
 * the harness flag (`window.CG_E2E`, `platform/testMode.ts`). The way OUT stays too, so a session
 * left in test mode can still leave it.
 *
 * 🔴 `R-087` A2 — the disconnected banner says `data-tone="alarm"`, and its actions are drawn FOR
 * RED by that scope in `controls.css` (the first a white fill with dark-red ink, the rest white
 * text, a white focus ring) — never the console's blue, and with no `style` on a control.
 *
 * When the link is live this renders nothing: no banner is itself the signal that the
 * Runtime can actually reach air.
 */

/**
 * The banner is a STRIP: as tall as a heading, one line of detail, and its buttons — no
 * taller.
 *
 * It used to eat half the viewport, and not because of anything in this file. It was the
 * FIRST in-flow child of an app shell whose grid declared `gridTemplateRows: '1fr auto'`, so
 * whenever it rendered it took the flexible `1fr` track and `align-items: stretch` inflated
 * it to fill the screen — pushing the three-panel shell into a content-sized row beneath.
 * That is fixed in the shell (`layout.ts`), which is now a flex column.
 *
 * What is fixed HERE is the banner's own box: tightened to the content, and `flexShrink: 0`
 * so it can neither be inflated by a greedy track nor squeezed away when the stack is long.
 * There is deliberately no `height` or `minHeight` — it sizes to what it says.
 *
 * Loud is not the same as large. The colour, the hazard stripes and the shouted heading do
 * the work; the height never did.
 */
const styles = {
  banner: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    padding: '0.4rem 0.9rem',
    fontSize: '0.8rem',
    fontWeight: 700,
    letterSpacing: '0.04em',
    color: cssVars['--r-ink-on-band'],
    flexShrink: 0,
  },
  text: { flex: 1, minWidth: 0, lineHeight: 1.35 },
  detail: {
    display: 'block',
    fontWeight: 500,
    letterSpacing: 0,
    opacity: 0.85,
    fontSize: '0.75rem',
  },
} as const;

/** Repeating hazard stripes — deliberately unlike any live-air surface in the app. */
const TEST_STRIPES = `repeating-linear-gradient(135deg, ${cssVars['--r-band-stripe-a']} 0 14px, ${cssVars['--r-band-stripe-b']} 14px 28px)`;

export function ConnectionBanner({
  reload = () => globalThis.location.reload(),
}: {
  /** Start the console again (a test passes its own: jsdom's `location.reload` is fixed). */
  reload?: () => void;
}): JSX.Element | null {
  const link = useLink();
  // `CENTRAL-BRIDGE-01` §1 C — WHERE CG Bridge was looked for.
  const address = window.cg.link.bridgeAddress?.() ?? null;

  if (link === 'live') return null;

  if (link === 'offline-mock') {
    return (
      <div
        role="alert"
        aria-label="Test mode"
        style={{ ...styles.banner, background: TEST_STRIPES }}
      >
        <span style={styles.text}>
          TEST MODE — SIMULATION ONLY. NOTHING IS ON AIR.
          <span style={styles.detail}>
            No command reaches CasparCG. Every status below is simulated, not real air.
          </span>
        </span>
        <Button variant="secondary" onClick={() => setTestMode(false)}>
          Leave test mode
        </Button>
      </div>
    );
  }

  // 'disconnected' — the bridge is not reachable. This is NOT the mock, and never becomes it.
  return (
    <div
      role="alert"
      aria-label="Bridge disconnected"
      data-tone="alarm"
      style={{ ...styles.banner, background: colors.alarmFill, color: cssVars['--r-ink-on-fill'] }}
    >
      <span style={styles.text}>
        NOT CONNECTED — NOTHING CAN REACH AIR.
        <span style={styles.detail}>
          {/*
            🔴 `R-093` (`RELEASE-0114-01` Part C) — THE STATE, THE ADDRESS, AND THE ONE FACT AN
            OPERATOR ACTS ON. It used to explain WHY nothing answered ("nothing is listening on port
            5280 there", "switched off, a wrong address, or a firewall", "something there answers, but
            not as CG Bridge") and what to do later ("reissue them once the connection is back") —
            explanations an operator under pressure reads once and never again. The absence is
            pinned (`connectionBannerSetUpAgain.dom.test.ts`, `R-093`).
          */}
          {address === null ? 'CG Bridge not reachable.' : `CG Bridge not reachable at ${address}.`}{' '}
          Takes are refused until it is back.
        </span>
      </span>
      <Button variant="secondary" onClick={reload}>
        Retry connection
      </Button>
      {/*
        `CENTRAL-BRIDGE-01` (D8) — THE WAY BACK, inside CG Control: a console pointed at a CG Bridge it
        cannot reach (a mistyped address, a server that moved) cannot reach Station setup either — that
        is behind a station admin's sign-in, over that very bridge. So it forgets this console's
        station and asks again. Absent in a browser, which follows the page's host.
      */}
      {window.cg.setup.canSetPlayoutAddress() && (
        <Button
          variant="ghost"
          onClick={() => {
            if (window.cg.setup.forgetStation()) reload();
          }}
        >
          Set up again
        </Button>
      )}
    </div>
  );
}
