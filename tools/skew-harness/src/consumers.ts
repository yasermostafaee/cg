import { missingConsumerAddCommand } from '@cg/caspar-bridge';
import {
  isAirOutputKind,
  parseDeclaredConsumersFromConfig,
  parseRunningConsumersFromInfo,
  type DeclaredConsumer,
  type RunningConsumer,
} from '@cg/shared-ipc';

/**
 * `C-033` — **THE HARNESS BORROWS A LIVE CHANNEL, SO IT CAPTURES WHAT THAT CHANNEL CARRIES
 * BEFORE IT TOUCHES ANYTHING, SAYS SO LOUDLY WHEN ANY OF IT GOES TO AIR, AND PUTS BACK WHAT
 * ITS OWN `SET MODE` TOOK DOWN.**
 *
 * Hardening on its own merits. The harness always restored the channel's MODE; it never
 * looked at the channel's CONSUMERS. A `SET <ch> MODE` re-initialises every consumer on that
 * channel, and a consumer that cannot run the measurement mode does not come back — so the
 * instrument could leave a channel in its original mode with one fewer output than it found,
 * and nothing in its report would say so. The mode is one fact about the channel; the running
 * consumer set is the other, and both are now captured, compared and restored.
 *
 * ── WHAT IS REUSED, DELIBERATELY ─────────────────────────────────────────────
 *
 * The two `INFO` readings go through `@cg/shared-ipc`'s `parseRunningConsumersFromInfo` and
 * `parseDeclaredConsumersFromConfig` — the SAME extractions the bridge's `C-029` alarm uses —
 * and the one `ADD` this module will ever build for a DeckLink is `@cg/caspar-bridge`'s
 * `missingConsumerAddCommand`, built from the declaration's OWN tokens. A second parser or a
 * second `ADD` speller here is how the instrument and the product would come to disagree
 * about what a channel is running (golden rule 6).
 *
 * ── WHAT IT WILL NOT DO ──────────────────────────────────────────────────────
 *
 * It re-creates only a consumer whose `ADD` grammar has been MEASURED (`B-208`): a DeckLink
 * from its declaration, and a `SCREEN`. Anything else — `system-audio`, `ndi`, `bluefish`, a
 * kind the config does not declare — is REPORTED as missing with the reason, never guessed at:
 * an `ADD` at a running index REPLACES that consumer, and a guessed device token on a
 * multi-card box could put a different card on air. And it never `ADD`s a kind that is still
 * running — the comparison is per port, so a consumer that survived is left exactly alone.
 */

/** The consumers running on a channel, from an `INFO <channel>` reply; null = could not read. */
export function runningConsumersOf(infoXml: string): RunningConsumer[] | null {
  return parseRunningConsumersFromInfo(infoXml);
}

/** What `casparcg.config` declares for ONE channel, from an `INFO CONFIG` reply; null = unreadable. */
export function declaredConsumersOf(configXml: string, channel: number): DeclaredConsumer[] | null {
  const channels = parseDeclaredConsumersFromConfig(configXml);
  if (channels === null) return null;
  return channels.find((c) => c.channel === channel)?.consumers ?? [];
}

/** The consumers that carry the channel OFF the machine — the ones a borrowed channel puts at risk. */
export function airOutputsOf(running: readonly RunningConsumer[]): RunningConsumer[] {
  return running.filter((r) => isAirOutputKind(r.kind));
}

const describe = (c: RunningConsumer): string => `${c.kind}@${String(c.port)}`;

/**
 * The loud notice, or null when nothing running on the channel goes to air.
 *
 * It names every air-output consumer, then every change the run is about to make in the
 * order it will make them, and it says what each change does to those consumers. Printed
 * BEFORE the first command, with a grace window so an operator can stop the run.
 */
export function borrowNotice(input: {
  readonly channel: number;
  readonly running: readonly RunningConsumer[];
  readonly modeFrom: string;
  readonly modeTo: string;
  readonly runs: number;
}): string | null {
  const air = airOutputsOf(input.running);
  if (air.length === 0) return null;
  const ch = String(input.channel);
  const others = input.running.filter((r) => !isAirOutputKind(r.kind)).map(describe);
  const modeChanges = input.modeFrom !== input.modeTo;
  const steps: string[] = [];
  if (modeChanges) {
    steps.push(
      `SET ${ch} MODE ${input.modeTo} (from ${input.modeFrom}) — this RE-INITIALISES EVERY consumer on ` +
        `the channel, ${air.map(describe).join(', ')} included: the output drops and comes back in the ` +
        `measurement mode, or does not come back at all if the device cannot run it`,
    );
  }
  steps.push(
    `ADD ${ch} FILE … / REMOVE ${ch} FILE … ${String(input.runs)}× beside it (a second consumer on the ` +
      `same channel, sharing its frame budget)`,
  );
  steps.push(`CLEAR ${ch} at the end (every layer on the channel)`);
  if (modeChanges) {
    steps.push(
      `SET ${ch} MODE ${input.modeFrom} back, then re-ADD any consumer that did not survive the round trip`,
    );
  }
  return (
    `\n🔴 cg-skew: CHANNEL ${ch} CARRIES A LIVE OUTPUT — ${air.map(describe).join(', ')}` +
    (others.length > 0 ? ` (also running: ${others.join(', ')})` : '') +
    `\n   This measurement is about to:\n` +
    steps.map((s, i) => `     ${String(i + 1)}. ${s}`).join('\n') +
    `\n   If this channel is on air, stop now.\n\n`
  );
}

export interface ConsumerAdd {
  readonly consumer: RunningConsumer;
  readonly command: string;
}

export interface UnrestorableConsumer {
  readonly consumer: RunningConsumer;
  readonly reason: string;
}

