import * as dgram from 'node:dgram';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { createMock, type MockHandle } from '@cg/amcp-mock';
import {
  FixedLayerBankSchema,
  fixedBankSlots,
  type ConnectionConfig,
  type TemplateInfo,
} from '@cg/shared-ipc';
import type { LiveSourceRect, RetainedStackItem } from '@cg/shared-schema';
import { CasparRuntime } from '../src/caspar-runtime.js';
import { HEALTH_MS } from './support/harness.js';

/**
 * 🔴 **`single-clock-look-switch` — THE TWO BANKS, AT THE TWO DOORS THAT CAN GET THEM WRONG.**
 *
 * The layer ORDER is the whole change: a plate-bearing package (a graphics BED) is composited
 * BELOW its plates, furniture above them. Two doors can put a package on the wrong side, and
 * both faults are SILENT on air rather than loud:
 *
 *   - **LOAD** — a bed on an operator row draws its own background OVER every plate it
 *     declares, so the operator sees a designed layout with the guests missing;
 *   - **RESTORE** — a retention file written before the bed rows existed holds a bed against
 *     layer 95, and restoring it there reproduces exactly the same picture, on a link that
 *     just came back, with nobody having asked for anything.
 *
 * Both are covered here, and the migration's SAFETY property is asserted at the wire: the
 * re-homed row touches CasparCG not at all.
 */

let mock: MockHandle | null = null;
let runtime: CasparRuntime | null = null;
let tracePath: string | null = null;

const BANK = FixedLayerBankSchema.parse({
  channel: 1,
  start: 90,
  count: 10,
  low: { start: 1, count: 2 },
});
const OPERATOR_ROW = { channel: 1, layer: 95 };
const RETAINED_OPERATOR_ROW = { ...OPERATOR_ROW, server: 'primary' as const };
const BED_ROW = { channel: 1, layer: 2 };
const RETAINED_BED_ROW = { ...BED_ROW, server: 'primary' as const };

const RECT: LiveSourceRect = { x: 0, y: 0, width: 960, height: 540 };

/** A graphics BED — it declares a plate, so it must sit under one. */
const BED: TemplateInfo = {
  templateId: 'debate',
  templateType: 'debate',
  fields: [],
  liveSources: {
    resolution: { width: 1920, height: 1080 },
    defaultPosition: { anchor: 'center', offset: { x: 0, y: 0 } },
    sources: [{ elementId: 'el-1', sourceId: 'guest-1', rect: RECT, dynamic: false }],
  },
};

/** FURNITURE — a super with no plates, which belongs above the pictures. */
const SUPER: TemplateInfo = {
  templateId: 'lower-third',
  templateType: 'lower-third',
  fields: [],
  liveSources: {
    resolution: { width: 1920, height: 1080 },
    defaultPosition: { anchor: 'center', offset: { x: 0, y: 0 } },
    sources: [],
  },
};

const HTML = '<!doctype html><html><body>served</body></html>';

afterEach(async () => {
  await runtime?.stop();
  runtime = null;
  await mock?.stop();
  mock = null;
  if (tracePath !== null && fs.existsSync(tracePath)) fs.rmSync(tracePath);
  tracePath = null;
});

