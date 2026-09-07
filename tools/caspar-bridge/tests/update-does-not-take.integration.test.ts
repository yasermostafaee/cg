import * as dgram from 'node:dgram';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMock, type MockHandle } from '@cg/amcp-mock';
import type {
  ConnectionConfig,
  SourceAssignments,
  SourceCatalog,
  TemplateInfo,
  TemplateLook,
} from '@cg/shared-ipc';
import { isOnAirStatus } from '@cg/shared-schema';
import type { LiveSourceRect } from '@cg/shared-schema';
import { CasparRuntime } from '../src/caspar-runtime.js';
import { awaitChannelModeRead, HEALTH_MS } from './support/harness.js';

/**
 * `RUNTIME-REDESIGN-01` §3 — **`Update` does not take.**
 *
 * The one behaviour the redesign of the layers table puts most at risk, stated as its own
 * test before the table is touched (golden rule 10, `B-161`, `B-216`): a configuration verb
 * is NEVER a playout verb. `UPDATE` puts values IN FORCE; only a TAKE puts content ON AIR.
 * For a row that does not own the live layer — not on air, and holding no seats in the
 * ledger — an Update must cause no `PLAY`, no un-mute (`MIXER … VOLUME`) and no fill
 * (`MIXER … FILL` / `CLIP`). Asserted on what reaches the wire — the mock's AMCP trace —
 * never on what a UI shows.
 *
 * ── WHAT THIS ADDS TO `live-look-reconcile` and `ownership-is-the-ledger` ──────────
 *
 * Those files pin the never-taken row and the rehearsing row. Neither walks the route the
 * owner actually took on the plant (`B-161`, 2026-08-22): a row that WAS on air, that the
 * operator took OFF with a verb, and then reconfigured. After `out` and after `stop` the
 * bridge tears the plates down and releases the ledger, so the row owns nothing — and an
 * UPDATE there must put nothing back. A field-only update (no bindings at all) is pinned
 * too, because every existing case enters the gate through the binding transaction.
 *
 * ── THE POSITIVE CONTROL ───────────────────────────────────────────────────────────
 *
 * "Nothing reached the wire" is void until the instrument is proven live: the last test
 * makes the SAME update on the SAME row while it IS on air and requires a `PLAY`. If the
 * trace reader ever went blind, that test is the one that goes red.
 */

let mock: MockHandle | null = null;
let oscPort = 0;
let runtime: CasparRuntime | null = null;
let tracePath: string | null = null;

const BAND = { start: 30, end: 35 };
const SCENE = { width: 1920, height: 1080 };
const CENTRED = { anchor: 'center' as const, offset: { x: 0, y: 0 } };
const BOX: Record<string, LiveSourceRect> = {
  'live-1': { x: 0, y: 0, width: 480, height: 270 },
  'live-2': { x: 480, y: 0, width: 480, height: 270 },
  'live-3': { x: 960, y: 0, width: 480, height: 270 },
};
const FULL: LiveSourceRect = { x: 0, y: 0, width: 1920, height: 1080 };

