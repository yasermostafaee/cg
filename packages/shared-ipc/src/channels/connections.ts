import { z } from 'zod';
import { defineChannel } from '../channel.js';
import { definePublishChannel } from '../publish.js';

/**
 * Connection channels — operator-facing view of the two CasparCG sessions
 * and the redundancy adapter.
 */

const ServerLabelSchema = z.enum(['A', 'B']);

/**
 * 🔴 **`R-058` — ONE CHANNEL'S FRAME PRODUCTION, and the reason it is a LIST OF WHAT WE HAVE
 * HEARD rather than a state per declared channel.**
 *
 * `ticking: false` is an ALARM: this channel was producing frames and has STOPPED.
 * A channel we have never heard tick is **ABSENT from the list entirely** — not `false`, and
 * not a third enum value.
 *
 * ⚠ **That absence is the whole safety property, and it is structural.** OSC may be blocked,
 * aimed at another host, or simply not sent (`B-094`'s install did exactly that), so
 * "no ticks" and "stopped ticking" are opposite facts with opposite remedies. Encoding the
 * first as `ticking: false` would let a renderer alarm on an OSC-less install forever — the
 * silence-as-evidence trap `B-163` names and `B-101` shipped. **A channel can only be
 * reported not-ticking after it has proved it ticks**, so the bad state is unrepresentable
 * rather than defended against.
 *
 * ⚠ **The BRIDGE decides this, not the renderer.** The staleness judgement needs the tick
 * clock and the session's own reconnect history; a renderer re-deriving it from timestamps
 * would be a second authority on one question — `B-171`'s exact shape, where the renderer's
 * copy of "can a command reach CasparCG" disagreed with the bridge's and won because it was
 * the one attached to the control.
 */
const ChannelTickSchema = z.object({
  channel: z.number().int().positive(),
  /** `false` ⇒ it ticked and STOPPED. Never "we have not heard it" — see the note above. */
  ticking: z.boolean(),
});

export type ChannelTick = z.infer<typeof ChannelTickSchema>;

/**
 * `C-029` — ONE consumer actually RUNNING on a channel, as `INFO <channel>` reports it under
 * `<output><port><port_N>`. `kind` is the consumer's own name on the wire (`decklink`,
 * `screen`, `system-audio`, …) and `port` is CasparCG's index for it — `300 + device` for a
 * DeckLink (so the plant's `<device>23487013</device>` reads as `port_23487313`), `500` for
 * system audio, `600 + screen` for a screen. Captured verbatim from the plant's 2.5.0
 * `69e8ad5` on 2026-09-04; the parser lives in `outputs.ts`.
 */
const RunningConsumerSchema = z.object({
  port: z.number().int().nonnegative(),
  kind: z.string().min(1),
});

export type RunningConsumer = z.infer<typeof RunningConsumerSchema>;

/**
 * `C-029` — one consumer `casparcg.config` DECLARES for a channel, read back through
 * `INFO CONFIG`. This is what the OPERATOR WROTE, not what the card reports (the 2026-08-25
 * walk's Q2): it is the boot-time baseline the alarm compares the running set against, and
 * it carries the declaration's own parameters so a re-creation can repeat them exactly and
 * never substitute.
 */
const DeclaredConsumerSchema = z.object({
  kind: z.string().min(1),
  /** The `<device>` the declaration names, verbatim, when it names one. */
  device: z.string().optional(),
  embeddedAudio: z.boolean().optional(),
  keyOnly: z.boolean().optional(),
  keyer: z.string().optional(),
});

export type DeclaredConsumer = z.infer<typeof DeclaredConsumerSchema>;

/**
 * `C-029` — a declared consumer KIND with fewer instances running than declared. Counted per
 * kind rather than matched per device, because `INFO <channel>` reports the running
 * DeckLink's device only through its port number while the declaration may spell the same
 * card as an index or a persistent ID.
 */
const MissingConsumerSchema = z.object({
  kind: z.string().min(1),
  declared: z.number().int().positive(),
  running: z.number().int().nonnegative(),
  /** The devices the missing declarations name, for the operator's sentence. */
  devices: z.array(z.string()),
});

export type MissingConsumer = z.infer<typeof MissingConsumerSchema>;

