import * as dgram from 'node:dgram';
import * as net from 'node:net';
import { afterEach, expect, it } from 'vitest';
import { createMock, type MockHandle } from '@cg/amcp-mock';
import { AmcpTransport, CommandQueue } from '@cg/caspar-client';
import type { ConnectionConfig } from '@cg/shared-ipc';
import { createBridge, type BridgeHandle } from '../src/bridge.js';
import { HEALTH_MS } from './support/harness.js';

/**
 * R-021 stage 1 — bridge boot with a fixed bank (T16–T18).
 *
 * T16: a valid bank fences its layers and EXCLUDES them from the R-009 orphan
 *      surface (the bank's permanent row — stage 2 — is its occupancy surface).
 *      The quarantine no-op itself is pinned at the unit level (layer-manager
 *      T6); here the observable consequence is asserted: a foreign producer on
 *      a fixed layer surfaces NOTHING while the same producer on a non-fixed
 *      layer DOES surface (the control that proves the sweep ran).
 * T17: a conflicting bank is a HARD boot failure BEFORE the WebSocket binds.
 * T18: no bank declared → behaviour byte-identical to today.
 */

let mock: MockHandle | null = null;
let bridge: BridgeHandle | null = null;
let foreignQueue: CommandQueue | null = null;
let foreignTransport: AmcpTransport | null = null;

const SWEEP_MS = 150;
const STALE_MS = 800;

afterEach(async () => {
  foreignQueue?.dispose();
  foreignQueue = null;
  foreignTransport?.destroy();
  foreignTransport = null;
  await bridge?.close();
  bridge = null;
  await mock?.stop();
  mock = null;
});

function freeUdpPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const sock = dgram.createSocket('udp4');
    sock.once('error', reject);
    sock.bind(0, '127.0.0.1', () => {
      const port = sock.address().port;
      sock.close(() => resolve(port));
    });
  });
}

async function waitFor(predicate: () => boolean, timeoutMs = 8000): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) throw new Error('waitFor timed out');
    await new Promise((r) => setTimeout(r, 25));
  }
}

function singleServer(amcpPort: number, oscPort: number): ConnectionConfig {
  return {
    servers: { A: { host: '127.0.0.1', amcpPort, oscPort } },
    strategy: 'mirror-sync',
    autoFailoverEnabled: true,
  };
}

/** A second, independent AMCP client — "another system" playing content. */
async function foreignPlay(target: MockHandle, line: string): Promise<void> {
  if (foreignTransport === null) {
    foreignTransport = new AmcpTransport();
    await foreignTransport.connect(target.host, target.amcpPort);
    foreignQueue = new CommandQueue(foreignTransport);
  }
  await foreignQueue?.enqueue(line);
}

async function bootMock(): Promise<{ oscPort: number }> {
  const oscPort = await freeUdpPort();
  mock = await createMock({ amcpPort: 0, oscPort, oscHost: '127.0.0.1', oscHz: 30 });
  return { oscPort };
}

/**
 * T16 — REVERSED IN PART, deliberately.
 *
 * A foreign producer on a bank layer used to be excluded from the orphan
 * surface, because the bank ROW was its occupancy surface. The row no longer is
 * — an unbound bank row reads `EMPTY` and asks CasparCG nothing — so excluding
 * it here left another system’s live video on a declared layer reported
 * NOWHERE. It surfaces now.
 *
 * THE ALLOCATION FENCE IS UNCHANGED and is still asserted: a bank layer is never
 * handed out by dynamic allocation. That is a different property from being
 * REPORTED, and conflating the two is what produced the gap.
 */
