import { useEffect, useState } from 'react';
import { colors } from '../../theme.js';

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
    color: '#0B0B0C',
    background: colors.pending,
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
    <div style={styles.banner} role="alert" data-bridge-skew-banner>
      <span style={styles.text}>
        BRIDGE IS OUT OF DATE
        <span style={styles.detail} title={[...missing].slice(0, NAMED).join(', ')}>
          {detailFor(missing)}
        </span>
      </span>
    </div>
  );
}