/**
 * `C-029` — what the bridge did about a missing consumer, when `--create-missing-consumers`
 * is on. `not-attempted` names a kind the bridge does not create (a screen, system audio,
 * or a kind whose `ADD` grammar it does not know); the others are the wire's answer to the
 * one `ADD` it sent, verbatim in `command`.
 */
const ConsumerCreationSchema = z.object({
  at: z.string().datetime(),
  outcome: z.enum(['created', 'refused', 'failed', 'not-attempted']),
  command: z.string().optional(),
  code: z.number().int().optional(),
  note: z.string().optional(),
});

export type ConsumerCreation = z.infer<typeof ConsumerCreationSchema>;

/**
 * `C-029` — ONE channel's declared-versus-running output check.
 *
 * `declared` is `null` when `INFO CONFIG` answered but could not be read as a configuration
 * — a gap in the check, never an alarm (the `R-030` `unreadable` stance). `missing` is the
 * alarm: a declared kind with fewer running instances than declared, which is exactly the
 * shape of a consumer that failed at boot and therefore never appeared in `<output>`.
 */
const ChannelOutputCheckSchema = z.object({
  channel: z.number().int().positive(),
  declared: z.array(DeclaredConsumerSchema).nullable(),
  running: z.array(RunningConsumerSchema),
  missing: z.array(MissingConsumerSchema),
  observedAt: z.string().datetime(),
  creation: ConsumerCreationSchema.optional(),
});

export type ChannelOutputCheck = z.infer<typeof ChannelOutputCheckSchema>;

const ServerHealthSchema = z.object({
  label: ServerLabelSchema,
  state: z.enum(['disconnected', 'connecting', 'handshaking', 'resyncing', 'healthy', 'degraded']),
  amcpAxisOk: z.boolean(),
  oscFreshAt: z.string().datetime().optional(),
  /**
   * `R-058` — every channel of THIS server we have heard tick since the last reconnect.
   * Absent or empty means we have heard none, which is UNKNOWN and never an alarm.
   */
  channels: z.array(ChannelTickSchema).optional(),
  /**
   * `C-029` — the declared-versus-running output check for every declared channel of THIS
   * server, once both halves have been read. Absent until then.
   *
   * ⚠ **KEPT ACROSS A DISCONNECT, on purpose.** The last verdict stays in the snapshot while
   * the server is unreachable, so the renderer can say "last seen missing, cannot re-check"
   * instead of falling silent — an alarm that goes quiet because its own source died is
   * worse than no alarm. {@link outputVerdictOf} is what turns the kept verdict into the
   * `unverifiable` arm; readers must go through it rather than reading `missing` directly.
   */
  outputs: z.array(ChannelOutputCheckSchema).optional(),
});

export type ServerHealth = z.infer<typeof ServerHealthSchema>;

/**
 * 🔴 **`R-058` — THE ONE AUTHORITY for "is this server reachable but producing nothing?"**
 *
 * Lives here, beside {@link isServerReachable} and on the same wire types, because it is the
 * same class of question and because a second copy is how the name comes to lie (golden
 * rule 6). The StatusBar is its only consumer today; that is not a reason to define it in the
 * StatusBar, which is exactly the argument `B-171` lost.
 *
 * TWO conditions, and both are load-bearing:
 *
 * 1. **The server is REACHABLE.** A disconnected server's channels are not "stopped" — they
 *    are unknown, and the disconnection is already reported, loudly, by the surface that owns
 *    it. Alarming here as well would be two alarms for one fault, and the operator's next
 *    action for a dead link is not "check the consumers".
 * 2. **At least one channel we HAVE heard is not ticking now.** Absence contributes nothing,
 *    by the schema's construction above.
 *
 * ⚠ `degraded` counts as reachable, exactly as {@link isServerReachable} says: AMCP is up and
 * OSC is merely silent. A degraded server whose channels are still ticking is producing
 * frames, and this must not claim otherwise.
 */
export function stoppedChannelsOf(server: ServerHealth): readonly number[] {
  if (!isServerReachable(server.state)) return [];
  return (server.channels ?? []).filter((c) => !c.ticking).map((c) => c.channel);
}

