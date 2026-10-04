import { describe, expect, it } from 'vitest';
import { drivesCore, isOwnHealth } from '../src/core-guard.js';

/**
 * 🔴 `B-313` — **THE ONE PREDICATE: does the CG Bridge whose `/health` this is drive that core?** The
 * through-the-socket proof is `backup-session.integration.test.ts`; this pins every edge of the reading.
 */

const CORE = { host: '192.0.2.20', amcpPort: 5250 };
const health = (over: Record<string, unknown> = {}, casparcg: Record<string, unknown> = {}) => ({
  app: 'cg-bridge',
  startedAt: '2026-10-04T08:00:00.000Z',
  ports: { control: 5280 },
  casparcg: {
    servers: [{ label: 'A', host: '127.0.0.1', amcpPort: 5250 }],
    channels: [2],
    ...casparcg,
  },
  ...over,
});

describe('B-313 — drivesCore', () => {
  it('a bridge on the core’s machine, its loopback core at the same port, driving a channel: it drives it', () => {
    expect(drivesCore(health(), CORE, CORE.host)).toBe(true);
    // Named by the machine's address instead of loopback — the same core.
    expect(
      drivesCore(
        health({}, { servers: [{ host: '192.0.2.20', amcpPort: 5250 }] }),
        CORE,
        CORE.host,
      ),
    ).toBe(true);
  });

  it('🔴 an IDLE bridge (first-run: no channel) drives nothing — CONTROL: the same answer with a channel does', () => {
    expect(drivesCore(health({}, { channels: [] }), CORE, CORE.host)).toBe(false);
    expect(drivesCore(health({}, { channels: [1] }), CORE, CORE.host)).toBe(true);
  });

  it('a bridge OLDER than this (no channels field) counts as driving — unknown resolves to the safe side', () => {
    const old = health();
    delete (old.casparcg as { channels?: unknown }).channels;
    expect(drivesCore(old, CORE, CORE.host)).toBe(true);
  });

  it('another core (another port), another machine, or not a CG Bridge: not this core', () => {
    expect(
      drivesCore(health({}, { servers: [{ host: '127.0.0.1', amcpPort: 5251 }] }), CORE, CORE.host),
    ).toBe(false);
    expect(
      drivesCore(
        health({}, { servers: [{ host: '192.0.2.99', amcpPort: 5250 }] }),
        CORE,
        CORE.host,
      ),
    ).toBe(false);
    expect(drivesCore({ ...health(), app: 'something-else' }, CORE, CORE.host)).toBe(false);
    expect(drivesCore('not json', CORE, CORE.host)).toBe(false);
  });

  it('a bridge’s OWN /health never counts — the same start time and control port', () => {
    const self = { startedAt: '2026-10-04T08:00:00.000Z', controlPort: () => 5280 };
    expect(isOwnHealth(health(), self)).toBe(true);
    expect(isOwnHealth(health({ startedAt: '2026-10-04T08:00:01.000Z' }), self)).toBe(false);
    expect(isOwnHealth(health({ ports: { control: 5290 } }), self)).toBe(false);
  });
});
