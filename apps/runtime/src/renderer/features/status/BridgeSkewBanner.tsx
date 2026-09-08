import { useEffect, useState } from 'react';
import { TriangleAlert } from 'lucide-react';
import { Icon } from '../../ui/Icon.js';
import { cssVars, NOTICE_PX } from '../../theme.js';

/**
 * 🔴 **`B-153` — THE BRIDGE IS OLDER THAN THIS PAGE, SAID AT CONNECT.**
 *
 * ── THE FAILURE THIS REPLACES ───────────────────────────────────────────────
 *
 * `caspar-bridge` is a separate long-lived process; a browser reload updates the SPA and not
 * the bridge. Nothing checked, so the way an operator discovered a mismatch was pressing a
 * LOOK button during a live show and getting `unknown channel: stack.set-active-look` — the
 * worst possible moment, and it cost a live debugging session.
 *
 * ── WHY IT REPORTS RATHER THAN REFUSING ─────────────────────────────────────
 *
 * ⚠ This is a BANNER, not a gate, and that is a deliberate reading of "fail at connect,
 * visibly". A bridge missing one new channel still plays out perfectly through the twenty it
 * does route. Refusing every command because one is unavailable would convert a partial skew
 * into a total outage — a far worse failure than the one being fixed, and on the same
 * surface. So the station keeps working, the operator is told BEFORE they need the missing
 * feature, and the missing commands refuse themselves legibly when reached (`B-152`).
 *
 * ── AMBER, NOT RED ──────────────────────────────────────────────────────────
 *
 * Amber is this palette's ATTENTION role and it is the honest one: nothing is broken and
 * nothing is off air. There is work to do — restart the bridge — and until it is done some
 * commands are unavailable. Red would put this beside DISCONNECTED, which means nothing can
 * reach air at all, and an operator who learns to discount one will discount both.
 *
 * `RUNTIME-REDESIGN-01` Phase 9 — the band is the reference's `.notice.warn` PAIR
 * (`--r-caution-text` on `--r-caution-bg`, ruled by `--r-notice-line`) in the notice's own
 * box, as a full-width band. It used to fill with `colors.pending` under a dark ink — the one
 * place the caution INK was being spent as a GROUND, which is the split Phase 2 held and this
 * phase made (`design.md` §16.4). `bridgeSkewBanner.dom.test.ts` pins the pair by token
 * identity against the three alarm fills: amber, never red, is an owner decision (A4).
 */

const styles = {
  banner: {
    display: 'flex',
    alignItems: 'center',
    gap: cssVars['--r-notice-gap'],
    padding: cssVars['--r-notice-pad'],
    fontSize: cssVars['--r-notice-fs'],
    lineHeight: cssVars['--r-notice-lh'],
    color: cssVars['--r-caution-text'],
    background: cssVars['--r-caution-bg'],
    borderBottom: `1px solid ${cssVars['--r-notice-line']}`,
    flexShrink: 0,
  },
  text: { flex: 1, minWidth: 0 },
  headline: { fontWeight: 700, letterSpacing: '0.04em' },
  detail: {
    display: 'block',
    opacity: 0.9,
  },
} as const;

/** How many missing channels to name before the sentence stops being readable. */
const NAMED = 3;

/**
 * 🔴 **The operator sees a COUNT and a remedy; a developer sees the names.**
 *
 * A channel name is an internal identifier and `B-152` is the whole argument for keeping
 * those off this surface. But a skew banner that named nothing would be unactionable for the
 * person who has to fix it, who is often the same person. So the sentence carries the count
 * and the remedy, and the names ride the `title` — available on hover, out of the way at a
 * glance, and never the thing an operator has to read to know what to do.
 */
function detailFor(missing: readonly string[]): string {
  const n = missing.length;
  return (
    `${String(n)} command${n === 1 ? '' : 's'} this page can issue ${n === 1 ? 'is' : 'are'} ` +
    'not available on the bridge that is running. Restart the bridge with a matching build. ' +
    'Everything else works normally, and nothing has been sent to CasparCG.'
  );
}

export function BridgeSkewBanner(): JSX.Element | null {
  const [missing, setMissing] = useState<readonly string[] | null>(() => window.cg.link.skew());

  useEffect(() => {
    setMissing(window.cg.link.skew());
    return window.cg.link.onSkewChanged(setMissing);
  }, []);

  // `null` is "no skew known" — the healthy case AND the case where the handshake could not
  // be completed. Neither is something to shout about: an unanswered handshake is not
  // evidence of a mismatch, and claiming one would be a false alarm on a working station.
  if (missing === null || missing.length === 0) return null;

  return (
    <div style={styles.banner} role="alert" data-bridge-skew-banner data-tone="caution">
      <Icon icon={TriangleAlert} size={NOTICE_PX.icon} />
      <span style={styles.text}>
        <span style={styles.headline}>BRIDGE IS OUT OF DATE</span>
        <span style={styles.detail} title={[...missing].slice(0, NAMED).join(', ')}>
          {detailFor(missing)}
        </span>
      </span>
    </div>
  );
}
