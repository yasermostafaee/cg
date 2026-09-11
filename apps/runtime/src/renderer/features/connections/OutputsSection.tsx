import {
  Cable,
  CircleCheck,
  CirclePause,
  CreditCard,
  Film,
  Lightbulb,
  Monitor,
  Radio,
  Volume2,
  type LucideIcon,
} from 'lucide-react';
import {
  DEVICE_ADDRESSING_RULE,
  DEVICE_NUMBER_RECIPE,
  describeDeviceAddressing,
  isAirOutputKind,
  isServerReachable,
  outputSeverityOf,
  type ChannelOutputCheck,
  type ConnectionHealth,
  type DeclaredConsumer,
  type ServerHealth,
} from '@cg/shared-ipc';
import { STATION_SETUP_PX, colors } from '../../theme.js';
import { Icon } from '../../ui/Icon.js';
import { creationWords, formatClock, missingWords, runningWords } from './outputWords.js';

/**
 * `B-223` — THE TECHNICAL SURFACE for the declared-versus-running output check.
 *
 * Everything the `C-029` / `C-030` banner used to put in front of the operator — which
 * addressing form the declared number is, how CasparCG reads it, where the number comes from,
 * what the bridge's re-creation attempt answered, and the "do not power-cycle" paragraph — is
 * engineering, and it lives here: inside Station setup's Channel tab, beside the raster it is
 * about. The operator banner keeps one line and points at this section.
 *
 * ── `RUNTIME-REDESIGN-01` PHASE 7 — THE REFERENCE'S TABLE, OVER THE SAME DETAIL ─────────
 *
 * `09-channel-settings.html` as rendered draws Outputs as a TABLE — `Slot · Configured output ·
 * Runtime status`, one row per consumer `casparcg.config` declares, a `N of M running` count
 * beside the heading, a warning wash on a row that is not running. That is what this renders
 * now, PER CHANNEL (the tab is keyed to the selected channel; `channel` filters each server's
 * checks) and per server. Every B-223 row below the table is unchanged in words: the
 * `Declared: … Running: …` fact, the AIR row with its remedy, the local-monitor sentence, the
 * creation outcome. The reference's `NDI is configured but inactive` note is that AIR row.
 *
 * ⚠ A row's verdict is counted PER KIND, exactly as `MissingConsumer` is: the wire reports a
 * running DeckLink only by port, so the first `running` declarations of a kind are the ones
 * running and the rest are not. Nothing here matches a device to a port. ⚠ The reference
 * paints its missing NDI in AMBER; a missing PROGRAM output here takes the alarm word's ink
 * (`--r-error-text`, Phase 2A) and only a local monitor the caution — alarm severity by
 * air-criticality, owner answer A4.
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
  /* A sentence per server, each on its own line — two inline spans ran together on screen. */
  status: { display: 'block', fontSize: 'var(--r-output-note-text)', color: colors.textMuted },
  fact: { color: colors.textMuted },
  air: { color: colors.errorText, fontWeight: 700 },
  local: { color: colors.textMuted },
  detail: { display: 'block', color: colors.text },
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

/** The glyph a consumer KIND wears in the table — decorative; the kind's own word sits beside it. */
function kindIcon(kind: string): LucideIcon {
  switch (kind.toLowerCase()) {
    case 'decklink':
    case 'bluefish':
      return CreditCard;
    case 'screen':
      return Monitor;
    case 'ndi':
      return Radio;
    case 'ffmpeg':
      return Film;
    case 'system-audio':
      return Volume2;
    case 'artnet':
      return Lightbulb;
    default:
      return Cable;
  }
}

interface OutputRow {
  readonly slot: number;
  readonly declared: DeclaredConsumer;
  readonly running: boolean;
  readonly severity: 'air' | 'local';
}

/**
 * One row per declared consumer, in declaration order, its verdict counted PER KIND: the first
 * `running(kind)` declarations of a kind are running, the rest are not — the same rule
 * `MissingConsumer` is built on, because the wire names a running consumer by port alone.
 */
function outputRows(check: ChannelOutputCheck): OutputRow[] {
  if (check.declared === null) return [];
  const runningByKind = new Map<string, number>();
  for (const r of check.running) {
    const kind = r.kind.toLowerCase();
    runningByKind.set(kind, (runningByKind.get(kind) ?? 0) + 1);
  }
  const seen = new Map<string, number>();
  return check.declared.map((declared, i) => {
    const kind = declared.kind.toLowerCase();
    const ordinal = (seen.get(kind) ?? 0) + 1;
    seen.set(kind, ordinal);
    return {
      slot: i + 1,
      declared,
      running: ordinal <= (runningByKind.get(kind) ?? 0),
      severity: outputSeverityOf(declared.kind),
    };
  });
}

/** The configured output's own words — the kind, and the device it declares, as `missingWords` spells them. */
function configuredWords(declared: DeclaredConsumer): string {
  return declared.device === undefined
    ? declared.kind
    : `${declared.kind} (device ${declared.device})`;
}

