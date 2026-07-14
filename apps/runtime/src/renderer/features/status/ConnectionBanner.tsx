import { colors } from '../../theme.js';
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
 * - **DISCONNECTED** — the bridge is unreachable. Commands are refused. Offers a retry and
 *   an explicit door into test mode (the ONLY door — it is never entered automatically).
 * - **TEST MODE** — an explicit simulation. Says plainly that nothing is on air and no
 *   command reaches CasparCG, and offers an explicit way out.
 *
 * When the link is live this renders nothing: no banner is itself the signal that the
 * Runtime can actually reach air.
 */

const styles = {
  banner: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    padding: '0.6rem 1rem',
    fontSize: '0.85rem',
    fontWeight: 700,
    letterSpacing: '0.04em',
    color: '#0B0B0C',
  },
  text: { flex: 1, minWidth: 0 },
  detail: { display: 'block', fontWeight: 500, letterSpacing: 0, opacity: 0.85 },
} as const;

/** Repeating hazard stripes — deliberately unlike any live-air surface in the app. */
const TEST_STRIPES =
  'repeating-linear-gradient(135deg, #F5C451 0 14px, #E0A92E 14px 28px)' as const;

export function ConnectionBanner(): JSX.Element | null {
  const link = useLink();

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
      style={{ ...styles.banner, background: colors.error, color: '#FFFFFF' }}
    >
      <span style={styles.text}>
        NOT CONNECTED — NOTHING CAN REACH AIR.
        <span style={styles.detail}>
          The Runtime cannot reach the CasparCG bridge. On-air commands are refused, not queued:
          reissue them once the connection is back.
        </span>
      </span>
      <Button variant="secondary" onClick={() => globalThis.location.reload()}>
        Retry connection
      </Button>
      <Button variant="ghost" onClick={() => setTestMode(true)}>
        Enter test mode
      </Button>
    </div>
  );
}
