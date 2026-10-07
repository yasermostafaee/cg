import { afterEach, describe, expect, it } from 'vitest';
import { createBridge, realProbes, type BridgeHandle } from '../src/index.js';
import { deadConnection, openClient, waitFor } from './support/auth-harness.js';
import { startFakePlayout, type FakePlayout } from './support/fake-playout.js';

/**
 * 🔴 `R-084` (`RELEASE-0111-01-A` A1) — **THE PLAYOUT'S VERSION, THROUGH A REAL CG BRIDGE.** A bridge
 * configured by its Playout's ADDRESS (as an installed CG Bridge is) reads `GET /api/v1/system/version`
 * at start with no token and no `Origin`, and the connection check's Versions group shows it. A
 * Playout that does not serve it reads `not served` there, and nothing else changes.
 */

let handle: BridgeHandle | null = null;
let playout: FakePlayout | null = null;

afterEach(async () => {
  await handle?.close();
  await playout?.stop();
  handle = null;
  playout = null;
});

async function station(): Promise<{ handle: BridgeHandle; playout: FakePlayout }> {
  playout = await startFakePlayout();
  handle = await createBridge({
    port: 0,
    connection: deadConnection(),
    playout: { auth: 'playout', address: playout.baseUrl },
    connectionCheckProbes: {
      ...realProbes(),
      processes: async () => [],
      systemProxy: async () => null,
      portHolder: async () => ({ kind: 'free' }),
      adapters: () => [],
    },
  });
  return { handle, playout };
}

const VERSION_PATH = '/api/v1/system/version';

async function versionLine(h: BridgeHandle, p: FakePlayout, id: string) {
  const client = await openClient(h);
  const admin = await p.issueToken({ user: 'admin', cgChannels: '*' });
  await client.authenticate(`a-${id}`, admin.token);
  const res = (
    await client.ask(id, 'setup.check', {
      playoutAddress: p.baseUrl,
      origin: 'http://127.0.0.1:5174',
    })
  ).payload as { lines: { id: string; status: string; text: string }[] };
  return res.lines;
}

describe('R-084 — the Playout’s version through a real CG Bridge', () => {
  it('🔴 CG Bridge reads it at start — no token, no Origin — and the Versions group shows it', async () => {
    const { handle: h, playout: p } = await station();
    await waitFor(() => p.requestLog.some((r) => r.path === VERSION_PATH), 5000);
    const asked = p.requestLog.filter((r) => r.path === VERSION_PATH);
    expect(asked[0]?.method).toBe('GET');
    expect(asked[0]?.headers.authorization).toBeUndefined();
    expect(asked[0]?.headers.origin).toBeUndefined();

    const lines = await versionLine(h, p, 'c1');
    expect(lines.find((l) => l.id === 'playout-version')).toEqual({
      id: 'playout-version',
      status: 'pass',
      text: 'Playout 2.9.2.',
    });
  });

  it('CONTROL — a Playout without it reads `not served`, and every other line of the check is unchanged', async () => {
    const { handle: h, playout: p } = await station();
    const served = await versionLine(h, p, 'c2');
    p.setVersion(null);
    const notServed = await versionLine(h, p, 'c3');
    expect(notServed.find((l) => l.id === 'playout-version')).toEqual({
      id: 'playout-version',
      status: 'skip',
      text: "The Playout's version: not served.",
    });
    const others = (lines: { id: string; status: string }[]) =>
      lines.filter((l) => l.id !== 'playout-version').map((l) => `${l.id}:${l.status}`);
    expect(others(notServed)).toEqual(others(served));
  });
});
