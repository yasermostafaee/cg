import { describe, expect, it } from 'vitest';
import { CoreGuard, drivesCore, isOwnHealth } from '../src/core-guard.js';

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

describe('🔴 RELEASE-0113-01 + B-313 — a backup channel is CLEARED only by a reading made WITH it', () => {
  /** A guard over server B at `CORE`, whose neighbour answers `body` when the test releases each read. */
  function rig(body: () => unknown) {
    let ours: number[] = [];
    const pending: (() => void)[] = [];
    const held: boolean[] = [];
    const guard = new CoreGuard({
      servers: () => ({ A: { host: '127.0.0.1', amcpPort: 5250 }, B: CORE }),
      channels: () => ({ A: [1], B: ours }),
      peerPort: () => 5280,
      self: { startedAt: 'this-bridge', controlPort: () => 5280 },
      holdB: (h) => {
        held.push(h);
        return Promise.resolve();
      },
      pollMs: 3_600_000,
      fetchImpl: (() =>
        new Promise<Response>((resolve) => {
          pending.push(() => resolve(new Response(JSON.stringify(body()), { status: 200 })));
        })) as typeof fetch,
      log: () => undefined,
    });
    /** Release the next reading's `/health` — and fail, by name, when no reading was made. */
    const answer = async (): Promise<void> => {
      const deadline = Date.now() + 1_000;
      while (pending.length === 0) {
        if (Date.now() > deadline) throw new Error('no reading of server B’s machine was made');
        await new Promise((r) => setTimeout(r, 1));
      }
      pending.shift()?.();
      await new Promise((r) => setTimeout(r, 5));
    };
    return {
      guard,
      held,
      setOurs: (next: number[]) => {
        ours = next;
      },
      answer,
    };
  }

  it('nothing is cleared before the first answer; a reading WITH our 2 and nobody driving it clears 2 — and only 2', async () => {
    const r = rig(() => health({}, { channels: [1] }));
    r.setOurs([2]);
    void r.guard.refresh();
    expect(r.guard.clearsB(2)).toBe(false);
    await r.answer();
    expect(r.guard.clearsB(2)).toBe(true);
    expect(r.guard.clearsB(3)).toBe(false);
  });

  it('🔴 a channel that comes into force AFTER a reading is not cleared by it — only by the next one', async () => {
    const r = rig(() => health({}, { channels: [1] }));
    void r.guard.refresh();
    await r.answer();
    r.setOurs([2]);
    expect(r.guard.clearsB(2), 'the reading was made without 2').toBe(false);
    void r.guard.refresh();
    await r.answer();
    expect(r.guard.clearsB(2)).toBe(true);
  });

  it('🔴 a refresh asked for WHILE a reading runs is one more reading after it — never the stale one’s answer', async () => {
    const r = rig(() => health({}, { channels: [1] }));
    const first = r.guard.refresh();
    // The mapping comes into force while the first reading (made with nothing of ours) is in flight.
    r.setOurs([2]);
    const again = r.guard.refresh();
    await r.answer();
    await first;
    expect(r.guard.clearsB(2), 'the first reading did not include 2').toBe(false);
    await r.answer();
    await again;
    expect(r.guard.probes).toBe(2);
    expect(r.guard.clearsB(2)).toBe(true);
  });

  it('🔴 a neighbour driving our 2 clears nothing and holds server B — CONTROL: the same reading of its 1 clears 2', async () => {
    let theirs = [2];
    const r = rig(() => health({}, { channels: theirs }));
    r.setOurs([2]);
    void r.guard.refresh();
    await r.answer();
    expect(r.guard.clearsB(2)).toBe(false);
    expect(r.held.at(-1)).toBe(true);
    theirs = [1];
    void r.guard.refresh();
    await r.answer();
    expect(r.guard.clearsB(2)).toBe(true);
    expect(r.held.at(-1)).toBe(false);
  });
});