function OutputTable({ rows }: { rows: readonly OutputRow[] }): JSX.Element {
  return (
    <div className="cg-card">
      <table className="cg-output-table" data-output-table="">
        <thead>
          <tr>
            <th scope="col">Slot</th>
            <th scope="col">Configured output</th>
            <th scope="col">Runtime status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const state = row.running ? 'running' : 'missing';
            return (
              <tr
                key={row.slot}
                data-output-row={state}
                {...(row.running ? {} : { 'data-output-row-severity': row.severity })}
              >
                <td>
                  <span className="cg-output-slot">{String(row.slot).padStart(2, '0')}</span>
                </td>
                <td>
                  <span className="cg-output-name">
                    <Icon icon={kindIcon(row.declared.kind)} size={STATION_SETUP_PX.outputIcon} />
                    {configuredWords(row.declared)}
                  </span>
                </td>
                <td>
                  <span
                    className="cg-output-state"
                    data-output-state={state}
                    {...(row.running ? {} : { 'data-output-row-severity': row.severity })}
                  >
                    <Icon
                      icon={row.running ? CircleCheck : CirclePause}
                      size={STATION_SETUP_PX.stateIcon}
                    />
                    {row.running ? 'Running' : 'Not running'}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
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
  const rows = outputRows(check);
  const running = rows.filter((r) => r.running).length;
  return (
    <div data-testid={`outputs-channel-${String(check.channel)}`}>
      <div className="cg-output-check">
        <span>
          Channel {String(check.channel)} on server {server.label} —{' '}
          {reachable
            ? `checked ${formatClock(check.observedAt)}`
            : `last checked ${formatClock(check.observedAt)}; CasparCG is unreachable, so this cannot be re-checked`}
        </span>
        {check.declared !== null && (
          <span className="cg-setup-tag" data-output-count="">
            {`${String(running)} of ${String(rows.length)} running`}
          </span>
        )}
      </div>
      {check.declared !== null && <OutputTable rows={rows} />}
      <div className="cg-output-detail">
        {check.declared === null ? (
          <span style={styles.fact}>
            The declaration could not be read from INFO CONFIG — a gap in the check, not a fault.
          </span>
        ) : (
          <span style={styles.fact}>
            Declared:{' '}
            {check.declared.length === 0 ? 'nothing' : check.declared.map((d) => d.kind).join(', ')}
            . Running: {runningWords(check.running)}.
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
            {m.kind === 'screen' ? 'Preview' : 'Local monitor'} — {missingWords([m])} is declared
            and not running: {m.kind === 'screen' ? 'a preview window' : 'the sound device'} on the
            playout machine, with no effect on air. Nothing for the operator to do.
          </span>
        ))}
        {check.missing.length === 0 && check.declared !== null && (
          <span style={styles.fact}>Every declared consumer is running.</span>
        )}
      </div>
    </div>
  );
}

function ServerBlock({
  server,
  channel,
}: {
  server: ServerHealth;
  channel: number | undefined;
}): JSX.Element {
  const checks = [...(server.outputs ?? [])]
    .filter((c) => channel === undefined || c.channel === channel)
    .sort((a, b) => a.channel - b.channel);
  if (checks.length === 0) {
    return (
      <span style={styles.status}>
        Server {server.label}: no output check has completed yet
        {channel === undefined ? '' : ` for channel ${String(channel)}`}
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
 * without the hooks; `ChannelSection` passes `useConnections()` and the selected channel.
 * With no `channel`, every checked channel is shown.
 */
export function OutputsSection({
  health,
  channel,
}: {
  health: ConnectionHealth | null;
  channel?: number;
}): JSX.Element {
  return (
    <section className="cg-output-block" aria-label="Program outputs">
      <div className="cg-output-head">
        <h3>Outputs</h3>
      </div>
      {health === null ? (
        <span style={styles.status}>No health reading from the bridge yet.</span>
      ) : (
        <>
          <ServerBlock server={health.primary} channel={channel} />
          {health.backup !== undefined && <ServerBlock server={health.backup} channel={channel} />}
        </>
      )}
      {/* ⚠ The 17 px gap above is `.cg-setup-details`'s own now, not an inline style here:
          it was declared once and read only at this one call site, so every OTHER `<details>`
          in the dialog sat flush against what was above it (owner, on the plant). */}
      <details className="cg-setup-details">
        <summary>How are outputs identified?</summary>
        <p>
          What <code>casparcg.config</code> declares versus what is running, read over AMCP: INFO
          CONFIG for the declaration, INFO &lt;channel&gt; for the running set, re-read every
          minute. A program output (decklink, bluefish, ndi, ffmpeg, artnet) that is declared and
          not running is the operator alarm; a preview window or the local sound device is noted
          here only.
        </p>
      </details>
    </section>
  );
}
