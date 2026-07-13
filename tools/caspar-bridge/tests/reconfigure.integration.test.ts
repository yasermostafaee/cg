import * as dgram from 'node:dgram';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { WebSocket } from 'ws';
import { afterEach, expect, it } from 'vitest';
import { createMock, type MockHandle } from '@cg/amcp-mock';
import {
  ConnectionsConfigChannel,
  ConnectionsSetConfigChannel,
  parseWsFrame,
  serializeWsFrame,
  type AnyChannel,
  type ChannelRequest,
  type ChannelResponse,
  type ConnectionConfig,
} from '@cg/shared-ipc';
import { CasparRuntime, deriveOscBindHost } from '../src/caspar-runtime.js';
import { createBridge, type BridgeHandle } from '../src/index.js';
import { HEALTH_MS } from './support/harness.js';

/**
 * R-010 — runtime server reconfiguration. Two amcp-mocks stand in for the
 * "local" and "remote" CasparCG: pushing a new config re-points the RUNNING
 * bridge (playout verifiably reaches the second mock), the on-air gate
 * refuses until Remove-All clears air+stack, the control WebSocket stays
 * loopback-bound with a remote host configured (decision 5), an unreachable
 * TEST-NET host is honest-not-fatal, and the applied config persists across
 * a bridge restart.
 */

let mockA: MockHandle | null = null;
let mockB: MockHandle | null = null;
let runtime: CasparRuntime | null = null;
let bridge: BridgeHandle | null = null;
let tempDir: string | null = null;

afterEach(async () => {
  await runtime?.stop();
  runtime = null;
  await bridge?.close();
  bridge = null;
  await mockA?.stop();
  mockA = null;
  await mockB?.stop();
  mockB = null;
  if (tempDir !== null) {
    fs.rmSync(tempDir, { recursive: true, force: true });
    tempDir = null;
  }
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

function singleServer(amcpPort: number, oscPort: number, host = '127.0.0.1'): ConnectionConfig {
  return {
    servers: { A: { host, amcpPort, oscPort } },
    strategy: 'mirror-sync',
    autoFailoverEnabled: true,
  };
}

const TEMPLATE = {
  templateId: 'lower-third',
  templateType: 'lower-third',
  fields: [],
} as const;
const HTML = '<!doctype html><html><body>served</body></html>';

/** Minimal WS request/response client over the shared-ipc frame envelope. */
function wsInvoke<C extends AnyChannel>(
  url: string,
  channel: C,
  payload: ChannelRequest<C>,
): Promise<ChannelResponse<C>> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    // EVERY exit path clears the timer AND disposes the socket. The error path
    // used to reject while leaving the WebSocket open — a leaked client (with
    // its reconnect noise) outlived the test that created it.
    const timer = setTimeout(() => {
      ws.terminate(); // a graceful close can itself hang on a wedged socket
      reject(new Error(`wsInvoke timed out: ${channel.name}`));
    }, 8000);
    ws.on('error', (err) => {
      clearTimeout(timer);
      ws.terminate(); // an errored socket may never complete a graceful close
      reject(err);
    });
    ws.on('open', () => {
      ws.send(serializeWsFrame({ type: 'request', id: '1', channel: channel.name, payload }));
    });
    ws.on('message', (data: Buffer | string) => {
      const frame = parseWsFrame(String(data));
      if (frame === null || frame.type !== 'response') return;
      clearTimeout(timer);
      ws.close();
      if (frame.error !== undefined) reject(new Error(frame.error.message));
      else resolve(channel.response.parse(frame.payload) as ChannelResponse<C>);
    });
  });
}

it('re-points the running bridge: refused on air, Remove-All clears + unblocks, playout reaches the new server', async () => {
  const oscA = await freeUdpPort();
  const oscB = await freeUdpPort();
  mockA = await createMock({ amcpPort: 0, oscPort: oscA, oscHost: '127.0.0.1', oscHz: 30 });
  mockB = await createMock({ amcpPort: 0, oscPort: oscB, oscHost: '127.0.0.1', oscHz: 30 });

  const clearsOnA: string[] = [];
  mockA.setHandler('CLEAR', (req) => {
    clearsOnA.push(req.args[0] ?? '?');
    return { kind: 'ok', code: 202, verb: 'CLEAR' };
  });
  const addsOnB: string[] = [];
  const playsOnB: string[] = [];
  mockB.setHandler('PLAY', (req) => {
    playsOnB.push(req.args[0] ?? '?');
    return { kind: 'ok', code: 202, verb: 'PLAY' };
  });

  runtime = new CasparRuntime(singleServer(mockA.amcpPort, oscA));
  runtime.start();
  await runtime.startServing();
  runtime.templateImport({ ...TEMPLATE }, HTML);
  await runtime.whenServerHealthy(HEALTH_MS);

  // Put something on air.
  expect((await runtime.load('item1', 'lower-third', {})).accepted).toBe(true);
  expect((await runtime.take('item1')).accepted).toBe(true);

  // Reconfiguration is REFUSED while the item is on air / unsettled.
  const nextConfig = singleServer(mockB.amcpPort, oscB);
  const refused = await runtime.setConfig(nextConfig);
  expect(refused.ok).toBe(false);
  expect(refused.reason).toBe('on-air-block');
  // Nothing changed: still pointing at mock A.
  expect(runtime.config().servers.A.amcpPort).toBe(mockA.amcpPort);

  // Remove-All: OUTs + REMOVEs everything — CLEARs observed on A, stack empty.
  const cleared = await runtime.removeAll();
  expect(cleared).toEqual({ ok: true, removed: 1 });
  expect(clearsOnA.length).toBeGreaterThan(0);
  expect(runtime.stackSnapshot()).toEqual([]);

  // Now the same apply succeeds and playout reaches mock B.
  const applied = await runtime.setConfig(nextConfig);
  expect(applied.ok).toBe(true);
  expect(applied.templateServe?.exposed).toBe(false);
  expect(runtime.config().servers.A.amcpPort).toBe(mockB.amcpPort);
  await runtime.whenServerHealthy(HEALTH_MS);

  // The template registry survived the switch — no re-import needed. The
  // CG ADD reaches B (recorded via its resolving handler seeing the URL).
  mockB.setHandler('CG', (req) => {
    if (req.args[1] === 'ADD') addsOnB.push(req.args[0] ?? '?');
    return { kind: 'ok', code: 202, verb: 'CG' };
  });
  expect((await runtime.load('item2', 'lower-third', {})).accepted).toBe(true);
  expect((await runtime.take('item2')).accepted).toBe(true);
  expect(addsOnB.length).toBeGreaterThan(0);
}, 20000);