export interface ConsumerRestorePlan {
  /** Captured consumers that are no longer running (matched by port AND kind). */
  readonly missing: readonly RunningConsumer[];
  /** The `ADD` that brings each restorable one back, from a MEASURED grammar only. */
  readonly adds: readonly ConsumerAdd[];
  /** The rest, each with the reason no `ADD` is built for it. */
  readonly unrestorable: readonly UnrestorableConsumer[];
}

const BY_HAND = 're-add it by hand or restart CasparCG';

/**
 * Which captured consumers are gone, and the `ADD` that would bring each back.
 *
 * Port AND kind identify a consumer: CasparCG numbers a consumer by its factory's base index
 * plus the device index (`301` = DeckLink device 1, `600` = the screen), so the same consumer
 * re-created lands on the same port, and a survivor at that port is left untouched.
 */
export function consumerRestorePlan(input: {
  readonly channel: number;
  readonly before: readonly RunningConsumer[];
  readonly after: readonly RunningConsumer[];
  readonly declared: readonly DeclaredConsumer[] | null;
}): ConsumerRestorePlan {
  const missing = input.before.filter(
    (b) => !input.after.some((a) => a.port === b.port && a.kind === b.kind),
  );
  const adds: ConsumerAdd[] = [];
  const unrestorable: UnrestorableConsumer[] = [];
  const decklinks = (input.declared ?? []).filter((d) => d.kind === 'decklink');
  let nextDecklink = 0;
  for (const consumer of missing) {
    switch (consumer.kind) {
      case 'screen':
        adds.push({ consumer, command: `ADD ${String(input.channel)} SCREEN` });
        break;
      case 'decklink': {
        const declared = decklinks[nextDecklink];
        nextDecklink += 1;
        if (declared === undefined) {
          unrestorable.push({
            consumer,
            reason:
              input.declared === null
                ? `INFO CONFIG could not be read, so there is no declared device token to repeat — ${BY_HAND}`
                : `casparcg.config declares no DeckLink for channel ${String(input.channel)}, so there is no device token to repeat — ${BY_HAND}`,
          });
          break;
        }
        const command = missingConsumerAddCommand(input.channel, declared);
        if (command === null) {
          unrestorable.push({
            consumer,
            reason: `the declared DeckLink names no <device>, so no ADD can repeat it — ${BY_HAND}`,
          });
          break;
        }
        adds.push({ consumer, command });
        break;
      }
      default:
        unrestorable.push({
          consumer,
          reason: `the ADD grammar for "${consumer.kind}" is unmeasured here — ${BY_HAND}`,
        });
    }
  }
  return { missing, adds, unrestorable };
}

export interface ConsumerRestoreAttempt extends ConsumerAdd {
  /** CasparCG's status line for the `ADD`. */
  readonly reply: string;
  /** Re-read from `INFO` after the `ADD`: the consumer is running again at its port. */
  readonly verified: boolean;
}

export interface ConsumerReport {
  /** Running when the harness connected, before anything was changed. */
  readonly before: readonly RunningConsumer[];
  /** Running after the mode restore and every restore attempt below. */
  readonly after: readonly RunningConsumer[];
  readonly restored: readonly ConsumerRestoreAttempt[];
  readonly unrestorable: readonly UnrestorableConsumer[];
  /** Captured consumers still not running when the harness let go of the channel. */
  readonly stillMissing: readonly RunningConsumer[];
}

/** The report, computed from the FINAL reading so every claim in it is a reading, not an intent. */
export function consumerReport(input: {
  readonly before: readonly RunningConsumer[];
  readonly after: readonly RunningConsumer[];
  readonly attempted: readonly (ConsumerAdd & { readonly reply: string })[];
  readonly unrestorable: readonly UnrestorableConsumer[];
}): ConsumerReport {
  const runningAgain = (c: RunningConsumer): boolean =>
    input.after.some((a) => a.port === c.port && a.kind === c.kind);
  return {
    before: input.before,
    after: input.after,
    restored: input.attempted.map((a) => ({ ...a, verified: runningAgain(a.consumer) })),
    unrestorable: input.unrestorable,
    stillMissing: input.before.filter((b) => !runningAgain(b)),
  };
}

/** One line per fact, for stderr — the reading the operator should see before trusting the channel. */
export function describeConsumerReport(channel: number, report: ConsumerReport): string {
  const ch = String(channel);
  const lines: string[] = [];
  const list = (cs: readonly RunningConsumer[]): string =>
    cs.length === 0 ? 'nothing' : cs.map(describe).join(', ');
  lines.push(
    `cg-skew: channel ${ch} consumers — found ${list(report.before)}; now ${list(report.after)}`,
  );
  for (const r of report.restored) {
    lines.push(
      `cg-skew: ${describe(r.consumer)} was gone after the run — sent \`${r.command}\` → ${r.reply}; ` +
        (r.verified ? 'running again' : '🔴 STILL NOT RUNNING'),
    );
  }
  for (const u of report.unrestorable) {
    lines.push(
      `cg-skew: 🔴 ${describe(u.consumer)} was gone after the run and was NOT re-created: ${u.reason}`,
    );
  }
  if (report.stillMissing.length > 0) {
    lines.push(
      `cg-skew: 🔴 CHANNEL ${ch} IS MISSING ${list(report.stillMissing)} THAT IT HAD BEFORE THE RUN` +
        (report.stillMissing.some((c) => isAirOutputKind(c.kind))
          ? ' — A LIVE OUTPUT IS DOWN'
          : ''),
    );
  } else if (report.before.length > 0) {
    lines.push(`cg-skew: channel ${ch} has every consumer it had before the run`);
  }
  return `${lines.join('\n')}\n`;
}
