import * as dgram from 'node:dgram';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { createMock, type MockHandle } from '@cg/amcp-mock';
import { AmcpTransport, CommandQueue } from '@cg/caspar-client';
import type { ConnectionConfig, FixedSlotState } from '@cg/shared-ipc';
import { buildRoutes, createBridge, type BridgeHandle } from '../src/bridge.js';
import { HEALTH_MS } from './support/harness.js';

/** Drive a request through the REAL route layer (validate → apply → persist). */
async function invokeRoute(
  b: BridgeHandle,
  channelName: string,
  req: unknown,
  fixedLayersPath?: string,
): Promise<unknown> {
  const routes = buildRoutes(b.runtime, undefined, fixedLayersPath);
  const route = routes.get(channelName);
  if (route === undefined) throw new Error(`no route for ${channelName}`);
  return route.handle(req);
}

/**
 * R-021 stage 2a — the fixed-bank wire contract end to end (S4–S9): config
 * read, LIVE grow-at-end, refusals that apply/persist/publish NOTHING,
 * persistence round-trip across bridge boots, D3 occupancy honesty, and D8
 * publish-only-on-change.
 */

let mock: MockHandle | null = null;
let bridge: BridgeHandle | null = null;
let foreignQueue: CommandQueue | null = null;
let foreignTransport: AmcpTransport | null = null;
let tmpDir: string | null = null;

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
  if (tmpDir !== null) fs.rmSync(tmpDir, { recursive: true, force: true });
  tmpDir = null;
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

async function foreignPlay(target: MockHandle, line: string): Promise<void> {
  if (foreignTransport === null) {
    foreignTransport = new AmcpTransport();
    await foreignTransport.connect(target.host, target.amcpPort);
    foreignQueue = new CommandQueue(foreignTransport);
  }
  await foreignQueue?.enqueue(line);
}

async function boot(options: {
  bank?: { channel: number; start: number; count: number; aliases?: Record<string, string> };
  fixedLayersPath?: string;
}): Promise<BridgeHandle> {
  const oscPort = await freeUdpPort();
  mock = await createMock({ amcpPort: 0, oscPort, oscHost: '127.0.0.1', oscHz: 30 });
  bridge = await createBridge({
    port: 0,
    connection: singleServer(mock.amcpPort, oscPort),
    ...(options.bank !== undefined ? { fixedLayers: options.bank } : {}),
    ...(options.fixedLayersPath !== undefined ? { fixedLayersPath: options.fixedLayersPath } : {}),
    runtimeTuning: { sweepMs: SWEEP_MS, occupancyStaleMs: STALE_MS },
  });
  return bridge;
}

function tmpFile(name: string): string {
  tmpDir ??= fs.mkdtempSync(path.join(os.tmpdir(), 'cg-fixed-wire-'));
  return path.join(tmpDir, name);
}

it('S4 — fixedLayers.config returns the booted bank, and null with no bank', async () => {
  const b = await boot({ bank: { channel: 1, start: 70, count: 10, aliases: { '72': 'ساعت' } } });
  expect(b.runtime.fixedLayersConfig()).toEqual({
    channel: 1,
    start: 70,
    count: 10,
    aliases: { '72': 'ساعت' },
  });
  await b.close();
  bridge = null;
  await mock?.stop();
  mock = null;

  const b2 = await boot({});
  expect(b2.runtime.fixedLayersConfig()).toBeNull();
  expect(b2.runtime.fixedLayersState()).toEqual([]);
});

it('S5 — grow-at-end applies LIVE: new slots fenced immediately and in the change publish', async () => {
  const b = await boot({ bank: { channel: 1, start: 70, count: 10 } });
  const published: FixedSlotState[][] = [];
  b.runtime.fixedStateChanged.subscribe((s) => published.push(s));

  const result = b.runtime.setFixedLayers({ channel: 1, start: 70, count: 12 });
  expect(result).toEqual({ ok: true });
  expect(b.runtime.fixedSlots()).toHaveLength(12);
  expect(b.runtime.fixedSlots().some((s) => s.layer === 81)).toBe(true);
  // The applied change published a state carrying the new slots.
  expect(published.length).toBeGreaterThan(0);
  expect(published[published.length - 1]).toHaveLength(12);
});

