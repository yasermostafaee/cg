import {
  DEVICE_ADDRESSING_RULE,
  DEVICE_NUMBER_RECIPE,
  describeDeviceAddressing,
  isAirOutputKind,
  isServerReachable,
  type ChannelOutputCheck,
  type ConnectionHealth,
  type ServerHealth,
} from '@cg/shared-ipc';
import { colors } from '../../theme.js';
import { creationWords, formatClock, missingWords, runningWords } from './outputWords.js';

/**
 * `B-223` — THE TECHNICAL SURFACE for the declared-versus-running output check.
 *
 * Everything the `C-029` / `C-030` banner used to put in front of the operator — which
 * addressing form the declared number is, how CasparCG reads it, where the number comes from,
 * what the bridge's re-creation attempt answered, and the "do not power-cycle" paragraph — is
 * engineering, and it lives here: inside the Server connection dialog, beside the hosts and
 * ports it is about. The operator banner keeps one line and points at this section.
 *
 * ── WHAT IT SHOWS, PER SERVER, PER CHECKED CHANNEL ───────────────────────────
 *
 * The declared set, the running set, the time of the check, and one row per missing kind,
 * labelled by SEVERITY (`outputSeverityOf` in `@cg/shared-ipc`, never re-derived here):
 *
 * - **AIR** — a program output is declared and not running. The full remedy follows: the
 *   addressing reading, the rule, the log recipe, the restart, the creation outcome.
 * - **preview** — a local monitor (`screen`, `system-audio`) is declared and not running. One
 *   sentence: what it is, and that it has no effect on air. Nothing to do on a broadcast.
 *
 * A server the bridge cannot reach keeps its LAST verdict here, dated, and says it cannot be
 * re-checked — the same refusal to go quiet the banner has. A server with no completed check
 * says so. An unreadable declaration is named as a gap, not a fault.
 *
 * It is READ-ONLY. Nothing here is a control, so it cannot gate Apply and cannot be gated by
 * anything: a missing consumer of any severity disables no button and refuses no action.
 */

const styles = {
  section: {
    border: `1px solid ${colors.border}`,
    borderRadius: '0.25rem',
    padding: '0.6rem 0.75rem',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '0.5rem',
  },
  sectionTitle: {
    fontSize: '0.78rem',
    fontWeight: 700,
    letterSpacing: '0.06em',
    color: colors.textMuted,
  },
  status: { fontSize: '0.8rem', color: colors.textMuted },
  channel: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '0.25rem',
    fontSize: '0.8rem',
  },
  channelTitle: { fontWeight: 700, color: colors.text },
  fact: { color: colors.textMuted },
  air: { color: colors.errorText, fontWeight: 700 },
  local: { color: colors.textMuted },
  detail: { display: 'block', color: colors.text, fontSize: '0.78rem', lineHeight: 1.4 },
} as const;

/** The paragraph that used to be on the banner: what a consumer that failed at start looks like, and the next action. */
export const FAILED_AT_START_WORDS =
  'A consumer that fails at start never appears — usually a device CasparCG could not open: the ' +
  'card was replaced and its persistent ID changed, the slot index moved, or the driver is missing. ' +
  'Read the CasparCG log on the playout machine for the exact reason, correct the consumer in ' +
  'casparcg.config there, restart CasparCG, and this clears on its own. The server is UP and ' +
  'answering — do not power-cycle it over this.';

/** `C-030` — the addressing reading plus its counter-example, for one declared device. */
function addressingLine(check: ChannelOutputCheck, kind: string, device: string): string {
  const addressing = describeDeviceAddressing(device);
  const counter =
    addressing.form === 'persistent-id'
      ? ' (a slot index would be a small number such as 1)'
      : addressing.form === 'slot-index'
        ? ' (a hardware persistent ID would be a long number such as 23487013)'
        : '';
  return `Channel ${String(check.channel)}: the ${kind} is declared as ${addressing.words}${counter}. ${DEVICE_ADDRESSING_RULE}`;
}

