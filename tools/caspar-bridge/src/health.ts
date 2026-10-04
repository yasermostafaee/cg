import { z } from 'zod';
import {
  BRIDGE_NEEDS_ADMIN_LINE,
  BRIDGE_SESSION_STATES,
  ENGINE_STATES,
  engineNeedsAttention,
  engineStateText,
  isServerReachable,
  type BridgeSessionState,
  type ConnectionHealth,
  type EngineLine,
  type ServerHealth,
} from '@cg/shared-ipc';

/**
 * 🔴 `CENTRAL-BRIDGE-01` rule 13 (D10) — **`GET /health`: THE PLAYOUT READS IT, SO ITS SHAPE IS A
 * CONTRACT.**
 *
 * The Playout's engine reads `http://127.0.0.1:5280/health` and shows it in «اتصال به CG Control».
 * So it needs no authentication, holds no secret (no token, no password, no account name — the
 * Playout address and the station's own hosts and ports are not secrets), answers within a second —
 * it is built from what the bridge already holds, with no I/O on the request path — and has ONE
 * shape, {@link BridgeHealthSchema}, documented in `docs/integration/playout/CG-BRIDGE-FOR-PLAYOUT.md`
 * §1 and pinned by a schema test. A field is added only with a line in that document; none is ever
 * renamed or removed without a version the Playout team is told about.
 */

export const HEALTH_PATH = '/health';

/** The `app` every `/health` answer carries — how a reader knows it asked CG Bridge. */
export const HEALTH_APP = 'cg-bridge';

const ServerRowSchema = z.object({
  /** `A` = the server declared first (primary); `B` = the backup. */
  label: z.enum(['A', 'B']),
  /** The role it has NOW: after a failover, `B` is the primary. */
  role: z.enum(['primary', 'backup']),
  host: z.string(),
  amcpPort: z.number().int(),
  /** `up`: commands land. `connecting`: being reached. `down`: not reachable. */
  amcp: z.enum(['up', 'connecting', 'down']),
  /**
   * `subscribed`: the core sends OSC to our port (`OSC SUBSCRIBE`). `refused`: the core refused the
   * subscription. `unbound`: our OSC port could not be bound. `none`: not asked yet.
   */
  osc: z.enum(['subscribed', 'refused', 'unbound', 'none']),
  /** When OSC was last heard from this server (ISO 8601); `null` = not since the bridge started. */
  oscHeardAt: z.string().nullable(),
});

const ProblemSchema = z.object({
  code: z.enum([
    'reserved-port',
    'port-refused',
    'osc-unbound',
    'playout-session',
    // `RELEASE-0112-01` — the backup engine's session, and the guard (`B-313`).
    'backup-engine',
    'core-held',
    'core-shared',
  ]),
  message: z.string(),
});

/** `RELEASE-0112-01` (`R-085`) — the backup engine, as `/health` says it; `null` with no server B. */
const BackupEngineSchema = z
  .object({
    /** The backup engine's API address. */
    address: z.string(),
    /** CG Bridge's session on the backup engine. */
    session: z.enum(BRIDGE_SESSION_STATES),
    /** The backup engine's line, in one word (`ENGINE_STATES`). */
    state: z.enum(ENGINE_STATES),
    /** The last good D4 read of the backup engine, with its own token (ISO 8601); `null` = none. */
    lastReadAt: z.string().nullable(),
  })
  .strict();

export const BridgeHealthSchema = z
  .object({
    app: z.literal(HEALTH_APP),
    /** CG Bridge's version, `major.minor.patch`. */
    version: z.string(),
    /** When this process started (ISO 8601). */
    startedAt: z.string(),
    uptimeS: z.number().int().nonnegative(),
    casparcg: z
      .object({
        /**
         * The primary: `up` (commands land, OSC heard), `degraded` (commands land, OSC silent),
         * `down` (commands cannot land).
         */
        state: z.enum(['up', 'degraded', 'down']),
        servers: z.array(ServerRowSchema.strict()),
        /**
         * `RELEASE-0112-01` (`B-313`) — the CasparCG channels this bridge DRIVES (its declared
         * channels); empty for a bridge in first-run. Another CG Bridge reads it: a bridge that drives
         * nothing holds nobody.
         */
        channels: z.array(z.number().int().positive()),
      })
      .strict(),
    playout: z
      .object({
        /** The Playout this bridge reads (D4, D9, D10, D11); `null` when none is configured. */
        address: z.string().nullable(),
        /** CG Bridge's own Playout session (rule 8). */
        session: z.enum(BRIDGE_SESSION_STATES),
        /** The last good D4 read (ISO 8601); `null` = none yet. */
        lastReadAt: z.string().nullable(),
        /** `RELEASE-0112-01` — the backup engine; `null` with no server B. */
        backup: BackupEngineSchema.nullable(),
      })
      .strict(),
    /** Console connections open now, signed in or not. */
    consoles: z.number().int().nonnegative(),
    ports: z
      .object({ control: z.number().int(), templates: z.number().int(), osc: z.number().int() })
      .strict(),
    /** What stops this bridge working, in words. Empty when nothing does. */
    problems: z.array(ProblemSchema.strict()),
  })
  .strict();