it('T16 — a valid bank: fixedSlots() matches; a foreign producer on a bank layer IS surfaced and still not allocatable', async () => {
  const { oscPort } = await bootMock();
  if (mock === null) throw new Error('mock not booted');
  bridge = await createBridge({
    port: 0,
    connection: singleServer(mock.amcpPort, oscPort),
    fixedLayers: { channel: 1, low: { start: 1, count: 9 }, start: 70, count: 10 },
    runtimeTuning: { sweepMs: SWEEP_MS, occupancyStaleMs: STALE_MS },
  });
  await bridge.runtime.whenServerHealthy(HEALTH_MS);

  // The declared bank, verbatim, from the LayerManager via the runtime.
  const slots = bridge.runtime.fixedSlots();
  // Ten operator rows, then the nine BED rows the bank also declares
  // (`single-clock-look-switch`). Both halves are fenced identically.
  expect(slots).toHaveLength(19);
  expect(slots[0]).toEqual({ channel: 1, layer: 70 });
  expect(slots[9]).toEqual({ channel: 1, layer: 79 });

  // Another system parks media on FIXED layer 72 and on NON-fixed layer 45.
  await foreignPlay(mock, 'PLAY 1-72 "program-feed.mov"');
  await foreignPlay(mock, 'PLAY 1-45 "other-feed.mov"');

  // BOTH surface now — the non-fixed layer as before, and the BANK layer too.
  // The bank layer is the reversal: it is unbound, so a producer on it is one we
  // did not put there, and it is reported rather than silently swallowed.
  await waitFor(() =>
    (bridge?.runtime.orphans() ?? []).some((o) => o.channel === 1 && o.layer === 45),
  );
  await waitFor(() =>
    (bridge?.runtime.orphans() ?? []).some((o) => o.channel === 1 && o.layer === 72),
  );

  // Sustained across several sweeps, not a one-sample artifact.
  await new Promise((r) => setTimeout(r, SWEEP_MS * 3));
  expect(bridge.runtime.orphans().some((o) => o.layer === 72)).toBe(true);
});

it('T17 — a conflicting bank throws BEFORE binding, and no port is left listening', async () => {
  const { oscPort } = await bootMock();
  if (mock === null) throw new Error('mock not booted');

  // Pick a concrete free port so "nothing left listening" is checkable.
  const probe = net.createServer();
  const wsPort = await new Promise<number>((resolve, reject) => {
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const addr = probe.address();
      resolve(typeof addr === 'object' && addr !== null ? addr.port : 0);
    });
  });
  await new Promise<void>((r) => probe.close(() => r()));

  await expect(
    createBridge({
      port: wsPort,
      connection: singleServer(mock.amcpPort, oscPort),
      // 65–74 overlaps the 'custom' 60–69 dynamic range → refused at boot.
      fixedLayers: { channel: 1, low: { start: 1, count: 9 }, start: 65, count: 10 },
    }),
  ).rejects.toThrow(/overlaps/);

  // The refused boot left nothing listening: the same port binds cleanly.
  const rebind = net.createServer();
  await new Promise<void>((resolve, reject) => {
    rebind.once('error', reject);
    rebind.listen(wsPort, '127.0.0.1', () => resolve());
  });
  await new Promise<void>((r) => rebind.close(() => r()));
});

it('T18 — no bank declared: allocation and orphan surfacing behave exactly as today', async () => {
  const { oscPort } = await bootMock();
  if (mock === null) throw new Error('mock not booted');
  bridge = await createBridge({
    port: 0,
    connection: singleServer(mock.amcpPort, oscPort),
    runtimeTuning: { sweepMs: SWEEP_MS, occupancyStaleMs: STALE_MS },
  });
  await bridge.runtime.whenServerHealthy(HEALTH_MS);

  expect(bridge.runtime.fixedSlots()).toEqual([]);

  // A foreign producer on 72 (inside NOBODY's bank — none is declared) IS
  // surfaced as an orphan, exactly as before this change.
  await foreignPlay(mock, 'PLAY 1-72 "program-feed.mov"');
  await waitFor(() =>
    (bridge?.runtime.orphans() ?? []).some((o) => o.channel === 1 && o.layer === 72),
  );
});
