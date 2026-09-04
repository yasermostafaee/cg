import {
  isAirOutputKind,
  outputVerdictOf,
  type ChannelOutputCheck,
  type ConsumerCreation,
  type ServerHealth,
} from '@cg/shared-ipc';
import { colors } from '../../theme.js';
import { useConnections } from '../../hooks/useConnections.js';
import { useLink } from '../../hooks/useLink.js';

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
 * - `missing`      — the alarm. Names the channel, the declared kind and its device, what IS
 *                    running, and what to do (fix the config on the playout machine and
 *                    restart CasparCG; read the CasparCG log for the exact reason).
 * - `unverifiable` — the bridge cannot reach CasparCG and the LAST check found the output
 *                    missing. The banner STAYS and says it cannot re-check: an alarm that
 *                    goes quiet because its own source died is worse than no alarm.
 * - `ok` / `unknown` — nothing. An unreadable declaration is a gap in the check, not a
 *                    fault, and a never-checked server has nothing to say yet.
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
  monitorOnly: { background: colors.pending, color: '#0B0B0C' },
  text: { flex: 1, minWidth: 0, lineHeight: 1.35 },
  detail: {
    display: 'block',
    fontWeight: 500,
    letterSpacing: 0,
    opacity: 0.9,
    fontSize: '0.75rem',
  },
} as const;

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  const s = String(d.getSeconds()).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

/** "decklink (device 23487013)" / "screen" — the declared thing that is not running. */
function missingWords(check: ChannelOutputCheck): string {
  return check.missing
    .map((m) => {
      const count = m.declared > 1 ? ` ×${String(m.declared)} (${String(m.running)} running)` : '';
      return m.devices.length > 0
        ? `${m.kind} (device ${m.devices.join(', ')})${count}`
        : `${m.kind}${count}`;
    })
    .join(', ');
}

function runningWords(check: ChannelOutputCheck): string {
  return check.running.length === 0 ? 'nothing' : check.running.map((r) => r.kind).join(', ');
}

function creationWords(creation: ConsumerCreation): string {
  const at = formatTime(creation.at);
  switch (creation.outcome) {
    case 'created':
      return `The bridge re-created it at ${at} (${creation.command ?? 'ADD'}); the next check confirms whether it is running.`;
    case 'refused':
      return (
        `The bridge tried to re-create it at ${at} (${creation.command ?? 'ADD'}) and CasparCG refused` +
        `${creation.code !== undefined ? ` (${String(creation.code)})` : ''} — it cannot open that device either.`
      );
    case 'failed':
      return `The bridge tried to re-create it at ${at} (${creation.command ?? 'ADD'}) and the command did not complete.`;
    case 'not-attempted':
      return `Creation is on, but ${creation.note ?? 'this kind is not one the bridge creates'}.`;
  }
}

/** True when any missing kind is a PROGRAM output (leaves the machine), not a local monitor. */
function losesAir(checks: readonly ChannelOutputCheck[]): boolean {
  return checks.some((c) => c.missing.some((m) => isAirOutputKind(m.kind)));
}

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

  const air = losesAir(verdict.channels);
  const channels = verdict.channels.map((c) => String(c.channel)).join(', ');
  const tone = air ? {} : styles.monitorOnly;

  if (verdict.kind === 'unverifiable') {
    return (
      <div
        role="alert"
        aria-label="Program output unverified"
        style={{ ...styles.banner, ...tone }}
      >
        <span style={styles.text}>
          {air ? 'PROGRAM OUTPUT UNVERIFIED' : 'DECLARED OUTPUT UNVERIFIED'} — CASPARCG ON SERVER{' '}
          {server.label} IS UNREACHABLE, AND THE LAST CHECK FOUND CHANNEL {channels} WITHOUT ITS
          OUTPUT.
          {verdict.channels.map((check) => (
            <span key={check.channel} style={styles.detail}>
              Channel {String(check.channel)}: declared {missingWords(check)} was not running at{' '}
              {formatTime(verdict.lastObservedAt)}; running then: {runningWords(check)}.
            </span>
          ))}
          <span style={styles.detail}>
            This stays until the bridge can reach CasparCG and check again — the fault has not been
            seen fixed, only lost from view.
          </span>
        </span>
      </div>
    );
  }

  return (
    <div role="alert" aria-label="Program output missing" style={{ ...styles.banner, ...tone }}>
      <span style={styles.text}>
        {air
          ? `PROGRAM OUTPUT MISSING — CHANNEL ${channels} HAS NO ${verdict.channels
              .flatMap((c) =>
                c.missing.filter((m) => isAirOutputKind(m.kind)).map((m) => m.kind.toUpperCase()),
              )
              .join('/')} OUTPUT. NOTHING ON THIS CHANNEL REACHES AIR.`
          : `DECLARED OUTPUT NOT RUNNING — CHANNEL ${channels} IS MISSING A CONFIGURED CONSUMER.`}
        {verdict.channels.map((check) => (
          <span key={check.channel} style={styles.detail}>
            Channel {String(check.channel)} on server {server.label}: casparcg.config declares{' '}
            {missingWords(check)} and CasparCG is not running it. Running: {runningWords(check)}.
            Checked {formatTime(check.observedAt)}.
            {check.creation !== undefined ? ` ${creationWords(check.creation)}` : ''}
          </span>
        ))}
        <span style={styles.detail}>
          A consumer that fails at start never appears — usually a device CasparCG could not open:
          the card was replaced and its persistent ID changed, the index moved, or the driver is
          missing. Read the CasparCG log on the playout machine for the exact reason, correct the
          consumer in casparcg.config there, restart CasparCG, and this clears on its own. The
          server is UP and answering — do not power-cycle it over this.
        </span>
      </span>
    </div>
  );
}