/**
 * `C-029` — the operator-facing verdict on a server's declared outputs.
 *
 * - `unknown` — nothing to say: no check has completed, or every completed check could not
 *   read the declaration. Never an alarm (an unreadable declaration is a gap, not a fault).
 * - `ok` — every declared consumer on every checked channel is running.
 * - `missing` — the alarm: the server is REACHABLE and at least one declared consumer is not
 *   running. `channels` carries only the offending checks.
 * - `unverifiable` — the server is NOT reachable and the LAST completed check found a
 *   consumer missing. The alarm does not clear because its source died; it says so.
 */
export type OutputVerdict =
  | { kind: 'unknown' }
  | { kind: 'ok'; observedAt: string }
  | { kind: 'missing'; channels: readonly ChannelOutputCheck[]; observedAt: string }
  | { kind: 'unverifiable'; channels: readonly ChannelOutputCheck[]; lastObservedAt: string };

/**
 * 🔴 **`C-029` — THE ONE AUTHORITY for "is this server missing a declared output?"**
 *
 * Beside {@link stoppedChannelsOf} for the same reason that one lives here: it is a
 * question over the wire types, and a second copy in a banner is how the name comes to
 * lie (golden rule 6). Two things it decides that a reader must not re-derive:
 *
 * 1. **Reachability changes the ARM, never silences the fact.** `R-058` returns `[]` for
 *    an unreachable server because a stopped tick on a dead link is unknowable; a missing
 *    consumer is different — the last reading is a fact about the last time anyone could
 *    look, and hiding it would let a dead bridge→CasparCG hop read as "fixed".
 * 2. **`degraded` is reachable** (AMCP up, OSC silent), exactly as {@link isServerReachable}
 *    says, and a check read over AMCP is as valid in that state as in `healthy`.
 */
export function outputVerdictOf(server: ServerHealth): OutputVerdict {
  const checks = server.outputs ?? [];
  const missing = checks.filter((c) => c.missing.length > 0);
  const observedAt = checks.reduce<string | null>(
    (newest, c) => (newest === null || c.observedAt > newest ? c.observedAt : newest),
    null,
  );
  if (observedAt === null) return { kind: 'unknown' };
  if (!isServerReachable(server.state)) {
    return missing.length > 0
      ? { kind: 'unverifiable', channels: missing, lastObservedAt: observedAt }
      : { kind: 'unknown' };
  }
  if (missing.length > 0) return { kind: 'missing', channels: missing, observedAt };
  return checks.some((c) => c.declared !== null) ? { kind: 'ok', observedAt } : { kind: 'unknown' };
}

/**
 * The session states a server can be in — the wire spelling, and the one the
 * predicate below is defined over.
 */
export type ServerState = z.infer<typeof ServerHealthSchema>['state'];

/**
 * CAN A COMMAND REACH THIS SERVER RIGHT NOW?
 *
 * THE one predicate over the server-state axis, and it lives here because this is
 * where the wire enum lives: "what does this health value MEAN" is part of the
 * same contract as "what values are there". `@cg/caspar-client`'s `isLiveState`
 * CALLS this rather than keeping a copy, so there is one implementation and drift
 * is impossible rather than merely detected — the renderer and the session FSM
 * cannot come to disagree about which states count as live.
 *
 * `degraded` IS REACHABLE, and that is the whole reason this must not be
 * re-derived per caller. Degraded means the AMCP axis is up while OSC is silent:
 * commands genuinely land, we simply cannot CONFIRM their effect. Treating it as
 * unreachable would disable the entire console on every OSC-less install — the
 * B-101 class, where silence on one channel was read as death on another. A
 * second local copy of the state list is exactly how that regression returns.
 *
 * Everything else — `disconnected`, `connecting`, `handshaking`, `resyncing` —
 * is a state in which a command cannot be relied on to arrive.
 */
export function isServerReachable(state: ServerState): boolean {
  return state === 'healthy' || state === 'degraded';
}

const FailoverReasonSchema = z.enum([
  'manual',
  'osc-silence',
  'amcp-ping-fail',
  'command-timeouts',
  '5xx-burst',
]);

const FailoverInfoSchema = z.object({
  at: z.string().datetime(),
  reason: FailoverReasonSchema,
  from: ServerLabelSchema,
  to: ServerLabelSchema,
});

