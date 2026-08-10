import * as dgram from 'node:dgram';
import * as fs from 'node:fs';
import * as net from 'node:net';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { createMock, type MockHandle } from '@cg/amcp-mock';
import type { ConnectionConfig, SourceMappings } from '@cg/shared-ipc';
import { createBridge, type BridgeHandle } from '../src/bridge.js';
import { HEALTH_MS } from './support/harness.js';

/**
 * D-137 / C-015 phase 4 — the installation mapping at BOOT.
 *
 * Shaped on `fixed-layers-boot.integration.test.ts` T17/T18, because the
 * property is the same one: config that conflicts must resolve LOUDLY at
 * startup, before a single client is served, rather than at a take. What
 * differs is the direction of the absent case — an absent bank falls back to
 * the built-in default, an absent MAPPING falls back to nothing, and the third
 * test below is the pin on that difference.
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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-sources-boot-'));
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

it('S1 — an ABSENT mapping file boots normally with ZERO mappings, and no guessed default', async () => {
  const { oscPort } = await bootMock();
  if (mock === null) throw new Error('mock not booted');
  bridge = await createBridge({
    port: 0,
    connection: singleServer(mock.amcpPort, oscPort),
    sourceMappingsPath: path.join(tmpDir(), 'bridge-source-mappings.json'),
  });
  await bridge.runtime.whenServerHealthy(HEALTH_MS);

  // Nothing resolves. That is FAIL-CLOSED and it is the point: with no file,
  // nothing reaches air, and each take carrying a declared id refuses legibly.
  expect(bridge.runtime.sourceMappings()).toEqual({ mappings: [] });
  expect(bridge.sourceMappings.source).toBe('absent');
});

it('S2 — a PRESENT but unusable mapping file throws BEFORE binding, and no port is left listening', async () => {
  const { oscPort } = await bootMock();
  if (mock === null) throw new Error('mock not booted');
  const wsPort = await reserveFreePort();
  const file = path.join(tmpDir(), 'bridge-source-mappings.json');
  // Schema-invalid: a producer kind nothing can play. Half of this file parses,
  // and serving that half is exactly what must not happen.
  fs.writeFileSync(
    file,
    JSON.stringify({
      mappings: [
        { id: 'guest-1', producer: { kind: 'route', channel: 2 } },
        { id: 'guest-2', producer: { kind: 'sdi', device: 3 } },
      ],
    }),
    'utf8',
  );

  await expect(
    createBridge({
      port: wsPort,
      connection: singleServer(mock.amcpPort, oscPort),
      sourceMappingsPath: file,
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
      fixedLayers: { channel: 1, start: 70, count: 30 },
      // 50–75 reaches into the operator's candidate bank.
      sourceMappings: { mappings: [], layerRange: { start: 50, end: 75 } },
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
      sourceMappings: { mappings: [], layerRange: { start: 55, end: 65 } },
    }),
  ).rejects.toThrow(/reserved playout range/);

  await expectNothingListening(wsPort);
});

it('S5 — the mapping is in force, with its provenance, before the first client is served', async () => {
  const { oscPort } = await bootMock();
  if (mock === null) throw new Error('mock not booted');
  const file = path.join(tmpDir(), 'bridge-source-mappings.json');
  const value: SourceMappings = {
    mappings: [
      {
        id: 'guest-1',
        label: 'Studio camera 2',
        format: '1080i5000',
        producer: { kind: 'route', channel: 2 },
      },
    ],
    layerRange: { start: 10, end: 59 },
  };
  fs.writeFileSync(file, JSON.stringify(value), 'utf8');

  bridge = await createBridge({
    port: 0,
    connection: singleServer(mock.amcpPort, oscPort),
    sourceMappingsPath: file,
  });

  // Read WITHOUT awaiting health: the load happens before the WebSocket binds,
  // so it is already answerable the moment `createBridge` resolves.
  expect(bridge.runtime.sourceMappings()).toEqual(value);
  expect(bridge.sourceMappings.source).toBe('file');
});

it('S6 — a change is validated against the SAME bank and reservation the boot saw', async () => {
  const { oscPort } = await bootMock();
  if (mock === null) throw new Error('mock not booted');
  bridge = await createBridge({
    port: 0,
    connection: singleServer(mock.amcpPort, oscPort),
    fixedLayers: { channel: 1, start: 70, count: 30 },
    reservedLayers: { ranges: [{ from: 60, to: 69 }] },
    sourceMappings: { mappings: [], layerRange: { start: 10, end: 59 } },
  });
  await bridge.runtime.whenServerHealthy(HEALTH_MS);

  // AT CHANGE is the half that gets forgotten, and it is the half an operator
  // can trigger with a graphic on air.
  const intoBank = bridge.runtime.setSourceMappings({
    mappings: [],
    layerRange: { start: 10, end: 72 },
  });
  expect(intoBank).toMatchObject({ ok: false, reason: 'overlaps-fixed-bank' });

  const intoReserved = bridge.runtime.setSourceMappings({
    mappings: [],
    layerRange: { start: 10, end: 61 },
  });
  expect(intoReserved).toMatchObject({ ok: false, reason: 'overlaps-reserved' });

  // The refusals left the mapping in force untouched.
  expect(bridge.runtime.sourceMappings().layerRange).toEqual({ start: 10, end: 59 });

  const ok = bridge.runtime.setSourceMappings({
    mappings: [{ id: 'guest-1', producer: { kind: 'route', channel: 2 } }],
    layerRange: { start: 10, end: 59 },
  });
  expect(ok).toEqual({ ok: true });
  expect(bridge.runtime.sourceMappings().mappings).toHaveLength(1);
});
