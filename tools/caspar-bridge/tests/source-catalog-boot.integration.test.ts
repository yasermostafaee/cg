import * as dgram from 'node:dgram';
import * as fs from 'node:fs';
import * as net from 'node:net';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { createMock, type MockHandle } from '@cg/amcp-mock';
import type { ConnectionConfig, SourceCatalog } from '@cg/shared-ipc';
import { createBridge, type BridgeHandle } from '../src/bridge.js';
import { HEALTH_MS } from './support/harness.js';

/**
 * D-137 / C-015 phase 4 — the live source CATALOG and the per-plate ASSIGNMENTS
 * at BOOT.
 *
 * Shaped on `fixed-layers-boot.integration.test.ts` T17/T18, because the
 * property is the same one: config that conflicts must resolve LOUDLY at
 * startup, before a single client is served, rather than at a take. What differs
 * is the direction of the absent case — an absent bank falls back to the
 * built-in default, an absent CATALOG falls back to nothing, and S1 is the pin
 * on that difference.
 *
 * 🔴 `PLAYOUT-SOURCES-01` REWROTE TWO OF THEM, deliberately. The Playout defines the sources now:
 * the file's `layerRange` (the plate band) is still read, its hand-made `sources` are IGNORED and
 * never deleted (P-031, S5), and nothing is PRUNED at boot any more — an assignment naming a source
 * the catalogue does not have is KEPT, and only an operator removes a binding (ADR 0010 rule 14, S7).
 */

let mock: MockHandle | null = null;
let bridge: BridgeHandle | null = null;
const dirs: string[] = [];

afterEach(async () => {
  await bridge?.close();
  bridge = null;
  await mock?.stop();
  mock = null;
  while (dirs.length > 0) {
    const dir = dirs.pop();
    if (dir !== undefined) fs.rmSync(dir, { recursive: true, force: true });
  }
});

function tmpDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-source-catalog-boot-'));
  dirs.push(dir);
  return dir;
}

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

function singleServer(amcpPort: number, oscPort: number): ConnectionConfig {
  return {
    servers: { A: { host: '127.0.0.1', amcpPort, oscPort } },
    strategy: 'mirror-sync',
    autoFailoverEnabled: true,
  };
}

async function bootMock(): Promise<{ oscPort: number }> {
  const oscPort = await freeUdpPort();
  mock = await createMock({ amcpPort: 0, oscPort, oscHost: '127.0.0.1', oscHz: 30 });
  return { oscPort };
}

/** A concrete free port, so "nothing left listening" is checkable. */
async function reserveFreePort(): Promise<number> {
  const probe = net.createServer();
  const port = await new Promise<number>((resolve, reject) => {
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const addr = probe.address();
      resolve(typeof addr === 'object' && addr !== null ? addr.port : 0);
    });
  });
  await new Promise<void>((r) => probe.close(() => r()));
  return port;
}

async function expectNothingListening(port: number): Promise<void> {
  const rebind = net.createServer();
  await new Promise<void>((resolve, reject) => {
    rebind.once('error', reject);
    rebind.listen(port, '127.0.0.1', () => resolve());
  });
  await new Promise<void>((r) => rebind.close(() => r()));
}

it('S1 — an ABSENT catalog file boots normally with ZERO sources, and no guessed default', async () => {
  const { oscPort } = await bootMock();
  if (mock === null) throw new Error('mock not booted');
  bridge = await createBridge({
    port: 0,
    connection: singleServer(mock.amcpPort, oscPort),
    sourceCatalogPath: path.join(tmpDir(), 'bridge-source-catalog.json'),
  });
  await bridge.runtime.whenServerHealthy(HEALTH_MS);

  // Nothing is defined. That is FAIL-CLOSED and it is the point: with no file,
  // no plate can be assigned, nothing reaches air, and each take carrying a
  // live plate refuses legibly.
  expect(bridge.runtime.sourceCatalog()).toEqual({ sources: [] });
  expect(bridge.sourceCatalog.source).toBe('absent');
  expect(bridge.runtime.sourceAssignments()).toEqual({ assignments: [] });
});

it('S2 — a PRESENT but unusable catalog throws BEFORE binding, and no port is left listening', async () => {
  const { oscPort } = await bootMock();
  if (mock === null) throw new Error('mock not booted');
  const wsPort = await reserveFreePort();
  const file = path.join(tmpDir(), 'bridge-source-catalog.json');
  // Schema-invalid: a producer kind nothing can play. Half of this file parses,
  // and serving that half is exactly what must not happen.
  fs.writeFileSync(
    file,
    JSON.stringify({
      sources: [
        { id: 'src-aaa', name: 'Studio A', producer: { kind: 'route', channel: 2 } },
        { id: 'src-bbb', name: 'Baku', producer: { kind: 'sdi', device: 3 } },
      ],
    }),
    'utf8',
  );

  await expect(
    createBridge({
      port: wsPort,
      connection: singleServer(mock.amcpPort, oscPort),
      sourceCatalogPath: file,
    }),
  ).rejects.toThrow(/present but unusable/);

  await expectNothingListening(wsPort);
});

