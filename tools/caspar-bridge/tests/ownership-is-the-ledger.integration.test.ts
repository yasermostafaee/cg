import * as dgram from 'node:dgram';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createMock, type MockHandle } from '@cg/amcp-mock';
import type {
  ConnectionConfig,
  SourceAssignments,
  SourceCatalog,
  TemplateInfo,
  TemplateLook,
} from '@cg/shared-ipc';
import type { LiveSourceRect } from '@cg/shared-schema';
import { CasparRuntime } from '../src/caspar-runtime.js';
import type { LiveLayerLedger } from '../src/live-layers.js';
import { loadPersistedLiveLayers, savePersistedLiveLayers } from '../src/live-layers-store.js';
import { awaitChannelModeRead, HEALTH_MS } from './support/harness.js';

/**
 * `UPDATE-INFORCE-02` / `B-216` — **WHAT A CONFIGURATION VERB MAY TOUCH IS DECIDED BY THE
 * LEDGER, NEVER BY THE REHEARSE FLAG.**
 *
 * ── THE CONTRADICTION THIS FILE SETTLED, BY MEASUREMENT ────────────────────
 *
 * The record carried two statements that could not both be true of one tree:
 *
 *   - `PATCH-BX-01` (2026-08-23 17:57): *"a rehearsing row's plates are never seated … a
 *     `swapLiveSource`/`update` on one was probed and left the ledger empty."*
 *   - `B-161`'s own `neighbour 2` (2026-08-23 13:53, four hours EARLIER, and green ever since):
 *     *"a REHEARSING row still seats"* — an `update` on a loaded, never-taken, rehearsing row
 *     puts `PLAY`s on the wire.
 *
 * Measured here on the mock's AMCP trace: **`neighbour 2` was right about the code and wrong
 * about the rule.** `#ownsLiveSeats` read `on air OR rehearsing`, so an `update` on a rehearsing
 * row reconciled and SEATED its plates — real producers on real channel layers, with no
 * template on air above them. That is `B-161`'s defect reached through the rehearse flag, on a
 * row whose whole contract (`R-022`) is *"nothing is ever sent to CasparCG"*. The swap half of
 * `PATCH-BX-01`'s probe was true only because `swapLiveSource` carried its OWN ledger gate in
 * front of the shared transaction — a third spelling of the same question.
 *
 * ── THE AXIS, DECIDED (the owner, `UPDATE-INFORCE-02` §2) ──────────────────
 *
 * The LEDGER is the truth about what the bridge OWNS; status is the truth about what the
 * operator SEES; the rehearse flag is a claim about a BROWSER-side preview and a mute
 * interlock, and it has no seats of its own (`enterRehearse` sends at most one `MIXER VOLUME 0`
 * to the TEMPLATE layer). So every door that may touch a live layer — `update`'s binding
 * transaction, `swapLiveSource`, `setActiveLook`, and a volume RAISE — asks the ONE predicate:
 * *is this row on air, or does the ledger hold seats for it?* Rehearse is not in it.
 *
 * The one route that reaches "not on air, not rehearsing, ledger NON-EMPTY" is **boot
 * adoption** (`B-145`): the persisted ledger comes back while the row's status and its
 * rehearsal do not. Test 3 walks that route end to end.
 *
 * ⚠ **Why a persisted rehearse flag is NOT the fix** (`caspar-runtime.ts`, `#rehearsing`'s own
 * header): the mute does not survive a restart either — startup re-asserts every declared row's
 * volume — so a persisted flag would outlive the condition it describes and interlock `PLAY` on
 * a layer that is no longer muted. Re-verified this session; the reasoning holds.
 */

