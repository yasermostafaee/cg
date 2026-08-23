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