it('S3 — a band overlapping the candidate bank throws BEFORE binding, naming both ranges', async () => {
  const { oscPort } = await bootMock();
  if (mock === null) throw new Error('mock not booted');
  const wsPort = await reserveFreePort();

  await expect(
    createBridge({
      port: wsPort,
      connection: singleServer(mock.amcpPort, oscPort),
      fixedLayers: { channel: 1, low: { start: 50, count: 9 }, start: 70, count: 30 },
      // 50–75 reaches into the operator's candidate bank.
      sourceCatalog: { sources: [], layerRange: { start: 50, end: 75 } },
    }),
  ).rejects.toThrow(/50-75.*70-99/s);

  await expectNothingListening(wsPort);
});

it('S4 — a band overlapping the RESERVED playout range throws BEFORE binding', async () => {
  const { oscPort } = await bootMock();
  if (mock === null) throw new Error('mock not booted');
  const wsPort = await reserveFreePort();

  await expect(
    createBridge({
      port: wsPort,
      connection: singleServer(mock.amcpPort, oscPort),
      reservedLayers: { ranges: [{ from: 60, to: 69 }] },
      sourceCatalog: { sources: [], layerRange: { start: 55, end: 65 } },
    }),
  ).rejects.toThrow(/reserved playout range/);

  await expectNothingListening(wsPort);
});

it('S5 — the file’s BAND is in force before the first client is served; its hand-made sources are ignored, never deleted', async () => {
  const { oscPort } = await bootMock();
  if (mock === null) throw new Error('mock not booted');
  const file = path.join(tmpDir(), 'bridge-source-catalog.json');
  const value: SourceCatalog = {
    sources: [
      {
        id: 'src-aaa',
        name: 'Studio A',
        format: '1080i5000',
        producer: { kind: 'route', channel: 2 },
      },
    ],
    layerRange: { start: 60, end: 69 },
  };
  const written = JSON.stringify(value);
  fs.writeFileSync(file, written, 'utf8');

  bridge = await createBridge({
    port: 0,
    connection: singleServer(mock.amcpPort, oscPort),
    sourceCatalogPath: file,
  });

  // Read WITHOUT awaiting health: the load happens before the WebSocket binds,
  // so it is already answerable the moment `createBridge` resolves.
  // `PLAYOUT-SOURCES-01` — the band is in force and the sources are the Playout's (none read yet):
  // the hand-made entry is not migrated (P-031) …
  expect(bridge.runtime.sourceCatalog()).toEqual({
    sources: [],
    layerRange: { start: 60, end: 69 },
  });
  expect(bridge.sourceCatalog.source).toBe('file');
  // … and not deleted either: the file is exactly what was written.
  expect(fs.readFileSync(file, 'utf8')).toBe(written);
});

it('S6 — a change is validated against the SAME bank and reservation the boot saw', async () => {
  const { oscPort } = await bootMock();
  if (mock === null) throw new Error('mock not booted');
  bridge = await createBridge({
    port: 0,
    connection: singleServer(mock.amcpPort, oscPort),
    // `LAYER-BANDS-16` — beds 50-58 < band 60-69 < reservation 70-79 < bank 80-99. All
    // three refusals below need their own space, and the bank questions are asked before
    // the reserved one, so a band under the beds would never reach the reserved arm.
    fixedLayers: { channel: 1, low: { start: 50, count: 9 }, start: 80, count: 20 },
    reservedLayers: { ranges: [{ from: 70, to: 79 }] },
    sourceCatalog: { sources: [], layerRange: { start: 60, end: 69 } },
  });
  await bridge.runtime.whenServerHealthy(HEALTH_MS);

  // AT CHANGE is the half that gets forgotten, and it is the half an operator
  // can trigger with a graphic on air.
  const intoBank = bridge.runtime.setSourceCatalog({
    sources: [],
    layerRange: { start: 60, end: 85 },
  });
  expect(intoBank).toMatchObject({ ok: false, reason: 'overlaps-fixed-bank' });

  const intoReserved = bridge.runtime.setSourceCatalog({
    sources: [],
    layerRange: { start: 60, end: 72 },
  });
  expect(intoReserved).toMatchObject({ ok: false, reason: 'overlaps-reserved' });

  // The refusals left the catalog in force untouched.
  expect(bridge.runtime.sourceCatalog().layerRange).toEqual({ start: 60, end: 69 });

  const ok = bridge.runtime.setSourceCatalog({
    sources: [{ id: 'src-aaa', name: 'Studio A', producer: { kind: 'route', channel: 2 } }],
    layerRange: { start: 60, end: 69 },
  });
  expect(ok).toEqual({ ok: true });
  expect(bridge.runtime.sourceCatalog().sources).toHaveLength(1);
});