export type BridgeHealth = z.infer<typeof BridgeHealthSchema>;
export type HealthProblem = z.infer<typeof ProblemSchema>;

/** What `/health` is built from — every value already held in memory. */
export interface HealthInputs {
  readonly version: string;
  readonly startedAtMs: number;
  readonly nowMs: number;
  readonly connection: ConnectionHealth;
  /** Each declared server's host and AMCP port, by label. */
  readonly endpoints: ReadonlyMap<'A' | 'B', { readonly host: string; readonly amcpPort: number }>;
  readonly oscStatus: ReadonlyMap<'A' | 'B', 'subscribed' | 'refused' | 'unbound'>;
  readonly playoutAddress: string | null;
  readonly session: BridgeSessionState;
  readonly lastPlayoutReadAtMs: number | null;
  /** `RELEASE-0112-01` — the channels this bridge drives (declared). */
  readonly channels: readonly number[];
  /** `RELEASE-0112-01` — the backup engine's line and session, or `null` with no server B. */
  readonly backup: {
    readonly line: EngineLine;
    readonly session: BridgeSessionState;
    readonly lastReadAtMs: number | null;
  } | null;
  /** `RELEASE-0112-01` — the primary engine's line (its `core-shared` is a problem). */
  readonly primaryLine: EngineLine | null;
  readonly consoles: number;
  readonly ports: { readonly control: number; readonly templates: number; readonly osc: number };
  /** Port problems found at start (rule 12) and at bind. */
  readonly portProblems: readonly HealthProblem[];
}

/** `/health`'s answer, from memory. Never throws; never reads a file or a socket. */
export function bridgeHealth(inputs: HealthInputs): BridgeHealth {
  const c = inputs.connection;
  const rows: z.infer<typeof ServerRowSchema>[] = [];
  const row = (server: ServerHealth, role: 'primary' | 'backup'): void => {
    const endpoint = inputs.endpoints.get(server.label);
    rows.push({
      label: server.label,
      role,
      host: endpoint?.host ?? '',
      amcpPort: endpoint?.amcpPort ?? 0,
      amcp: isServerReachable(server.state)
        ? 'up'
        : server.state === 'disconnected'
          ? 'down'
          : 'connecting',
      osc: inputs.oscStatus.get(server.label) ?? 'none',
      oscHeardAt: server.oscFreshAt ?? null,
    });
  };
  row(c.primary, 'primary');
  if (c.backup !== undefined) row(c.backup, 'backup');

  const problems: HealthProblem[] = [...inputs.portProblems];
  for (const r of rows) {
    if (r.osc === 'unbound') {
      problems.push({
        code: 'osc-unbound',
        message: `OSC from ${r.host}:${String(r.amcpPort)} cannot arrive: CG Bridge could not bind its OSC port.`,
      });
    }
  }
  if (inputs.session.state === 'needs-admin') {
    problems.push({ code: 'playout-session', message: BRIDGE_NEEDS_ADMIN_LINE });
  } else if (inputs.session.state === 'refused') {
    problems.push({
      code: 'playout-session',
      message: `CG Bridge: ${inputs.session.message ?? 'the Playout refuses to renew its session.'}`,
    });
  }
  // `RELEASE-0112-01` — the backup engine, and the guard (`B-313`), in the engine line's own words.
  const backupLine = inputs.backup?.line ?? null;
  if (backupLine !== null && backupLine.state === 'core-held') {
    problems.push({ code: 'core-held', message: `Backup engine: ${engineStateText(backupLine)}` });
  } else if (backupLine !== null && engineNeedsAttention(backupLine.state)) {
    problems.push({
      code: 'backup-engine',
      message: `CG Bridge on the backup engine: ${engineStateText(backupLine)}`,
    });
  }
  if (inputs.primaryLine?.state === 'core-shared') {
    problems.push({
      code: 'core-shared',
      message: `Primary engine: ${engineStateText(inputs.primaryLine)}`,
    });
  }

  const primary = c.primary;
  return {
    app: HEALTH_APP,
    version: inputs.version,
    startedAt: new Date(inputs.startedAtMs).toISOString(),
    uptimeS: Math.max(0, Math.floor((inputs.nowMs - inputs.startedAtMs) / 1000)),
    casparcg: {
      state:
        primary.state === 'healthy' ? 'up' : primary.state === 'degraded' ? 'degraded' : 'down',
      servers: rows,
      channels: [...inputs.channels],
    },
    playout: {
      address: inputs.playoutAddress,
      session: inputs.session.state,
      lastReadAt:
        inputs.lastPlayoutReadAtMs === null
          ? null
          : new Date(inputs.lastPlayoutReadAtMs).toISOString(),
      backup:
        inputs.backup === null || inputs.backup.line.address === null
          ? null
          : {
              address: inputs.backup.line.address,
              session: inputs.backup.session.state,
              state: inputs.backup.line.state,
              lastReadAt:
                inputs.backup.lastReadAtMs === null
                  ? null
                  : new Date(inputs.backup.lastReadAtMs).toISOString(),
            },
    },
    consoles: inputs.consoles,
    ports: { ...inputs.ports },
    problems,
  };
}