let mock: MockHandle | null = null;
/** The UDP port the mock STREAMS OSC TO — the runtime binds it; both runtimes use the same one. */
let oscPort = 0;
let runtime: CasparRuntime | null = null;
let runtime2: CasparRuntime | null = null;
let tracePath: string | null = null;
const tmpDirs: string[] = [];

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
  await runtime2?.stop();
  runtime2 = null;
  await mock?.stop();
  mock = null;
  if (tracePath !== null && fs.existsSync(tracePath)) fs.rmSync(tracePath);
  tracePath = null;
  for (const d of tmpDirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
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

/** The owner's template in the fixture's vocabulary: a three-box, a two-box and a solo. */
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

async function bootRuntime(): Promise<CasparRuntime> {
  if (mock === null) throw new Error('no mock');
  const r = new CasparRuntime(
    singleServer(mock.amcpPort, oscPort),
    {},
    {
      sweepMs: 150,
      lookMixerHoldMs: 0,
      sourceCatalog: CATALOG,
      sourceAssignments: ASSIGNMENTS,
    },
  );
  r.start();
  await r.startServing();
  r.templateImport(TEMPLATE, '<!doctype html><html></html>');
  await r.whenServerHealthy(HEALTH_MS);
  // A "nothing reached the wire" assertion is valid only from a PROVEN-QUIESCENT wire —
  // R-030's one-shot `INFO` must have landed first (flake family 3, support/harness.ts).
  await awaitChannelModeRead(r);
  return r;
}

async function boot(): Promise<CasparRuntime> {
  oscPort = await freeUdpPort();
  tracePath = path.join(
    os.tmpdir(),
    `cg-ledger-axis-${String(process.pid)}-${String(Date.now())}-${String(Math.round(performance.now() * 1000))}.ndjson`,
  );
  mock = await createMock({ amcpPort: 0, oscPort, oscHost: '127.0.0.1', oscHz: 30, tracePath });
  const r = await bootRuntime();
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
const reaching = (lines: readonly string[]) => ({
  plays: lines.filter((l) => l.startsWith('PLAY 1-')),
  volumes: lines.filter((l) => /^MIXER 1-\d+ VOLUME/.test(l)),
  fits: lines.filter((l) => /^MIXER 1-\d+ (FILL|CLIP)/.test(l)),
});
const NOTHING = { plays: [], volumes: [], fits: [] };

/** Does the wire carry any of the three? One reading per door, so the doors can be compared. */
const moved = (lines: readonly string[]): boolean => {
  const r = reaching(lines);
  return r.plays.length + r.volumes.length + r.fits.length > 0;
};

function tmpLedgerFile(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-ledger-axis-'));
  tmpDirs.push(dir);
  return path.join(dir, 'bridge-live-layers.json');
}

/** The persisted ledger exactly as `bridge.ts` writes it on every `liveLayersChanged`. */
function persistLedger(r: CasparRuntime): string {
  const file = tmpLedgerFile();
  const ledger: LiveLayerLedger = new Map([...r.liveLayers()].map(([id, rs]) => [id, [...rs]]));
  savePersistedLiveLayers(file, ledger);
  return file;
}

/**
 * THE BRIDGE DIES AND COMES BACK. CasparCG (the mock) never restarts, so every producer the
 * first process seated is still on its layer; the second process adopts the persisted ledger
 * against that occupancy, exactly as `bridge.ts` does at boot (`adoptLiveLayers`).
 */
async function restartBridge(r: CasparRuntime, file: string): Promise<CasparRuntime> {
  await r.stop();
  runtime = null;
  const r2 = await bootRuntime();
  runtime2 = r2;
  const loaded = loadPersistedLiveLayers(file).ledger;
  expect(loaded, 'the ledger file round-trips').not.toBeNull();
  const occupied = (slot: { channel: number; layer: number }) =>
    mock?.layerState(slot)?.producer === undefined ? ('empty' as const) : ('occupied' as const);
  r2.adoptLiveLayers(loaded!, occupied);
  return r2;
}

// ─────────────────────── §1 — WHICH STATEMENT HOLDS, MEASURED ───────────────────────

describe('UPDATE-INFORCE-02 §1 — a REHEARSING row owns NO seats; only the LEDGER can say otherwise', () => {
  it('🔴 rehearsing, nothing seated: UPDATE, SWAP and a LOOK SWITCH all reach NO live layer, and the ledger stays EMPTY', async () => {
    const r = await boot();
    await r.load('item-1', 'debate', { title: 'before' });
    expect((await r.enterRehearse('item-1')).ok, 'a loaded row can enter rehearse').toBe(true);
    expect(layerSet(r), 'rehearse seats nothing by itself').toEqual([]);

    /*
      THE MEASUREMENT. Before this session `update` on this row put `PLAY`s on the wire —
      `B-161`'s `neighbour 2` asserted it as a feature ("a rehearsing row still seats") —
      while `swapLiveSource` and `setActiveLook` did not, because each carried its own
      spelling of the gate. R-022's contract for rehearse is "nothing is ever sent to
      CasparCG"; rule 10's is "no PLAY, no un-mute, no fill on a row that owns no live
      layers". A rehearsing, never-taken row owns none.
    */
    const beforeUpdate = (await recvLines()).length;
    expect((await r.update('item-1', { title: 'after' }, 'merge', NEW_BINDING)).accepted).toBe(
      true,
    );
    expect(reaching(await since(beforeUpdate)), 'UPDATE on a rehearsing row').toEqual(NOTHING);

    const beforeSwap = (await recvLines()).length;
    expect((await r.swapLiveSource('item-1', 'live-1', 'src-5')).ok).toBe(true);
    expect(reaching(await since(beforeSwap)), 'SWAP on a rehearsing row').toEqual(NOTHING);

    const beforeSwitch = (await recvLines()).length;
    expect((await r.setActiveLook('item-1', 'solo')).ok).toBe(true);
    expect(reaching(await since(beforeSwitch)), 'LOOK SWITCH on a rehearsing row').toEqual(NOTHING);

    expect(layerSet(r), 'no seat was written').toEqual([]);
    expect(
      r.rehearseState().map((x) => x.itemId),
      'the rehearsal still stands',
    ).toEqual(['item-1']);
    // …and none of the three edits was DISCARDED: they are in force for the next take.
    const item = r.stackSnapshot().find((i) => i.itemId === 'item-1');
    expect(item?.lookSourceOverride).toEqual(NEW_BINDING);
    expect(item?.sourceOverride).toEqual({ 'live-1': 'src-5' });
    expect(r.activeLookId('item-1')).toBe('solo');
  });

  it('…so a bridge restart finds NO seats for it — the ledger AND the rehearsal are both empty, not one of them', async () => {
    /*
      The `NOTAKE-02` audit's sentence — "a row rehearsing when the bridge restarts comes back
      with seats and no rehearsal flag" — was TRUE only because `neighbour 2` let an UPDATE
      seat a rehearsing row. With ownership on the ledger a rehearsing row has nothing to
      persist, so the restart finds nothing: no seats to adopt, and no flag (deliberately not
      persisted — see the file header).
    */
    const r = await boot();
    await r.load('item-1', 'debate', {});
    expect((await r.enterRehearse('item-1')).ok).toBe(true);
    expect((await r.update('item-1', {}, 'merge', NEW_BINDING)).accepted).toBe(true);
    const file = persistLedger(r);

    const r2 = await restartBridge(r, file);

    expect(r2.liveLayers().size, 'nothing to adopt — the rehearsal never seated').toBe(0);
    expect(r2.rehearseState(), 'the rehearse flag is process state and is gone').toEqual([]);
  });

  it('🔴 the route that DOES reach "not on air, not rehearsing, seats HELD": an ON-AIR row restarts — and BOTH doors then move its plates', async () => {
    /*
      `B-145` boot adoption: the persisted ledger comes back at boot; the row's STATUS comes
      back only when the browser re-delivers its stack and OSC re-derives it, and its
      rehearsal never comes back. In that window the bridge holds confirmed seats — real
      producers on real layers, on air by every physical measure — for a row it does not
      call on air. `setActiveLook` always moved those plates (it read the ledger); `update`
      and `swapLiveSource` refused to (they read air-or-rehearse). Two doors, one row, two
      answers. Now one answer: the seats are the bridge's, so a configuration change on that
      row re-points them, whatever the status says.
    */
    const r = await boot();
    await r.load('item-1', 'debate', {});
    expect((await r.take('item-1')).accepted).toBe(true);
    const seatsBefore = layerSet(r);
    expect(seatsBefore.length, 'the take seats the union').toBeGreaterThan(0);
    const file = persistLedger(r);

    const r2 = await restartBridge(r, file);
    expect(layerSet(r2), 'the seats came back').toEqual(seatsBefore);
    expect(r2.stackSnapshot(), 'the row itself did not — no browser has re-delivered it').toEqual(
      [],
    );
    expect(r2.rehearseState()).toEqual([]);

    // The browser re-delivers the row as LOADED (its own memory of a stopped show, say):
    // not on air, not rehearsing, and the ledger still holds its seats. The disputed cell.
    expect((await r2.load('item-1', 'debate', {})).accepted).toBe(true);
    expect(layerSet(r2), 'the load did not release the adopted seats').toEqual(seatsBefore);
    const status = r2.stackSnapshot().find((i) => i.itemId === 'item-1')?.status;
    expect(status).toBe('loaded');

    const beforeUpdate = (await recvLines()).length;
    expect((await r2.update('item-1', {}, 'merge', NEW_BINDING)).accepted).toBe(true);
    const updateMoved = moved(await since(beforeUpdate));

    const beforeSwitch = (await recvLines()).length;
    expect((await r2.setActiveLook('item-1', 'three')).ok).toBe(true);
    const switchMoved = moved(await since(beforeSwitch));

    // 🔴 THE ALIGNMENT. Before this session: `updateMoved === false`, `switchMoved === true`.
    expect({ updateMoved, switchMoved }).toEqual({ updateMoved: true, switchMoved: true });
    // …and the UPDATE did what a live re-point does: `src-4` (route 5) is now SEATED for the
    // punched frame, in the ledger the bridge will persist and PANIC will read.
    expect(
      (r2.liveLayers().get('item-1') ?? []).some((rec) => rec.producer.includes('route://5')),
      'the new binding was seated, not merely recorded',
    ).toBe(true);
  });
});

// ─────────────────────── §2 — ONE PREDICATE BEHIND EVERY DOOR ───────────────────────

describe('UPDATE-INFORCE-02 §2 — every door asks the same question, and rehearse is not part of the answer', () => {
  it('rehearsing WITH adopted seats: the plates move because of the SEATS, not the rehearsal', async () => {
    const r = await boot();
    await r.load('item-1', 'debate', {});
    expect((await r.take('item-1')).accepted).toBe(true);
    const file = persistLedger(r);
    const r2 = await restartBridge(r, file);
    expect((await r2.load('item-1', 'debate', {})).accepted).toBe(true);
    // The operator presses ON PVW on the restored row. Allowed: it is not on air by status.
    expect((await r2.enterRehearse('item-1')).ok).toBe(true);

    const before = (await recvLines()).length;
    expect((await r2.swapLiveSource('item-1', 'live-1', 'src-6', 'two')).ok).toBe(true);
    expect(moved(await since(before)), 'a swap re-points a seat the bridge owns').toBe(true);
  });

  it('a raise reaches a seat the bridge OWNS whatever the status says, and reaches nothing on a row with no seats', async () => {
    /*
      The audio axis of the same rule (`add-multibox-audio` §8.3): a SILENCE is never gated,
      a RAISE needs ownership — and ownership is the ledger. A raise on a row with no seats has
      no layer to reach and records the intent for the take; a raise on adopted seats reaches
      the producer that is genuinely on the channel.
    */
    const r = await boot();
    await r.load('item-1', 'debate', {});
    const beforeNoSeats = (await recvLines()).length;
    expect(await r.setLivePlateVolume('item-1', 'live-1', 1)).toEqual({ ok: true, sent: false });
    expect((await since(beforeNoSeats)).filter((l) => /VOLUME/.test(l))).toEqual([]);
    expect(r.livePlateVolumes('item-1'), 'the intent is armed for the take').toEqual({
      'live-1': 1,
    });

    expect((await r.take('item-1')).accepted).toBe(true);
    const file = persistLedger(r);
    const r2 = await restartBridge(r, file);
    expect((await r2.load('item-1', 'debate', {})).accepted).toBe(true);

    const before = (await recvLines()).length;
    expect(await r2.setLivePlateVolume('item-1', 'live-1', 1)).toEqual({ ok: true, sent: true });
    expect((await since(before)).filter((l) => /VOLUME 1$/.test(l))).toHaveLength(1);
  });
});
