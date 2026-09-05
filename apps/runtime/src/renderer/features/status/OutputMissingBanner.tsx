import {
  checksLosingAir,
  isAirOutputKind,
  outputVerdictOf,
  type ServerHealth,
} from '@cg/shared-ipc';
import { colors } from '../../theme.js';
import { useConnections } from '../../hooks/useConnections.js';
import { useLink } from '../../hooks/useLink.js';
import { missingWords } from '../connections/outputWords.js';

/**
 * `C-029` — the LOUD half of the declared-versus-running output check: **program output is
 * gone and nothing said so.**
 *
 * The plant, 2026-09-01: the DeckLink card was replaced, `casparcg.config` kept the old
 * card's persistent ID, the `<decklink>` consumer failed at boot and never appeared in
 * `INFO`. AMCP answered, OSC ticked, every pill read HEALTHY, and the station had no SDI
 * output. It was discoverable only by reading `INFO 1`'s XML and noticing an ABSENCE. That
 * is the `B-141` / `B-143` / `B-144` family — the system knows something and does not say
 * it — and this banner is the saying.
 *
 * ── `B-223` — WHO THIS SHOUTS AT, AND WHAT IT SAYS ──────────────────────────
 *
 * The plant, 2026-09-05: the screen consumer was stopped to measure the ticker, and this
 * banner went full-width orange at the operator — five lines about persistent IDs, slot
 * indexes, drivers and the server log — over a preview window that has nothing to do with
 * air. The owner: _"this should not matter to the operator at all."_
 *
 * Two rules follow, and both live in `@cg/shared-ipc` rather than here:
 *
 * 1. **Severity is by air-criticality** (`outputSeverityOf`). Only a check missing a PROGRAM
 *    output (`checksLosingAir`) reaches this surface. A channel missing only local monitors
 *    (`screen`, `system-audio`) renders NOTHING here, whatever the verdict says — the verdict is
 *    still `missing`, and the technical surface still shows it.
 * 2. **The operator gets ONE line it can act on.** The headline names the channel and the kind;
 *    one line per channel names the declared thing, says CasparCG is not running it, and says
 *    where the fix is. The engineering detail — which addressing form the number is, the rule
 *    CasparCG reads it by, the startup-log recipe, the creation outcome, "do not power-cycle" —
 *    lives on the technical surface: `OutputsSection` in the Server connection dialog.
 *
 * ── THE SURFACE, AND WHY THIS ONE ───────────────────────────────────────────
 *
 * The same in-flow, full-width, `role="alert"` strip `ConnectionBanner` and
 * `RasterMismatchBanner` use, in the same banner region of the shell and the same
 * `colors.error`: one alarm language, not a second one. NOT `FailoverBanner`'s fixed slab
 * with its hard-coded hex — `B-172` records that slab as the thing to move away from, and
 * the owner's stated constraint there is "a strip rather than a slab".
 *
 * ── WHAT IT SAYS IN EACH STATE — decided by `outputVerdictOf`, never re-derived here ────
 *
 * - `missing` + an air kind   — the alarm.
 * - `unverifiable` + air kind — the bridge cannot reach CasparCG and the LAST check found a
 *                               program output missing. The banner STAYS and says it cannot
 *                               re-check: an alarm that goes quiet because its own source died
 *                               is worse than no alarm.
 * - anything else             — nothing: `ok`, `unknown`, or a loss that is local-only.
 *
 * ── WHAT IT DELIBERATELY DOES NOT DO ────────────────────────────────────────
 *
 * It renders nothing while the browser→bridge link is not live: `ConnectionBanner` already
 * shouts NOTHING CAN REACH AIR there, and every health reading is stale (`B-081`). That is
 * the `R-058` precedent (`stale ⇒ []`), and it is NOT the silent-source case above — the
 * louder banner is on screen, not an absence.
 *
 * It says nothing about a consumer that is present but unhappy. `INFO` reports a consumer's
 * existence and its configuration, never its health; a DeckLink that has lost its reference
 * or is dropping frames logs on the server and nowhere else. That limit is stated in the
 * operator guide rather than papered over with a guess.
 */

/** Matches `ConnectionBanner`'s strip geometry — loud is the colour, not the height. */
const styles = {
  banner: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    padding: '0.4rem 0.9rem',
    fontSize: '0.8rem',
    fontWeight: 700,
    letterSpacing: '0.04em',
    color: '#FFFFFF',
    background: colors.error,
    flexShrink: 0,
  },
  text: { flex: 1, minWidth: 0, lineHeight: 1.35 },
  detail: {
    display: 'block',
    fontWeight: 500,
    letterSpacing: 0,
    opacity: 0.9,
    fontSize: '0.75rem',
  },
} as const;

/** Where the engineering detail lives — named on the one line, so the operator can hand it on. */
export const OUTPUT_DETAIL_POINTER = 'Details: Server connection ▸ Outputs.';

export function OutputMissingBanner(): JSX.Element | null {
  const health = useConnections();
  const link = useLink();
  if (health === null || link !== 'live') return null;
  return <OutputMissingStrip server={health.primary} />;
}

/** The strip for ONE server's verdict — exported so a test can drive it without the hooks. */
export function OutputMissingStrip({ server }: { server: ServerHealth }): JSX.Element | null {
  const verdict = outputVerdictOf(server);
  if (verdict.kind === 'ok' || verdict.kind === 'unknown') return null;

  // B-223 — only the checks that take a channel OFF AIR reach the operator. A local-only
  // loss leaves the verdict `missing` and this surface empty.
  const losing = checksLosingAir(verdict.channels);
  if (losing.length === 0) return null;
  const channels = losing.map((c) => String(c.channel)).join(', ');
  const kinds = losing
    .flatMap((c) =>
      c.missing.filter((m) => isAirOutputKind(m.kind)).map((m) => m.kind.toUpperCase()),
    )
    .filter((k, i, all) => all.indexOf(k) === i)
    .join('/');

  if (verdict.kind === 'unverifiable') {
    return (
      <div role="alert" aria-label="Program output unverified" style={styles.banner}>
        <span style={styles.text}>
          PROGRAM OUTPUT UNVERIFIED — CASPARCG ON SERVER {server.label} IS UNREACHABLE, AND THE LAST
          CHECK FOUND CHANNEL {channels} WITHOUT ITS {kinds} OUTPUT.
          <span style={styles.detail}>
            Last seen missing at {formatTime(verdict.lastObservedAt)}; this stays until the bridge
            can reach CasparCG and check again. {OUTPUT_DETAIL_POINTER}
          </span>
        </span>
      </div>
    );
  }

  return (
    <div role="alert" aria-label="Program output missing" style={styles.banner}>
      <span style={styles.text}>
        PROGRAM OUTPUT MISSING — CHANNEL {channels} HAS NO {kinds} OUTPUT. NOTHING ON THIS CHANNEL
        REACHES AIR.
        {losing.map((check) => (
          <span key={check.channel} style={styles.detail}>
            Channel {String(check.channel)} on server {server.label}: casparcg.config declares{' '}
            {missingWords(check.missing.filter((m) => isAirOutputKind(m.kind)))} and CasparCG is not
            running it. The fix is on the playout machine, not here. {OUTPUT_DETAIL_POINTER}
          </span>
        ))}
      </span>
    </div>
  );
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  const s = String(d.getSeconds()).padStart(2, '0');
  return `${h}:${m}:${s}`;
}
