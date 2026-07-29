import * as dgram from 'node:dgram';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { createMock, type MockHandle } from '@cg/amcp-mock';
import { AmcpTransport, CommandQueue } from '@cg/caspar-client';
import type { ConnectionConfig, TemplateInfo } from '@cg/shared-ipc';
import { CasparRuntime } from '../src/caspar-runtime.js';
import { createBridge, type BridgeHandle } from '../src/bridge.js';
import { HEALTH_MS } from './support/harness.js';

/**
 * R-028 (o1 / 3.2 / 3.3) — the bridge OWNS the template catalogue:
 *
 *   - a bridge restart does not empty the library (persistence, tested on the
 *     RESTART path, not just the happy path — persistence is where the demo
 *     breaks);
 *   - every import/removal publishes the full catalogue so all browsers
 *     converge;
 *   - after a restart, ROW identity the bridge cannot establish is reported
 *     as unknown honestly — never guessed from what the persisted registry
 *     happens to contain.
 *
 * Plus the R-028 (2.5) boot half: a candidate ceiling intersecting the
 * reserved playout range refuses to boot, naming both ranges.
 */

let mock: MockHandle | null = null;
let runtime: CasparRuntime | null = null;
let bridge: BridgeHandle | null = null;
let tmpRoot: string | null = null;
let foreignQueue: CommandQueue | null = null;
let foreignTransport: AmcpTransport | null = null;

const SWEEP_MS = 150;
const STALE_MS = 800;
const HTML = '<!doctype html><html><body>پایین‌ثلث</body></html>';
const BANK = { channel: 1, start: 70, count: 4 };
const FIXED_SLOTS = [70, 71, 72, 73].map((layer) => ({ channel: 1, layer }));

afterEach(async () => {
  foreignQueue?.dispose();
  foreignQueue = null;
  foreignTransport?.destroy();
  foreignTransport = null;
  await runtime?.stop();
  runtime = null;
  await bridge?.close();
  bridge = null;
  await mock?.stop();
  mock = null;
  if (tmpRoot !== null) fs.rmSync(tmpRoot, { recursive: true, force: true });
  tmpRoot = null;
});

async function foreignPlay(target: MockHandle, line: string): Promise<void> {
  if (foreignTransport === null) {
    foreignTransport = new AmcpTransport();
    await foreignTransport.connect(target.host, target.amcpPort);
    foreignQueue = new CommandQueue(foreignTransport);
  }
  await foreignQueue?.enqueue(line);
}

async function waitFor(predicate: () => boolean, timeoutMs = 8000): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) throw new Error('waitFor timed out');
    await new Promise((r) => setTimeout(r, 25));
  }
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

function templatesDir(): string {
  tmpRoot ??= fs.mkdtempSync(path.join(os.tmpdir(), 'cg-tpl-persist-'));
  return path.join(tmpRoot, 'templates');
}

function info(templateId: string, name?: string): TemplateInfo {
  return { templateId, ...(name !== undefined ? { name } : {}), templateType: 'clock', fields: [] };
}

/** The OSC DESTINATION port (what the session binds) — NOT `mock.oscPort`,
 * which is the emitter's bound SOURCE socket. */
let oscDestPort = 0;

async function bootRuntime(
  dir: string,
  extra: { reservedLayers?: readonly number[]; noBank?: boolean } = {},
): Promise<CasparRuntime> {
  if (mock === null) {
    oscDestPort = await freeUdpPort();
    mock = await createMock({ amcpPort: 0, oscPort: oscDestPort, oscHost: '127.0.0.1', oscHz: 30 });
  }
  const cfg = singleServer(mock.amcpPort, oscDestPort);
  runtime = new CasparRuntime(
    cfg,
    {},
    {
      sweepMs: SWEEP_MS,
      occupancyStaleMs: STALE_MS,
      ...(extra.noBank === true ? {} : { fixedSlots: FIXED_SLOTS, fixedBank: BANK }),
      templatesDir: dir,
      ...(extra.reservedLayers !== undefined ? { reservedLayers: extra.reservedLayers } : {}),
    },
  );
  runtime.start();
  await runtime.startServing();
  return runtime;
}

