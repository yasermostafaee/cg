import { describe, expect, it } from 'vitest';
import { drivesCore, isOwnHealth } from '../src/core-guard.js';

/**
 * 🔴 `B-313` — **THE ONE PREDICATE: does the CG Bridge whose `/health` this is drive that core — on a
 * channel we write there?** The through-the-socket proof is `backup-session.integration.test.ts`; this pins
 * every edge of the reading. `RELEASE-0113-01`: redundancy belongs to a CHANNEL, so another bridge on the
 * backup core's OWN programme channel is no second sender on our mirror channel.
 */

const CORE = { host: '192.0.2.20', amcpPort: 5250 };
/** The channels THIS bridge writes on that core, in its own numbers — the backup's mirror of our CH 1. */
const OURS = [2];
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
  it('a bridge on the core’s machine, its loopback core at the same port, driving our channel: it drives it', () => {
    expect(drivesCore(health(), CORE, CORE.host, OURS)).toBe(true);
    // Named by the machine's address instead of loopback — the same core.
    expect(
      drivesCore(
        health({}, { servers: [{ host: '192.0.2.20', amcpPort: 5250 }] }),
        CORE,
        CORE.host,
        OURS,
      ),
    ).toBe(true);
  });

  it('🔴 an IDLE bridge (first-run: no channel) drives nothing — CONTROL: the same answer on our channel does', () => {
    expect(drivesCore(health({}, { channels: [] }), CORE, CORE.host, OURS)).toBe(false);
    expect(drivesCore(health({}, { channels: [2] }), CORE, CORE.host, OURS)).toBe(true);
  });

  it('🔴 RELEASE-0113-01 — another bridge on the core’s OWN programme channel (1) is no sender on our mirror (2)', () => {
    expect(drivesCore(health({}, { channels: [1] }), CORE, CORE.host, OURS)).toBe(false);
    // CONTROL: the same bridge on 1 AND 2 meets us.
    expect(drivesCore(health({}, { channels: [1, 2] }), CORE, CORE.host, OURS)).toBe(true);
    // And with nothing of ours in force on that core, nobody is a second sender.
    expect(drivesCore(health(), CORE, CORE.host, [])).toBe(false);
  });

  it('a `0.11.3` row’s own `channels` are read before the top-level list', () => {
    const rowOnly = (row: number[]) =>
      health(
        {},
        { servers: [{ host: '127.0.0.1', amcpPort: 5250, channels: row }], channels: [2] },
      );
    expect(drivesCore(rowOnly([1]), CORE, CORE.host, OURS)).toBe(false);
    expect(drivesCore(rowOnly([2]), CORE, CORE.host, OURS)).toBe(true);
  });

  it('a bridge OLDER than `0.11.2` (no channels field) counts as driving — unknown resolves to the safe side', () => {
    const old = health();
    delete (old.casparcg as { channels?: unknown }).channels;
    expect(drivesCore(old, CORE, CORE.host, OURS)).toBe(true);
  });

  it('another core (another port), another machine, or not a CG Bridge: not this core', () => {
    expect(
      drivesCore(
        health({}, { servers: [{ host: '127.0.0.1', amcpPort: 5251 }] }),
        CORE,
        CORE.host,
        OURS,
      ),
    ).toBe(false);
    expect(
      drivesCore(
        health({}, { servers: [{ host: '192.0.2.99', amcpPort: 5250 }] }),
        CORE,
        CORE.host,
        OURS,
      ),
    ).toBe(false);
    expect(drivesCore({ ...health(), app: 'something-else' }, CORE, CORE.host, OURS)).toBe(false);
    expect(drivesCore('not json', CORE, CORE.host, OURS)).toBe(false);
  });

  it('a bridge’s OWN /health never counts — the same start time and control port', () => {
    const self = { startedAt: '2026-10-04T08:00:00.000Z', controlPort: () => 5280 };
    expect(isOwnHealth(health(), self)).toBe(true);
    expect(isOwnHealth(health({ startedAt: '2026-10-04T08:00:01.000Z' }), self)).toBe(false);
    expect(isOwnHealth(health({ ports: { control: 5290 } }), self)).toBe(false);
  });
});