export type FailoverInfo = z.infer<typeof FailoverInfoSchema>;

const ConnectionHealthSchema = z.object({
  primary: ServerHealthSchema,
  /** Absent when the connection config declares no backup (single-server). */
  backup: ServerHealthSchema.optional(),
  currentPrimary: ServerLabelSchema,
  strategy: z.enum(['mirror-sync', 'mirror-async', 'journal-replay']),
  /**
   * Most-recent failover event (M9.0). Absent if no failover has happened
   * since boot. Renderer uses this to drive the failover banner.
   */
  lastFailover: FailoverInfoSchema.optional(),
});

export type ConnectionHealth = z.infer<typeof ConnectionHealthSchema>;

const ServerEndpointSchema = z.object({
  host: z.string().min(1),
  amcpPort: z.number().int().positive(),
  // OSC port 0 is a valid ephemeral-bind request — the runtime accepts it.
  oscPort: z.number().int().nonnegative(),
});

// R-010 — exported: the bridge validates its persisted config file against
// this exact schema, and `connections.set-config` takes it as the request.
export const ConnectionConfigSchema = z.object({
  // B-046 — the backup is DECLARED, not assumed: a single-server station omits
  // it, and only declared intent distinguishes "no backup" (quiet) from
  // "backup down" (alarmed via health).
  servers: z.object({ A: ServerEndpointSchema, B: ServerEndpointSchema.optional() }),
  strategy: z.enum(['mirror-sync', 'mirror-async', 'journal-replay']),
  autoFailoverEnabled: z.boolean(),
  /**
   * `C-024` — **the address those servers fetch templates from, PERSISTED.**
   *
   * It lives here, in the config that already names the servers, because it is a fact about how
   * THOSE servers reach this machine — not a setting of its own. `B-162` gave it a flag and no
   * store, so it had to be re-typed at every start, and an address that must be re-typed is one
   * that will one day not be typed. The failure that produces is silent: `CG ADD` returns 200,
   * health stays green, and the server shows live sources with no graphic over them.
   *
   * 🔴 **EMPTY MEANS "DERIVE IT", NOT "AN EMPTY ADDRESS", and empty is NOT absent.** Deliberately
   * `z.string()` and not `.min(1)`: the panel must be able to CLEAR this field, so an empty
   * string has to round-trip through the store. Both empty and absent resolve to the derivation,
   * through the ONE normalizer in the bridge's `serve-host-config.ts` — folding them together at
   * the schema edge would take the clear away, and treating `''` as an address would advertise
   * `http://:7911`.
   *
   * ⚠ A command-line `--template-serve-host` OUTRANKS this. Precedence is flag > this file >
   * derivation, unchanged from every other bridge store (`R-010`), because boot scripts depend on
   * it and a panel that silently beat a flag would be the inverse of the confusion `B-162` fixed.
   */
  templateServeHost: z.string().optional(),
  /**
   * `C-024` — the template HTTP port to PIN. Absent or empty is today's default: an ephemeral
   * bind, with the `CG ADD` URL carrying whatever port was actually taken.
   *
   * Pinning it is what makes a firewall rule possible, which is the only reason it exists. `0` is
   * the explicit spelling of ephemeral and is accepted for the same reason `oscPort` accepts it.
   */
  templateServePort: z.number().int().min(0).max(65535).optional(),
});

export type ConnectionConfig = z.infer<typeof ConnectionConfigSchema>;

export const ConnectionsConfigChannel = defineChannel(
  'connections.config',
  z.void(),
  ConnectionConfigSchema,
);

/**
 * R-010 — where/how the template HTTP server ended up after an apply: the
 * host CasparCG fetches templates from and whether the bind is LAN-exposed
 * (a remote server legitimately exposes the DATA plane; the control WS stays
 * loopback regardless).
 */
