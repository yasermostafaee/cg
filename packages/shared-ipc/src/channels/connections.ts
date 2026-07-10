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
});

export type TemplateServeInfo = z.infer<typeof TemplateServeInfoSchema>;

/**
 * R-010 — apply a new `ConnectionConfig` to the RUNNING bridge. Refused with
 * `reason: 'on-air-block'` while anything is on air or unsettled;
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
    reason: z.enum(['on-air-block', 'apply-failed']).optional(),
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