it('loopback invariant: a remote-host config never moves the control WS off 127.0.0.1; unreachable is honest, not fatal', async () => {
  bridge = await createBridge({ port: 0 });
  expect(bridge.host).toBe('127.0.0.1');

  // Apply a REMOTE, unreachable (TEST-NET) primary through the real WS route.
  const remote = singleServer(5250, 0, '192.0.2.1');
  const result = await wsInvoke(bridge.url, ConnectionsSetConfigChannel, remote);
  // Unreachable is NOT an apply failure — sessions retry with backoff and
  // health honestly reports the disconnected state.
  expect(result.ok).toBe(true);
  // The DATA plane went routable for the remote server…
  expect(result.templateServe?.exposed).toBe(true);
  // …while the CONTROL plane did not move: handle.host unchanged, and a
  // brand-new loopback WS client still connects and round-trips.
  expect(bridge.host).toBe('127.0.0.1');
  const config = await wsInvoke(
    `ws://127.0.0.1:${String(bridge.port)}`,
    ConnectionsConfigChannel,
    undefined,
  );
  expect(config.servers.A.host).toBe('192.0.2.1');
  // No crash: health is answerable and shows the not-connected truth.
  const health = bridge.runtime.health();
  expect(health.primary.state).not.toBe('healthy');
}, 20000);

it('persists the applied config across a bridge restart; explicit connection flags override the file', async () => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-r010-'));
  const persistPath = path.join(tempDir, 'nested', 'bridge-connection.json');
  const oscB = await freeUdpPort();
  mockB = await createMock({ amcpPort: 0, oscPort: oscB, oscHost: '127.0.0.1', oscHz: 30 });
  const persisted = singleServer(mockB.amcpPort, oscB);

  // Bridge #1: default connection; apply + persist over the real route.
  bridge = await createBridge({ port: 0, persistPath });
  const applied = await wsInvoke(bridge.url, ConnectionsSetConfigChannel, persisted);
  expect(applied.ok).toBe(true);
  expect(fs.existsSync(persistPath)).toBe(true);
  await bridge.close();
  bridge = null;

  // Bridge #2: same persistPath, no explicit connection → boots the persisted
  // config and reaches HEALTHY against mock B.
  bridge = await createBridge({ port: 0, persistPath });
  expect(bridge.runtime.config()).toEqual(persisted);
  await bridge.runtime.whenServerHealthy(HEALTH_MS);
  await bridge.close();
  bridge = null;

  // Bridge #3: explicit connection (the CLI-flags path) overrides the file —
  // and the file itself is not clobbered by boot.
  const explicit = singleServer(19999, 0);
  bridge = await createBridge({ port: 0, connection: explicit, persistPath });
  expect(bridge.runtime.config()).toEqual(explicit);
  expect(JSON.parse(fs.readFileSync(persistPath, 'utf8'))).toEqual(persisted);
}, 20000);

it('an invalid persisted file is warned about and ignored (defaults win)', async () => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-r010-bad-'));
  const persistPath = path.join(tempDir, 'bridge-connection.json');
  fs.writeFileSync(persistPath, '{ "servers": { "A": { "host": "" } } }', 'utf8');
  bridge = await createBridge({ port: 0, persistPath });
  // Fell back to the built-in single-server default.
  expect(bridge.runtime.config().servers.A.amcpPort).toBe(5250);
  expect(bridge.runtime.config().servers.B).toBeUndefined();
}, 20000);

it('deriveOscBindHost: loopback server → loopback ingest; remote server → routable ingest', () => {
  expect(deriveOscBindHost('127.0.0.1')).toBe('127.0.0.1');
  expect(deriveOscBindHost('localhost')).toBe('127.0.0.1');
  expect(deriveOscBindHost('192.168.1.50')).toBe('0.0.0.0');
  expect(deriveOscBindHost('caspar.example.local')).toBe('0.0.0.0');
});
