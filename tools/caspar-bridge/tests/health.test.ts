import { describe, expect, it } from 'vitest';
import type { ConnectionHealth } from '@cg/shared-ipc';
import { BridgeHealthSchema, bridgeHealth, type HealthInputs } from '../src/health.js';

/**
 * 🔴 `CENTRAL-BRIDGE-01` rule 13 (D10) — `/health`'s shape is a contract with the Playout team: this
 * test pins it field by field (the schema is `.strict()`, so a field added without the document and
 * this test fails here), and pins what it must never carry.
 */

const START = Date.parse('2026-09-30T08:00:00.000Z');

function connection(overrides: Partial<ConnectionHealth> = {}): ConnectionHealth {
  return {
    primary: {
      label: 'A',
      state: 'healthy',
      amcpAxisOk: true,
      oscFreshAt: '2026-09-30T08:59:59.000Z',
    },
    currentPrimary: 'A',
    strategy: 'mirror-sync',
    ...overrides,
  };
}

function inputs(overrides: Partial<HealthInputs> = {}): HealthInputs {
  return {
    version: '0.10.0',
    startedAtMs: START,
    nowMs: START + 3_600_500,
    connection: connection(),
    endpoints: new Map([['A', { host: '127.0.0.1', amcpPort: 5250 }]]),
    oscStatus: new Map([['A', 'subscribed']]),
    playoutAddress: 'http://127.0.0.1:8080',
    session: { state: 'signed-in', name: 'cg-admin' },
    lastPlayoutReadAtMs: START + 3_595_000,
    consoles: 2,
    ports: { control: 5280, templates: 7911, osc: 6251 },
    portProblems: [],
    channels: [2],
    backup: null,
    primaryLine: null,
    ...overrides,
  };
}

describe('the fixed shape', () => {
  it('🔴 a healthy single-server bridge, exactly — the example the Playout document quotes', () => {
    const health = bridgeHealth(inputs());
    expect(health).toEqual({
      app: 'cg-bridge',
      version: '0.10.0',
      startedAt: '2026-09-30T08:00:00.000Z',
      uptimeS: 3600,
      casparcg: {
        state: 'up',
        servers: [
          {
            label: 'A',
            role: 'primary',
            host: '127.0.0.1',
            amcpPort: 5250,
            amcp: 'up',
            osc: 'subscribed',
            oscHeardAt: '2026-09-30T08:59:59.000Z',
          },
        ],
        // `RELEASE-0112-01` (`B-313`) — the channels it drives: another CG Bridge reads this.
        channels: [2],
      },
      playout: {
        address: 'http://127.0.0.1:8080',
        session: 'signed-in',
        lastReadAt: '2026-09-30T08:59:55.000Z',
        // `RELEASE-0112-01` (`R-085`) — no server B, no backup engine.
        backup: null,
      },
      consoles: 2,
      ports: { control: 5280, templates: 7911, osc: 6251 },
      problems: [],
    });
    expect(BridgeHealthSchema.safeParse(health).success).toBe(true);
  });

  it('the schema refuses an extra field anywhere — a field is added with the document, never silently', () => {
    const health = bridgeHealth(inputs());
    expect(BridgeHealthSchema.safeParse({ ...health, token: 'x' }).success).toBe(false);
    expect(
      BridgeHealthSchema.safeParse({
        ...health,
        playout: { ...health.playout, account: 'cg-admin' },
      }).success,
    ).toBe(false);
  });

  it("🔴 NO SECRET: the session's account name is never in it", () => {
    const text = JSON.stringify(bridgeHealth(inputs()));
    expect(text).not.toContain('cg-admin');
  });
});