it('S7 — an assignment naming a source the catalog does not have is KEPT at boot, never pruned', async () => {
  const { oscPort } = await bootMock();
  if (mock === null) throw new Error('mock not booted');
  const assignmentsFile = path.join(tmpDir(), 'bridge-source-assignments.json');
  // The catalog knows `src-aaa` and nothing else, while the assignments still point one plate
  // at `src-gone` — an input the Playout no longer lists, say, before its first read.
  const written = {
    assignments: [
      { templateId: 'tpl-1', plateId: 'guest-1', sourceId: 'src-aaa' },
      { templateId: 'tpl-1', plateId: 'guest-2', sourceId: 'src-gone' },
    ],
  };
  fs.writeFileSync(assignmentsFile, JSON.stringify(written), 'utf8');

  bridge = await createBridge({
    port: 0,
    connection: singleServer(mock.amcpPort, oscPort),
    sourceCatalog: {
      sources: [{ id: 'src-aaa', name: 'Studio A', producer: { kind: 'route', channel: 2 } }],
    },
    sourceAssignmentsPath: assignmentsFile,
  });

  /*
    🔴 `PLAYOUT-SOURCES-01` §1.C — it BOOTED, and BOTH bindings are still there. The catalogue is
    rebuilt from Playout reads, so an entry missing at boot says nothing about whether the binding
    is wrong — an outage or a first boot looks exactly like this. Only an operator action removes
    a binding (ADR 0010 rule 14); the take of `guest-2` refuses by name until then.
  */
  expect(bridge.runtime.sourceAssignments().assignments).toEqual(written.assignments);
  // Control: the store read the file at all — the handle names where the assignments came from.
  expect(bridge.sourceAssignments.source).toBe('file');
  expect('pruned' in bridge.sourceAssignments).toBe(false);
});

it('S8 — deleting a source CASCADES: the delete is allowed, the binding never dangles', async () => {
  const { oscPort } = await bootMock();
  if (mock === null) throw new Error('mock not booted');
  bridge = await createBridge({
    port: 0,
    connection: singleServer(mock.amcpPort, oscPort),
    sourceCatalog: {
      sources: [
        { id: 'src-aaa', name: 'Studio A', producer: { kind: 'route', channel: 2 } },
        { id: 'src-bbb', name: 'Baku', producer: { kind: 'route', channel: 3 } },
      ],
    },
    sourceAssignments: {
      assignments: [
        { templateId: 'tpl-1', plateId: 'guest-1', sourceId: 'src-aaa' },
        { templateId: 'tpl-1', plateId: 'guest-2', sourceId: 'src-bbb' },
      ],
    },
  });
  await bridge.runtime.whenServerHealthy(HEALTH_MS);

  const seen: number[] = [];
  bridge.runtime.sourceAssignmentsChanged.subscribe((a) => seen.push(a.assignments.length));

  const result = bridge.runtime.setSourceCatalog({
    sources: [{ id: 'src-aaa', name: 'Studio A', producer: { kind: 'route', channel: 2 } }],
  });

  // ALLOWED — an installation must be able to retire a live — and it REPORTS
  // which plates referenced it, so the surface can say so at the moment of
  // deletion rather than leaving the operator to meet it at a take.
  expect(result).toMatchObject({ ok: true });
  expect(result.droppedAssignments).toEqual([
    { templateId: 'tpl-1', plateId: 'guest-2', sourceId: 'src-bbb' },
  ]);
  expect(bridge.runtime.sourceAssignments().assignments).toEqual([
    { templateId: 'tpl-1', plateId: 'guest-1', sourceId: 'src-aaa' },
  ]);
  // Every connected browser is told, because no browser asked for this change.
  expect(seen).toEqual([1]);
});

it('S9 — an assignment naming an unknown source is REFUSED at change, not silently pruned', async () => {
  const { oscPort } = await bootMock();
  if (mock === null) throw new Error('mock not booted');
  bridge = await createBridge({
    port: 0,
    connection: singleServer(mock.amcpPort, oscPort),
    sourceCatalog: {
      sources: [{ id: 'src-aaa', name: 'Studio A', producer: { kind: 'route', channel: 2 } }],
    },
  });
  await bridge.runtime.whenServerHealthy(HEALTH_MS);

  // The product's own surface cannot produce this, so a caller that does is
  // stale or hand-written; dropping the request silently would report a success
  // the caller did not get.
  const refused = bridge.runtime.setSourceAssignments({
    assignments: [{ templateId: 'tpl-1', plateId: 'guest-1', sourceId: 'src-gone' }],
  });
  expect(refused).toMatchObject({ ok: false, reason: 'unknown-source' });
  expect(bridge.runtime.sourceAssignments().assignments).toEqual([]);

  const ok = bridge.runtime.setSourceAssignments({
    assignments: [{ templateId: 'tpl-1', plateId: 'guest-1', sourceId: 'src-aaa' }],
  });
  expect(ok).toEqual({ ok: true });
});