it('R-028 (3.2) — the catalogue SURVIVES a bridge restart and is served identically', async () => {
  const dir = templatesDir();
  const first = await bootRuntime(dir);
  first.templateImport(info('tpl-clock', 'ساعت اذان'), HTML);
  expect(first.templateList().map((t) => t.templateId)).toEqual(['tpl-clock']);

  // The restart: stop the runtime completely, boot a NEW one on the same dir.
  await first.stop();
  runtime = null;
  const second = await bootRuntime(dir);

  // Same catalogue, same display name, and the HTML is servable again.
  expect(second.templateList().map((t) => ({ id: t.templateId, name: t.name }))).toEqual([
    { id: 'tpl-clock', name: 'ساعت اذان' },
  ]);
  expect(second.templateHtml('tpl-clock')).toBe(HTML);
  // The load guard passes — a row Load works without any browser re-delivery.
  expect(second.templateGet('tpl-clock')?.templateType).toBe('clock');
});

it('R-028 (o1) — import and removal each publish the FULL catalogue (all browsers converge)', async () => {
  const dir = templatesDir();
  const r = await bootRuntime(dir);
  const published: TemplateInfo[][] = [];
  r.templatesChanged.subscribe((t) => published.push(t));

  r.templateImport(info('tpl-a'), HTML);
  r.templateImport(info('tpl-b'), HTML);
  expect(published).toHaveLength(2);
  expect(published[1]?.map((t) => t.templateId).sort()).toEqual(['tpl-a', 'tpl-b']);

  expect(r.templateRemove('tpl-a').ok).toBe(true);
  expect(published).toHaveLength(3);
  expect(published[2]?.map((t) => t.templateId)).toEqual(['tpl-b']);
});

it('R-028 (3.3) — after a restart, row identity is UNKNOWN honestly: never guessed from the persisted registry', async () => {
  const dir = templatesDir();
  const first = await bootRuntime(dir);
  first.templateImport(info('tpl-clock', 'ساعت'), HTML);
  await first.whenServerHealthy(HEALTH_MS);
  expect(
    (await first.loadFixed({ channel: 1, layer: 71 }, 'item-1', 'tpl-clock', {})).accepted,
  ).toBe(true);
  expect((await first.take('item-1')).accepted).toBe(true);

  // Bridge dies; CasparCG (the mock) keeps rendering the producer on 1-71.
  await first.stop();
  runtime = null;

  const second = await bootRuntime(dir);
  await second.whenServerHealthy(HEALTH_MS);
  // Wait for a hearing tap so occupancy is REAL, not just booted-empty.
  const start = Date.now();
  while (!second.fixedLayersState().some((s) => s.layer === 71 && s.observed.kind === 'producer')) {
    if (Date.now() - start > 8000) throw new Error('tap never observed the surviving producer');
    await new Promise((res) => setTimeout(res, 25));
  }

  const slot71 = second.fixedLayersState().find((s) => s.layer === 71);
  // The producer is OBSERVED (something IS on the layer)…
  expect(slot71?.observed).toEqual({ kind: 'producer', producer: 'html' });
  // …the registry still KNOWS the template (persistence worked)…
  expect(second.templateGet('tpl-clock')).not.toBeNull();
  // …and yet the binding is NULL: what is ON THE ROW cannot be established
  // after a bridge restart, and the bridge says so instead of guessing.
  expect(slot71?.binding).toBeNull();
});