describe('the states it reports', () => {
  it('a backup, a failover, a silent OSC and a core that is down', () => {
    const health = bridgeHealth(
      inputs({
        connection: connection({
          primary: { label: 'B', state: 'degraded', amcpAxisOk: true },
          backup: { label: 'A', state: 'disconnected', amcpAxisOk: false },
          currentPrimary: 'B',
        }),
        endpoints: new Map([
          ['A', { host: '127.0.0.1', amcpPort: 5250 }],
          ['B', { host: '192.0.2.21', amcpPort: 5250 }],
        ]),
        oscStatus: new Map([
          ['A', 'unbound'],
          ['B', 'refused'],
        ]),
      }),
    );
    expect(health.casparcg.state).toBe('degraded');
    expect(health.casparcg.servers).toEqual([
      {
        label: 'B',
        role: 'primary',
        host: '192.0.2.21',
        amcpPort: 5250,
        amcp: 'up',
        osc: 'refused',
        oscHeardAt: null,
      },
      {
        label: 'A',
        role: 'backup',
        host: '127.0.0.1',
        amcpPort: 5250,
        amcp: 'down',
        osc: 'unbound',
        oscHeardAt: null,
      },
    ]);
    expect(health.problems.map((p) => p.code)).toEqual(['osc-unbound']);
  });

  it('a bridge with no Playout session says so as a problem, in the line every console shows', () => {
    const health = bridgeHealth(inputs({ session: { state: 'needs-admin' } }));
    expect(health.playout.session).toBe('needs-admin');
    expect(health.problems).toEqual([
      { code: 'playout-session', message: 'CG Bridge needs a station admin to sign in' },
    ]);
  });

  it('a reserved port found at start is carried as it was worded', () => {
    const problem = { code: 'reserved-port' as const, message: 'TCP 5280 (consoles) is inside…' };
    expect(bridgeHealth(inputs({ portProblems: [problem] })).problems).toEqual([problem]);
  });
});

/**
 * 🔴 `RELEASE-0112-01` — the backup engine (`R-085`) and the guard (`B-313`) on `/health`, in the engine
 * line's own words; an idle bridge drives no channel.
 */
describe('RELEASE-0112-01 — the backup engine and the guard', () => {
  const backupLine = (state: 'signed-in' | 'needs-admin' | 'not-licensed' | 'core-held') => ({
    engine: 'backup' as const,
    address: 'http://192.0.2.20:8080',
    state,
    ...(state === 'core-held' ? { message: '192.0.2.20:5280' } : {}),
    version: '2.9.2',
  });

  it('a signed-in backup: its address, session and state, its last D4 read — and no problem', () => {
    const health = bridgeHealth(
      inputs({
        backup: {
          line: backupLine('signed-in'),
          session: { state: 'signed-in', name: 'cg-admin' },
          lastReadAtMs: START + 3_590_000,
        },
      }),
    );
    expect(health.playout.backup).toEqual({
      address: 'http://192.0.2.20:8080',
      session: 'signed-in',
      state: 'signed-in',
      lastReadAt: '2026-09-30T08:59:50.000Z',
    });
    expect(health.problems).toEqual([]);
    expect(BridgeHealthSchema.safeParse(health).success).toBe(true);
    expect(JSON.stringify(health)).not.toContain('cg-admin');
  });

  it('a backup that needs a sign-in, or is not licensed, is a problem in words; one held by another bridge is `core-held`', () => {
    const problemsFor = (state: 'needs-admin' | 'not-licensed' | 'core-held') =>
      bridgeHealth(
        inputs({
          backup: {
            line: backupLine(state),
            session: { state: 'needs-admin' },
            lastReadAtMs: null,
          },
        }),
      ).problems;
    expect(problemsFor('needs-admin')).toEqual([
      {
        code: 'backup-engine',
        message: 'CG Bridge on the backup engine: Needs a station admin to sign in.',
      },
    ]);
    expect(problemsFor('not-licensed')).toEqual([
      {
        code: 'backup-engine',
        message: 'CG Bridge on the backup engine: CG not licensed on this engine.',
      },
    ]);
    expect(problemsFor('core-held')).toEqual([
      {
        code: 'core-held',
        message:
          "Backup engine: Another CG Bridge drives this engine's CasparCG (192.0.2.20:5280); nothing is sent to it.",
      },
    ]);
  });

  it('an idle bridge (first-run) drives no channel', () => {
    expect(bridgeHealth(inputs({ channels: [] })).casparcg.channels).toEqual([]);
  });
});
