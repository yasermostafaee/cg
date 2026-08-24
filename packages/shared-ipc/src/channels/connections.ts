import { z } from 'zod';
import { defineChannel } from '../channel.js';
import { definePublishChannel } from '../publish.js';

/**
 * Connection channels — operator-facing view of the two CasparCG sessions
 * and the redundancy adapter.
 */

const ServerLabelSchema = z.enum(['A', 'B']);

const ServerHealthSchema = z.object({
  label: ServerLabelSchema,
  state: z.enum(['disconnected', 'connecting', 'handshaking', 'resyncing', 'healthy', 'degraded']),
  amcpAxisOk: z.boolean(),
  oscFreshAt: z.string().datetime().optional(),
});

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