/** Every AMCP line the mock RECEIVED, in order — the substitute for watching the output. */
async function recvLines(): Promise<string[]> {
  if (mock === null || tracePath === null) throw new Error('no trace');
  await mock.traceFlush();
  return fs
    .readFileSync(tracePath, 'utf-8')
    .split('\n')
    .filter((l) => l.length > 0)
    .map((l) => JSON.parse(l) as { dir: string; line: string })
    .filter((e) => e.dir === 'recv')
    .map((e) => e.line);
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

async function boot(): Promise<CasparRuntime> {
  const oscPort = await freeUdpPort();
  tracePath = path.join(
    os.tmpdir(),
    `cg-twobank-${String(process.pid)}-${String(Math.round(performance.now() * 1000))}.ndjson`,
  );
  mock = await createMock({ amcpPort: 0, oscPort, oscHost: '127.0.0.1', oscHz: 30, tracePath });
  const r = new CasparRuntime(
    singleServer(mock.amcpPort, oscPort),
    {},
    { fixedSlots: [...fixedBankSlots(BANK)], fixedBank: BANK, sweepMs: 150 },
  );
  runtime = r;
  r.start();
  await r.startServing();
  r.templateImport(BED, HTML);
  r.templateImport(SUPER, HTML);
  await r.whenServerHealthy(HEALTH_MS);
  return r;
}

it('🔴 a graphics BED is REFUSED onto an operator row, and the row stays unbound', async () => {
  const r = await boot();
  expect(await r.loadFixed(OPERATOR_ROW, 'i1', 'debate', {})).toEqual({
    accepted: false,
    errorCode: 'wrong-bank',
  });
  // The refusal binds NOTHING and reaches the wire NOT AT ALL — the same contract every
  // other `loadFixed` refusal keeps.
  expect(r.fixedLayersState().find((s) => s.layer === 95)?.binding).toBeNull();
  expect(mock?.lastCgAdd(OPERATOR_ROW)).toBeUndefined();
}, 40_000);

it('🔴 …and is ACCEPTED onto a bed row — the same package, the other half of the bank', async () => {
  const r = await boot();
  expect(await r.loadFixed(BED_ROW, 'i1', 'debate', {})).toEqual({ accepted: true });
  expect(r.fixedLayersState().find((s) => s.layer === 2)?.binding?.itemId).toBe('i1');
}, 40_000);

it('🔴 FURNITURE is REFUSED onto a bed row — the refusal runs in BOTH directions', async () => {
  // The direction that is easy to leave out, and its fault is the quieter one: a logo on a
  // bed row is composited UNDER any live picture and simply disappears when a plate covers
  // it. Nothing errors, and nothing looks wrong until it is on air.
  const r = await boot();
  expect(await r.loadFixed(BED_ROW, 'i1', 'lower-third', {})).toEqual({
    accepted: false,
    errorCode: 'wrong-bank',
  });
  expect(await r.loadFixed(OPERATOR_ROW, 'i1', 'lower-third', {})).toEqual({ accepted: true });
}, 40_000);

it('🔴 a retained BED held against an operator row MIGRATES to a bed row, reported, off air', async () => {
  const r = await boot();
  const retained: RetainedStackItem[] = [
    {
      itemId: 'bed-1',
      templateId: 'debate',
      fields: {},
      state: 'on-air',
      // What an older build wrote: the bed's coordinate on the operator bank.
      slot: RETAINED_OPERATOR_ROW,
    },
  ];

  const result = await r.restore(retained);

  expect(result.restored).toBe(1);
  expect(result.skipped).toEqual([]);
  // The row came back — B-092's whole point — and it came back SAID OUT LOUD, naming both
  // coordinates and the fact that the air claim did not travel with it.
  expect(result.migrated).toEqual([
    { itemId: 'bed-1', from: OPERATOR_ROW, to: { channel: 1, layer: 2 }, demoted: true },
  ]);
  // It is on the HIGHEST free bed row — `Bed 1`, the top of the bed group on the operator's
  // surface, which is where they will look for it.
  expect(r.fixedLayersState().find((s) => s.layer === 2)?.binding?.itemId).toBe('bed-1');
  expect(r.fixedLayersState().find((s) => s.layer === 95)?.binding).toBeNull();
  /*
    🔴 AND IT IS NOT ON AIR. `#slotForRestore`'s contract is that a retained slot is taken
    EXACTLY because it is the layer whose occupancy decides adopt-vs-re-ADD; a migration
    cannot honour that, since the surviving producer is on 95 and the new home is layer 2.
    So the air claim is dropped rather than carried to a layer nothing was ever verified on.
  */
  expect(r.stackSnapshot().find((i) => i.itemId === 'bed-1')?.status).toBe('loaded');
  /*
    ⚠ THE WIRE CLAIM, STATED PRECISELY. The re-homed row is `loaded`, so the ordinary
    restore path may pre-roll it (`CG ADD`, play-on-load off, muted) onto its NEW layer —
    that is B-039 doing its job on an empty layer and puts nothing on air. What must never
    happen is either half of the on-air pair: no `PLAY` on the new row, and NOTHING AT ALL
    on the old one — a producer surviving from before the upgrade is left exactly as it is,
    for the operator to clear through the bank's own door.
  */
  const lines = await recvLines();
  expect(lines.filter((l) => /^CG 1-2 PLAY/.test(l))).toEqual([]);
  expect(lines.filter((l) => /\b1-95\b/.test(l))).toEqual([]);
}, 40_000);

it('a retained bed ALREADY on a bed row is left exactly where it is', async () => {
  // The ordinary case after the first boot on this build, and the one a migration must not
  // touch: nothing to re-home, nothing to report.
  const r = await boot();
  const result = await r.restore([
    { itemId: 'bed-1', templateId: 'debate', fields: {}, state: 'on-air', slot: RETAINED_BED_ROW },
  ]);
  expect(result.migrated).toEqual([]);
  expect(r.fixedLayersState().find((s) => s.layer === 2)?.binding?.itemId).toBe('bed-1');
}, 40_000);

it('FURNITURE retained on an operator row is untouched — the migration is for beds only', async () => {
  const r = await boot();
  const result = await r.restore([
    {
      itemId: 'super-1',
      templateId: 'lower-third',
      fields: {},
      state: 'on-air',
      slot: RETAINED_OPERATOR_ROW,
    },
  ]);
  expect(result.migrated).toEqual([]);
  expect(r.fixedLayersState().find((s) => s.layer === 95)?.binding?.itemId).toBe('super-1');
}, 40_000);

it('🔴 with every bed row taken, the migration SKIPS with its own reason', async () => {
  // Distinct from `no-layer` because the remedies are opposite: nothing is exhausted in the
  // dynamic sense and freeing a dynamic layer would not help — the operator has to clear a
  // bed row. This bank declares two, so two beds fill it.
  const r = await boot();
  const first = await r.restore([
    {
      itemId: 'bed-1',
      templateId: 'debate',
      fields: {},
      state: 'loaded',
      slot: { channel: 1, layer: 1, server: 'primary' },
    },
    { itemId: 'bed-2', templateId: 'debate', fields: {}, state: 'loaded', slot: RETAINED_BED_ROW },
  ]);
  expect(first.restored).toBe(2);

  const third = await r.restore([
    {
      itemId: 'bed-3',
      templateId: 'debate',
      fields: {},
      state: 'loaded',
      slot: RETAINED_OPERATOR_ROW,
    },
  ]);
  expect(third.restored).toBe(0);
  expect(third.skipped).toEqual([{ itemId: 'bed-3', reason: 'no-bed-row' }]);
  expect(third.migrated).toEqual([]);
}, 40_000);