it('S6 — renumber and channel-change refuse with their codes; nothing applied/persisted/published', async () => {
  const file = tmpFile('bank.json');
  const b = await boot({
    bank: { channel: 1, start: 70, count: 10 },
    fixedLayersPath: file,
  });
  let configPublishes = 0;
  let statePublishes = 0;
  b.runtime.fixedConfigChanged.subscribe(() => configPublishes++);
  b.runtime.fixedStateChanged.subscribe(() => statePublishes++);

  const renumber = (await invokeRoute(
    b,
    'fixedLayers.set-config',
    { channel: 1, start: 71, count: 9 },
    file,
  )) as { ok: boolean; reason?: string };
  expect(renumber.ok).toBe(false);
  expect(renumber.reason).toBe('renumber-refused');

  const channelChange = (await invokeRoute(
    b,
    'fixedLayers.set-config',
    { channel: 2, start: 70, count: 10 },
    file,
  )) as { ok: boolean; reason?: string };
  expect(channelChange.ok).toBe(false);
  expect(channelChange.reason).toBe('channel-change-refused');

  expect(b.runtime.fixedLayersConfig()).toEqual({ channel: 1, start: 70, count: 10 }); // unchanged
  expect(fs.existsSync(file)).toBe(false); // nothing persisted (boot bank was an explicit option)
  expect(configPublishes).toBe(0);
  expect(statePublishes).toBe(0);
});

it('S7 — an applied set-config persists, and a fresh boot on that path loads the new bank', async () => {
  const file = tmpFile('bank.json');
  const b = await boot({
    bank: { channel: 1, start: 70, count: 10 },
    fixedLayersPath: file,
  });
  await b.runtime.whenServerHealthy(HEALTH_MS);

  // Through the REAL route layer: validate → apply → persist-on-ok.
  const result = (await invokeRoute(
    b,
    'fixedLayers.set-config',
    { channel: 1, start: 70, count: 12 },
    file,
  )) as { ok: boolean };
  expect(result.ok).toBe(true);
  expect(fs.existsSync(file)).toBe(true);

  await b.close();
  bridge = null;
  await mock?.stop();
  mock = null;

  const b2 = await boot({ fixedLayersPath: file });
  expect(b2.runtime.fixedLayersConfig()).toEqual({ channel: 1, start: 70, count: 12 });
  expect(b2.runtime.fixedSlots()).toHaveLength(12);
});

it('S8 — occupancy honesty: unknown before healthy; producer/empty on a hearing tap', async () => {
  const b = await boot({ bank: { channel: 1, start: 70, count: 10 } });
  if (mock === null) throw new Error('mock not booted');

  // BEFORE the session is healthy: every slot honestly UNKNOWN, never 'empty'.
  const early = b.runtime.fixedLayersState();
  expect(early).toHaveLength(10);
  expect(early.every((s) => s.observed.kind === 'unknown')).toBe(true);

  await b.runtime.whenServerHealthy(HEALTH_MS);
  await foreignPlay(mock, 'PLAY 1-72 "program-feed.mov"');

  // Hearing tap: 72 reports its observed producer kind; 75 (absent) is empty.
  await waitFor(() =>
    b.runtime.fixedLayersState().some((s) => s.layer === 72 && s.observed.kind === 'producer'),
  );
  const state = b.runtime.fixedLayersState();
  const slot72 = state.find((s) => s.layer === 72);
  const slot75 = state.find((s) => s.layer === 75);
  expect(slot72?.observed).toEqual({ kind: 'producer', producer: 'ffmpeg' });
  expect(slot75?.observed).toEqual({ kind: 'empty' });
  // Nothing was loaded here, so no slot carries a binding — occupancy and
  // binding are independent facts, and this asserts the first without the second.
  expect(state.every((s) => s.binding === null)).toBe(true);
});

it('S9 — two identical sweeps publish ZERO; a real occupancy change publishes exactly one', async () => {
  const b = await boot({ bank: { channel: 1, start: 70, count: 10 } });
  if (mock === null) throw new Error('mock not booted');
  await b.runtime.whenServerHealthy(HEALTH_MS);

  // Let the state settle (healthy + hearing tap → all-empty publish).
  await waitFor(() => b.runtime.fixedLayersState().every((s) => s.observed.kind === 'empty'));
  await new Promise((r) => setTimeout(r, SWEEP_MS * 2)); // let the tick publish the settled state

  let publishes = 0;
  const seen: FixedSlotState[][] = [];
  b.runtime.fixedStateChanged.subscribe((s) => {
    publishes++;
    seen.push(s);
  });

  // Several identical sweeps: zero publishes.
  await new Promise((r) => setTimeout(r, SWEEP_MS * 4));
  expect(publishes).toBe(0);

  // One real change: exactly one publish.
  await foreignPlay(mock, 'PLAY 1-74 "feed.mov"');
  await waitFor(() => publishes >= 1);
  await new Promise((r) => setTimeout(r, SWEEP_MS * 4));
  expect(publishes).toBe(1);
  expect(seen[0]?.find((s) => s.layer === 74)?.observed).toEqual({
    kind: 'producer',
    producer: 'ffmpeg',
  });
});
