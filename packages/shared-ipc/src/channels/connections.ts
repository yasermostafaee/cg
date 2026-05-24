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
  backup: ServerHealthSchema,
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

const ConnectionConfigSchema = z.object({
  servers: z.object({ A: ServerEndpointSchema, B: ServerEndpointSchema }),
  strategy: z.enum(['mirror-sync', 'mirror-async', 'journal-replay']),
  autoFailoverEnabled: z.boolean(),
});

export type ConnectionConfig = z.infer<typeof ConnectionConfigSchema>;

export const ConnectionsConfigChannel = defineChannel(
  'connections.config',
  z.void(),
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