function ChannelRows({
  server,
  check,
}: {
  server: ServerHealth;
  check: ChannelOutputCheck;
}): JSX.Element {
  const reachable = isServerReachable(server.state);
  const air = check.missing.filter((m) => isAirOutputKind(m.kind));
  const local = check.missing.filter((m) => !isAirOutputKind(m.kind));
  return (
    <div style={styles.channel} data-testid={`outputs-channel-${String(check.channel)}`}>
      <span style={styles.channelTitle}>
        Channel {String(check.channel)} on server {server.label} —{' '}
        {reachable
          ? `checked ${formatClock(check.observedAt)}`
          : `last checked ${formatClock(check.observedAt)}; CasparCG is unreachable, so this cannot be re-checked`}
      </span>
      {check.declared === null ? (
        <span style={styles.fact}>
          The declaration could not be read from INFO CONFIG — a gap in the check, not a fault.
        </span>
      ) : (
        <span style={styles.fact}>
          Declared:{' '}
          {check.declared.length === 0 ? 'nothing' : check.declared.map((d) => d.kind).join(', ')}.
          Running: {runningWords(check.running)}.
        </span>
      )}
      {air.length > 0 && (
        <span style={styles.air} data-severity="air">
          AIR — {missingWords(air)} declared and not running. Nothing on this channel reaches air.
        </span>
      )}
      {air.flatMap((m) =>
        m.devices.map((device) => (
          <span key={`${m.kind}:${device}`} style={styles.detail}>
            {addressingLine(check, m.kind, device)}
          </span>
        )),
      )}
      {air.length > 0 && <span style={styles.detail}>{FAILED_AT_START_WORDS}</span>}
      {air.length > 0 && <span style={styles.detail}>{DEVICE_NUMBER_RECIPE}</span>}
      {check.creation !== undefined && (
        <span style={styles.detail}>{creationWords(check.creation)}</span>
      )}
      {local.map((m) => (
        <span key={m.kind} style={styles.local} data-severity="local">
          {m.kind === 'screen' ? 'Preview' : 'Local monitor'} — {missingWords([m])} is declared and
          not running: {m.kind === 'screen' ? 'a preview window' : 'the sound device'} on the
          playout machine, with no effect on air. Nothing for the operator to do.
        </span>
      ))}
      {check.missing.length === 0 && check.declared !== null && (
        <span style={styles.fact}>Every declared consumer is running.</span>
      )}
    </div>
  );
}

function ServerBlock({ server }: { server: ServerHealth }): JSX.Element {
  const checks = [...(server.outputs ?? [])].sort((a, b) => a.channel - b.channel);
  if (checks.length === 0) {
    return (
      <span style={styles.status}>
        Server {server.label}: no output check has completed yet
        {isServerReachable(server.state) ? '' : ' (CasparCG is unreachable)'}.
      </span>
    );
  }
  return (
    <>
      {checks.map((check) => (
        <ChannelRows
          key={`${server.label}:${String(check.channel)}`}
          server={server}
          check={check}
        />
      ))}
    </>
  );
}

/**
 * The section, from a health snapshot — exported on the snapshot so a test can drive it
 * without the hooks; `ServerSettingsPanel` passes `useConnections()`.
 */
export function OutputsSection({ health }: { health: ConnectionHealth | null }): JSX.Element {
  return (
    <section style={styles.section} aria-label="Program outputs">
      <span style={styles.sectionTitle}>OUTPUTS — WHAT casparcg.config DECLARES vs WHAT RUNS</span>
      <span style={styles.status}>
        Read over AMCP: INFO CONFIG for the declaration, INFO &lt;channel&gt; for the running set,
        re-read every minute. A program output (decklink, bluefish, ndi, ffmpeg, artnet) that is
        declared and not running is the operator alarm; a preview window or the local sound device
        is noted here only.
      </span>
      {health === null ? (
        <span style={styles.status}>No health reading from the bridge yet.</span>
      ) : (
        <>
          <ServerBlock server={health.primary} />
          {health.backup !== undefined && <ServerBlock server={health.backup} />}
        </>
      )}
    </section>
  );
}
