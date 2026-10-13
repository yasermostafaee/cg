import {
  DEVICE_ADDRESSING_RULE,
  DEVICE_NUMBER_RECIPE,
  STOCK_CONSUMER_KINDS,
  describeDeviceAddressing,
  isAirOutputKind,
  type ChannelOutputCheck,
  type DeclaredConsumer,
  type MissingConsumer,
} from '@cg/shared-ipc';

/**
 * `C-029` — the program-output check's interval and its two stderr lines.
 *
 * ── A MISSING OUTPUT IS REPORTED, NEVER CREATED ─────────────────────────────
 *
 * `FOLLOWUPS-01` A (the owner, 2026-09-28): `--create-missing-consumers` and its
 * once-per-connection `ADD` are RETIRED. A consumer `ADD` is one of the Playout's C5 commands
 * this station never sends (`ROUTE-PLATES-01`; the send seam refuses one, `amcp-guard.ts`).
 * `casparcg.config` stays the boot-time baseline, and the fix for a consumer that failed at
 * start stays on the playout machine: the banner and the lines below say so.
 */

/** How often a REACHABLE server's running consumers are re-read (`INFO <channel>`). */
export const OUTPUT_RECHECK_MS = 60_000;

/**
 * The `ADD` that re-creates ONE declared consumer from its own declaration, or `null` when
 * that kind's grammar is not measured.
 *
 * ⚠ **THE BRIDGE NEVER SENDS THIS** (`FOLLOWUPS-01` A). Its one caller is the lab instrument
 * `@cg/skew-harness` (`C-033`), which re-creates a consumer ITS OWN `SET MODE` took down on a
 * borrowed channel, and borrows this speller so the instrument and the product cannot disagree
 * about the grammar (golden rule 6).
 *
 * DeckLink only, on the grammar 2.5.0's `parse_amcp_config` reads (`config.cpp`): the device
 * token positionally after `DECKLINK`, then flag words. Measured 2026-09-04: an `ADD` for a
 * device the server cannot open answers `403 ADD FAILED` and leaves the consumer set untouched;
 * an `ADD` at an index ALREADY running REPLACES that consumer. Every other kind's grammar is
 * unmeasured here and so is declined rather than guessed.
 */
export function missingConsumerAddCommand(
  channel: number,
  declared: DeclaredConsumer,
): string | null {
  if (declared.kind !== 'decklink' || declared.device === undefined) return null;
  const words = [`ADD ${String(channel)} DECKLINK ${declared.device}`];
  if (declared.keyer === 'internal') words.push('INTERNAL_KEY');
  else if (declared.keyer === 'external') words.push('EXTERNAL_KEY');
  if (declared.embeddedAudio === true) words.push('EMBEDDED_AUDIO');
  if (declared.keyOnly === true) words.push('KEY_ONLY');
  return words.join(' ');
}

/**
 * `DESKTOP-APPS-01-D` g — one line, for stderr, for a channel whose declared consumers `INFO`
 * does not list on a build whose `INFO` is not stock: a fact for the engineer, never an alarm.
 */
export function describeUnknownOutput(label: string, check: ChannelOutputCheck): string {
  const unknown = check.unknown ?? [];
  const declared = unknown
    .map((m) => (m.devices.length > 0 ? `${m.kind} (device ${m.devices.join(', ')})` : m.kind))
    .join(', ');
  const nonStock = check.running
    .map((r) => r.kind)
    .filter((kind, i, all) => !STOCK_CONSUMER_KINDS.includes(kind) && all.indexOf(kind) === i);
  return (
    `[caspar-bridge] channel ${String(check.channel)} on server ${label}: casparcg.config ` +
    `declares ${declared} and INFO does not list it, but this CasparCG's INFO lists ` +
    `${nonStock.join(', ')}, which stock CasparCG does not ship — so INFO cannot say whether ` +
    `it runs. Output UNKNOWN, not alarmed (running: ${check.running.map((r) => r.kind).join(', ')}).\n`
  );
}

/**
 * One line, for stderr, naming what is declared and not running.
 *
 * `B-223` — severity by air-criticality (`isAirOutputKind`, the one predicate): a missing
 * program output is the 🔴 line with the full remedy; a channel missing ONLY local monitors
 * (`screen`, `system-audio`) is a plain note — a preview window on the playout machine is not
 * an alarm, on this log any more than on the operator's screen.
 */
export function describeMissingOutput(label: string, check: ChannelOutputCheck): string {
  const words = (missing: readonly MissingConsumer[]): string =>
    missing
      .map((m) =>
        m.devices.length > 0
          ? `${m.kind} (device ${m.devices.join(', ')})`
          : `${m.kind} ×${String(m.declared)} (${String(m.running)} running)`,
      )
      .join(', ');
  const running =
    check.running.length === 0 ? 'nothing' : check.running.map((r) => r.kind).join(', ');
  const air = check.missing.filter((m) => isAirOutputKind(m.kind));
  const local = check.missing.filter((m) => !isAirOutputKind(m.kind));
  if (air.length === 0) {
    return (
      `[caspar-bridge] channel ${String(check.channel)} on server ${label}: casparcg.config ` +
      `declares ${words(local)} and CasparCG is not running it — a local monitor on the playout ` +
      `machine (a preview window / the sound device), no effect on air; noted, not alarmed ` +
      `(running: ${running}).\n`
    );
  }
  // C-030 — which addressing form each missing declaration uses, and how CasparCG reads it.
  const addressing = air
    .flatMap((m) =>
      m.devices.map((d) => `the ${m.kind} is declared as ${describeDeviceAddressing(d).words}`),
    )
    .join('; ');
  return (
    `[caspar-bridge] 🔴 CHANNEL ${String(check.channel)} OUTPUT MISSING on server ${label} — ` +
    `casparcg.config declares ${words(air)} and CasparCG is not running it (running: ${running}). ` +
    `A consumer that fails at start never appears in INFO; check the CasparCG log for the ` +
    `reason ("Decklink device … not found" / "Decklink drivers not found"), fix the config on ` +
    `the playout machine and restart CasparCG.` +
    (addressing.length > 0
      ? ` ${addressing}. ${DEVICE_ADDRESSING_RULE} ${DEVICE_NUMBER_RECIPE}`
      : '') +
    (local.length > 0 ? ` Also not running, local only: ${words(local)}.` : '') +
    `\n`
  );
}