const TemplateServeInfoSchema = z.object({
  serveHost: z.string().min(1),
  port: z.number().int().nonnegative(),
  exposed: z.boolean(),
  /**
   * `B-162` — the configured CasparCG hosts that CANNOT fetch this address, and
   * will therefore show live sources with NO TEMPLATE over them.
   *
   * 🔴 The COMPLEMENT of `exposed`, and the two must not be confused. `exposed`
   * is the SECURITY question ("did you mean to open this to the LAN?"); this is
   * the CORRECTNESS one, and it has no other surface anywhere: `CG ADD` returns
   * 200 whether or not the page's later fetch succeeds, so a server listed here
   * is failing silently — green health, a journaled success, and a blank layer.
   *
   * Optional so a runtime that does not compute it (the browser mock) stays
   * valid; ABSENT and EMPTY both mean "nothing to report".
   */
  unreachable: z.array(z.string()).optional(),
  /**
   * `C-024` — **which fields a COMMAND-LINE FLAG is currently forcing, and to what.**
   *
   * 🔴 The panel cannot be allowed to show a stored value the bridge is not using. That is this
   * product's worst defect class — a confidently-wrong readout — and here it is one `--flag` away
   * at all times, because precedence is flag > file and the file is what the panel edits. So the
   * bridge REPORTS the mask rather than leaving the surface to guess: present means a flag is in
   * force for that field, and its value is the one actually in effect.
   *
   * Absent (or an empty object) means no flag is forcing anything and the stored value IS the
   * value in force.
   */
  flagOverrides: z
    .object({
      serveHost: z.string().optional(),
      port: z.number().int().nonnegative().optional(),
    })
    .optional(),
  /**
   * `C-024` — this machine's non-internal IPv4 addresses, offered so the operator picks rather
   * than types.
   *
   * ⚠ **CANDIDATES, NEVER A VERDICT.** The bridge enumerates interfaces; it cannot know which one
   * the plant can route to, and on a box with Hyper-V / WSL / VPN / Docker adapters the first one
   * is routinely wrong. That is precisely `guessLanHost()`'s failure, and a list presented as an
   * answer would reproduce it with more confidence. Every surface rendering these must say they
   * are candidates.
   */
  candidates: z.array(z.string()).optional(),
});

export type TemplateServeInfo = z.infer<typeof TemplateServeInfoSchema>;

/**
 * R-010 — apply a new `ConnectionConfig` to the RUNNING bridge. Refused with
 * `reason: 'on-air-block'` while anything is on air or unsettled;
 * `'apply-in-progress'` when another apply is still executing (applies are
 * SERIALIZED — two can never interleave their teardown/rebuild);
 * `'apply-failed'` only for the defined degraded case (template serve could
 * not bind even after the loopback retry — sessions still run on the new
 * config). An unreachable host is NOT an error: the apply succeeds and
 * health honestly reports the disconnected state.
 */
export const ConnectionsSetConfigChannel = defineChannel(
  'connections.set-config',
  ConnectionConfigSchema,
  z.object({
    ok: z.boolean(),
    reason: z.enum(['on-air-block', 'apply-in-progress', 'apply-failed']).optional(),
    message: z.string().optional(),
    templateServe: TemplateServeInfoSchema.optional(),
  }),
);

/**
 * `C-024` — **read the template serve state, including what a flag is masking.**
 *
 * Separate from `connections.config` because the two answer different questions and only one of
 * them is editable: `config` is the STORED intent the panel writes back, this is what is IN FORCE
 * plus why. Folding the mask into the config response would make the panel round-trip a value it
 * did not store.
 *
 * Read on OPEN rather than only after an Apply: a panel that could only learn about a mask by
 * changing something would show a wrong value for as long as the operator merely looked.
 */
export const ConnectionsTemplateServeChannel = defineChannel(
  'connections.template-serve',
  z.void(),
  TemplateServeInfoSchema,
);

/** R-010 — pushed to every client when a new config is applied. */
export const ConnectionsConfigChangedChannel = definePublishChannel(
  'connections.config-changed',
  ConnectionConfigSchema,
);

export const ConnectionsHealthChannel = defineChannel(
  'connections.health',
  z.void(),
  ConnectionHealthSchema,
);

export const ConnectionsFailoverChannel = defineChannel(
  'connections.failover',
  z.object({ reason: z.literal('manual') }),
  z.object({ ok: z.boolean(), newPrimary: ServerLabelSchema }),
);

/** Main → Renderer push: emitted on any state-change in either session. */
export const ConnectionsHealthChangedChannel = definePublishChannel(
  'connections.health-changed',
  ConnectionHealthSchema,
);
