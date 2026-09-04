import {
  DEVICE_ADDRESSING_RULE,
  DEVICE_NUMBER_RECIPE,
  describeDeviceAddressing,
  type ChannelOutputCheck,
  type DeclaredConsumer,
  type MissingConsumer,
} from '@cg/shared-ipc';

/**
 * `C-029` — the program-output check's policy knobs and its one command builder.
 *
 * ── THE DEFAULT IS OFF, AND THIS IS THE ONE FUNCTION THAT SAYS SO ────────────
 *
 * `bin/caspar-bridge.mjs` resolves `--create-missing-consumers` through
 * {@link resolveCreateMissingConsumers}, so the default is ONE exported function a test can
 * hold to its answer (`output-policy.test.ts`) rather than a `=== true` buried in a `.mjs`
 * script no test could reach — the `B-145` shape, applied to a flag whose wrong default
 * would put a card ON AIR without anyone typing anything.
 *
 * ── WHY THE FLAG EXISTS AT ALL, AND WHAT IT MAY NEVER DO ─────────────────────
 *
 * The owner's boundary, on record: `casparcg.config` stays the boot-time baseline so air
 * survives a dead bridge; the bridge intervenes only when that baseline is absent, and it
 * must NEVER substitute a different card on a multi-card box. So the only `ADD` this module
 * builds is the declaration's OWN parameters, verbatim — the same device token the config
 * names, the same audio and keyer flags — and it builds nothing for a kind whose `ADD`
 * grammar it has not measured. Measured 2026-09-04 on the plant (`192.168.21.114`) and the
 * dev 2.5.0: an `ADD` for a device the server cannot open answers `403 ADD FAILED` in a few
 * ms and leaves the channel's consumer set untouched; an `ADD` whose index is ALREADY
 * running REPLACES that consumer (`output::add` removes first, then initialises — the old
 * one is destroyed ~28 ms after the new one's `202`), which is exactly why creation is
 * attempted only for a kind the check found MISSING and never for one that is present.
 */

/** How often a REACHABLE server's running consumers are re-read (`INFO <channel>`). */
export const OUTPUT_RECHECK_MS = 60_000;

/**
 * `--create-missing-consumers` → whether the bridge may `ADD` a declared consumer the check
 * found missing. Saying nothing is OFF; only an explicit `true` turns it on.
 */
export function resolveCreateMissingConsumers(flag: boolean | undefined): boolean {
  return flag === true;
}

/**
 * The `ADD` that re-creates ONE declared consumer from its own declaration, or `null` when
 * the bridge does not create that kind.
 *
 * DeckLink only, on the grammar 2.5.0's `parse_amcp_config` reads (`config.cpp`): the device
 * token positionally after `DECKLINK`, then flag words. `<screen/>` and `<system-audio/>`
 * are confidence monitors on the playout box and are reported, never created; every other
 * kind's grammar is unmeasured here and so is declined rather than guessed.
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

/** The declared consumer the bridge would try to create for a check, or `null`. */
export function creatableMissingConsumer(check: {
  declared: readonly DeclaredConsumer[] | null;
  missing: readonly MissingConsumer[];
}): DeclaredConsumer | null {
  if (check.declared === null) return null;
  const missingKinds = new Set(check.missing.map((m) => m.kind));
  return (
    check.declared.find(
      (d) => missingKinds.has(d.kind) && missingConsumerAddCommand(1, d) !== null,
    ) ?? null
  );
}

/** One line, for stderr, naming what is declared and not running. */
export function describeMissingOutput(label: string, check: ChannelOutputCheck): string {
  const what = check.missing
    .map((m) =>
      m.devices.length > 0
        ? `${m.kind} (device ${m.devices.join(', ')})`
        : `${m.kind} ×${String(m.declared)} (${String(m.running)} running)`,
    )
    .join(', ');
  const running =
    check.running.length === 0 ? 'nothing' : check.running.map((r) => r.kind).join(', ');
  // C-030 — which addressing form each missing declaration uses, and how CasparCG reads it.
  const addressing = check.missing
    .flatMap((m) =>
      m.devices.map((d) => `the ${m.kind} is declared as ${describeDeviceAddressing(d).words}`),
    )
    .join('; ');
  return (
    `[caspar-bridge] 🔴 CHANNEL ${String(check.channel)} OUTPUT MISSING on server ${label} — ` +
    `casparcg.config declares ${what} and CasparCG is not running it (running: ${running}). ` +
    `A consumer that fails at start never appears in INFO; check the CasparCG log for the ` +
    `reason ("Decklink device … not found" / "Decklink drivers not found"), fix the config on ` +
    `the playout machine and restart CasparCG.` +
    (addressing.length > 0
      ? ` ${addressing}. ${DEVICE_ADDRESSING_RULE} ${DEVICE_NUMBER_RECIPE}`
      : '') +
    `\n`
  );
}