afterEach(async () => {
  await runtime?.stop();
  runtime = null;
  await mock?.stop();
  mock = null;
  if (tracePath !== null && fs.existsSync(tracePath)) fs.rmSync(tracePath);
  tracePath = null;
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

function singleServer(amcpPort: number, oscPort: number): ConnectionConfig {
  return {
    servers: { A: { host: '127.0.0.1', amcpPort, oscPort } },
    strategy: 'mirror-sync',
    autoFailoverEnabled: true,
  };
}

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

function look(id: string, rects: Record<string, LiveSourceRect>): TemplateLook {
  return { id, name: id, entered: { mode: 'cut' }, rects };
}

/** A three-box, a two-box and a solo — the owner's template in the fixture's vocabulary. */
const TEMPLATE: TemplateInfo = {
  templateId: 'debate',
  templateType: 'debate',
  fields: [{ id: 'title', label: 'Title', type: 'text', required: false, default: '' }],
  liveSources: {
    resolution: SCENE,
    defaultPosition: CENTRED,
    sources: ['live-1', 'live-2', 'live-3'].map((k) => ({
      elementId: `el-${k}`,
      sourceId: k,
      rect: BOX[k] as LiveSourceRect,
      dynamic: false,
    })),
    looks: [
      look('three', BOX),
      look('two', {
        'live-1': BOX['live-1'] as LiveSourceRect,
        'live-2': BOX['live-2'] as LiveSourceRect,
      }),
      look('solo', { 'live-3': FULL }),
    ],
    defaultLookId: 'two',
  },
};

/** Six inputs for three plates, so a new binding can always name an input no look holds. */
const CATALOG: SourceCatalog = {
  sources: [1, 2, 3, 4, 5, 6].map((i) => ({
    id: `src-${String(i)}`,
    name: `Feed ${String(i)}`,
    format: '1080i5000' as const,
    producer: { kind: 'route' as const, channel: i + 1 },
  })),
  layerRange: BAND,
};

const ASSIGNMENTS: SourceAssignments = {
  assignments: [
    { templateId: 'debate', plateId: 'live-1', sourceId: 'src-1' },
    { templateId: 'debate', plateId: 'live-2', sourceId: 'src-2' },
    { templateId: 'debate', plateId: 'live-3', sourceId: 'src-3' },
  ],
};

/** `src-4` is route 5 and is bound by no look, so binding it forces a genuinely NEW seat. */
const NEW_BINDING = { two: { 'live-2': 'src-4' } } as const;

async function boot(): Promise<CasparRuntime> {
  oscPort = await freeUdpPort();
  tracePath = path.join(
    os.tmpdir(),
    `cg-update-does-not-take-${String(process.pid)}-${String(Date.now())}-${String(Math.round(performance.now() * 1000))}.ndjson`,
  );
  mock = await createMock({ amcpPort: 0, oscPort, oscHost: '127.0.0.1', oscHz: 30, tracePath });
  const r = new CasparRuntime(
    singleServer(mock.amcpPort, oscPort),
    {},
    { sweepMs: 150, lookMixerHoldMs: 0, sourceCatalog: CATALOG, sourceAssignments: ASSIGNMENTS },
  );
  r.start();
  await r.startServing();
  r.templateImport(TEMPLATE, '<!doctype html><html></html>');
  await r.whenServerHealthy(HEALTH_MS);
  // A "nothing reached the wire" assertion is valid only from a PROVEN-QUIESCENT wire —
  // R-030's one-shot `INFO` must have landed first (flake family 3, support/harness.ts).
  await awaitChannelModeRead(r);
  runtime = r;
  return r;
}

/** Lines this action put on the wire, from a baseline taken before it. */
async function since(before: number): Promise<string[]> {
  return (await recvLines()).slice(before);
}

const layerSet = (r: CasparRuntime, itemId = 'item-1'): number[] =>
  (r.liveLayers().get(itemId) ?? []).map((rec) => rec.slot.layer).sort((a, b) => a - b);

/** The three commands that can put a picture on air, plus the ledger — `B-161`'s reading. */
const reaching = (lines: readonly string[], r: CasparRuntime) => ({
  plays: lines.filter((l) => l.startsWith('PLAY 1-')),
  volumes: lines.filter((l) => /^MIXER 1-\d+ VOLUME/.test(l)),
  fits: lines.filter((l) => /^MIXER 1-\d+ (FILL|CLIP)/.test(l)),
  seats: layerSet(r),
});
const NOTHING = { plays: [], volumes: [], fits: [], seats: [] };

const item = (r: CasparRuntime, itemId = 'item-1') =>
  r.stackSnapshot().find((i) => i.itemId === itemId);

/**
 * Wait for the row to be SETTLED off air. `stop` leaves the row `exiting` — which
 * `isOnAirStatus` counts as ON AIR, correctly, because the outro is still on the channel —
 * until the mock's OSC reports the layer idle. The claim under test is about a row that
 * does NOT own the live layer, so the settle is part of the precondition, never a wait
 * for the assertion to come true.
 */
async function settledOffAir(r: CasparRuntime, itemId = 'item-1'): Promise<void> {
  await vi.waitFor(
    () => {
      const it = item(r, itemId);
      if (it === undefined) throw new Error(`${itemId} left the stack`);
      if (isOnAirStatus(it)) throw new Error(`${itemId} still reads ${it.status}`);
    },
    { timeout: 5_000, interval: 25 },
  );
}

describe('RUNTIME-REDESIGN-01 §3 — Update does not take', () => {
  it('a LOADED, never-taken row: a FIELD-ONLY update reaches no live layer', async () => {
    const r = await boot();
    await r.load('item-1', 'debate', { title: 'before' });
    expect(layerSet(r), 'a loaded row seats nothing').toEqual([]);

    const before = (await recvLines()).length;
    const res = await r.update('item-1', { title: 'after' }, 'merge');
    expect(res.accepted, 'the configuration change is accepted').toBe(true);
    expect(reaching(await since(before), r)).toEqual(NOTHING);
    // …and it LANDED: the value is in force for the next take.
    expect(item(r)?.fields).toMatchObject({ title: 'after' });
  });

  it('a LOADED, never-taken row: an update that binds a NEW input reaches no live layer, and the binding is in force', async () => {
    const r = await boot();
    await r.load('item-1', 'debate', { title: 'before' });

    const before = (await recvLines()).length;
    expect((await r.update('item-1', { title: 'after' }, 'merge', NEW_BINDING)).accepted).toBe(
      true,
    );
    expect(reaching(await since(before), r)).toEqual(NOTHING);
    expect(item(r)?.lookSourceOverride).toEqual(NEW_BINDING);
  });

  it('🔴 the operator-verb route — TAKE, then OUT, then UPDATE with a swapped input: nothing reaches the wire, and the next TAKE seats the swap', async () => {
    const r = await boot();
    await r.load('item-1', 'debate', { title: 'before' });
    expect((await r.take('item-1')).accepted).toBe(true);
    expect(layerSet(r).length, 'the take pre-seats the plates').toBeGreaterThan(0);

    // OFF AIR by the operator's own verb. The plates come down and the ledger is released
    // (`teardownLiveLayers`), so from here the row owns nothing on the channel.
    expect((await r.out('item-1')).accepted).toBe(true);
    await settledOffAir(r);
    expect(layerSet(r), 'OUT releases every seat').toEqual([]);

    // THE PRESS. The owner's sequence on the plant: swapped inputs, then UPDATE alone.
    const before = (await recvLines()).length;
    expect((await r.update('item-1', { title: 'after' }, 'merge', NEW_BINDING)).accepted).toBe(
      true,
    );
    expect(reaching(await since(before), r), 'UPDATE after OUT').toEqual(NOTHING);

    // The edit is NOT lost — the other half of rule 10. Only a TAKE puts it on air, and
    // when it does, it seats the input the off-air UPDATE bound (src-4 → route 5).
    expect(item(r)?.lookSourceOverride).toEqual(NEW_BINDING);
    const beforeTake = (await recvLines()).length;
    expect((await r.take('item-1')).accepted).toBe(true);
    const took = reaching(await since(beforeTake), r);
    expect(
      took.plays.some((l) => /route:\/\/5\b/.test(l)),
      'the next take seats the swapped input',
    ).toBe(true);
  });

  it('🔴 the operator-verb route — TAKE, then STOP (graceful), settled off air, then UPDATE: nothing reaches the wire', async () => {
    const r = await boot();
    await r.load('item-1', 'debate', { title: 'before' });
    expect((await r.take('item-1')).accepted).toBe(true);
    expect(layerSet(r).length, 'the take pre-seats the plates').toBeGreaterThan(0);

    expect((await r.stopItem('item-1')).accepted).toBe(true);
    await settledOffAir(r);
    expect(layerSet(r), 'STOP releases every seat').toEqual([]);

    const before = (await recvLines()).length;
    expect((await r.update('item-1', { title: 'after' }, 'merge', NEW_BINDING)).accepted).toBe(
      true,
    );
    expect(reaching(await since(before), r), 'UPDATE after STOP').toEqual(NOTHING);
    expect(item(r)?.lookSourceOverride).toEqual(NEW_BINDING);
  });

  it('POSITIVE CONTROL — the same update on the same row while it IS on air puts a PLAY on the wire', async () => {
    /*
      Without this, every `NOTHING` above would also pass against a trace reader that
      records nothing. The row here OWNS its seats, so rule 10's other clause applies — a
      live row re-points immediately — and the instrument must see it.
    */
    const r = await boot();
    await r.load('item-1', 'debate', { title: 'before' });
    expect((await r.take('item-1')).accepted).toBe(true);
    const seats = layerSet(r);
    expect(seats.length).toBeGreaterThan(0);

    const before = (await recvLines()).length;
    expect((await r.update('item-1', { title: 'after' }, 'merge', NEW_BINDING)).accepted).toBe(
      true,
    );
    const moved = reaching(await since(before), r);
    expect(moved.plays.length, 'an on-air row re-points on the wire').toBeGreaterThan(0);
    expect(moved.seats, 'the union pre-seat survives').toEqual(expect.arrayContaining(seats));
  });
});