it('R-028 / C-015 — a declared reserved layer NEVER surfaces as an orphan and layers.clear refuses it', async () => {
  const r = await bootRuntime(templatesDir(), { reservedLayers: [60, 61, 62] });
  if (mock === null) throw new Error('mock not booted');
  await r.whenServerHealthy(HEALTH_MS);

  // A playout-style HTML graphic on a RESERVED layer, plus one on an
  // unreserved layer as the positive control (proves the sweep is running).
  await foreignPlay(mock, 'PLAY 1-60 "playout-lower-third" HTML');
  await foreignPlay(mock, 'PLAY 1-45 "stray-graphic" HTML');
  await waitFor(() => r.orphans().some((o) => o.layer === 45));

  // The reserved layer is occupied on the wire yet NEVER an orphan candidate —
  // the operator is never invited to reclaim playout output.
  await new Promise((res) => setTimeout(res, SWEEP_MS * 3));
  expect(r.orphans().some((o) => o.layer === 60)).toBe(false);

  // …and clearing it is refused from ANY caller, before the html
  // discriminator can pass (a playout graphic IS an html producer).
  expect(await r.clearLayer(1, 60)).toEqual({ ok: false, reason: 'reserved' });
  // The unreserved orphan stays clearable — the fence is scoped, not global.
  expect((await r.clearLayer(1, 45)).ok).toBe(true);
});

it('R-028 / C-015 — a retained item whose slot is now RESERVED is skipped at restore, never re-homed', async () => {
  const r = await bootRuntime(templatesDir(), { reservedLayers: [60, 61, 62] });
  if (mock === null) throw new Error('mock not booted');
  await r.whenServerHealthy(HEALTH_MS);
  r.templateImport(info('tpl-clock'), HTML);

  // Retained intent from a PRE-RESERVATION session: the item lived on 1-61.
  const result = await r.restore([
    {
      itemId: 'item-old',
      templateId: 'tpl-clock',
      fields: {},
      played: true,
      slot: { channel: 1, layer: 61, server: 'primary' },
    },
  ]);
  // SKIPPED — not restored elsewhere. Re-homing would read a DIFFERENT
  // layer's occupancy and could re-ADD a duplicate while the survivor stays
  // live on the playout layer.
  expect(result).toEqual({ restored: 0, skipped: 1 });
  expect(r.stackSnapshot().some((i) => i.itemId === 'item-old')).toBe(false);
  expect(mock.lastCgAdd({ channel: 1, layer: 61 })).toBeUndefined();
});

it('R-028 (2.3) — installing a bank LIVE with pre-hidden layers fails closed on unknown occupancy', async () => {
  const r = await bootRuntime(templatesDir(), { noBank: true });
  // BEFORE the session is healthy the tap has never heard: unknown → refuse.
  const blind = r.setFixedLayers({
    channel: 1,
    start: 70,
    count: 4,
    visibility: { '71': false },
  });
  expect(blind.ok).toBe(false);
  expect(blind.reason).toBe('untick-unknown');
  expect(r.fixedLayersConfig()).toBeNull(); // nothing applied

  // With a hearing tap and provably-empty layers, the same install applies.
  await r.whenServerHealthy(HEALTH_MS);
  await waitFor(() => {
    const probe = r.setFixedLayers({
      channel: 1,
      start: 70,
      count: 4,
      visibility: { '71': false },
    });
    return probe.ok;
  });
  expect(r.fixedLayersConfig()?.visibility).toEqual({ '71': false });
});

it('R-028 (2.5) — a candidate ceiling intersecting the reserved playout range refuses to BOOT, naming both ranges', async () => {
  const oscPort = await freeUdpPort();
  mock = await createMock({ amcpPort: 0, oscPort, oscHost: '127.0.0.1', oscHz: 30 });
  await expect(
    createBridge({
      port: 0,
      connection: singleServer(mock.amcpPort, oscPort),
      fixedLayers: { channel: 1, start: 70, count: 10 },
      reservedLayers: { ranges: [{ from: 75, to: 84 }] },
    }),
  ).rejects.toThrow(/70–79.*75–84|75–84.*70–79/s);
});
