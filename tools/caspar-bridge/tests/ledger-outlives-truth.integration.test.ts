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
import { awaitChannelModeRead, HEALTH_MS } from './support/harness.js';

/**
 * 🔴 **`B-227` — THE LIVE-SEAT LEDGER MUST NOT OUTLIVE WHAT IT DESCRIBES.**
 *
 * ── THE DEFECT, AND WHY IT IS AN AIR-PATH DEFECT ────────────────────────────
 *
 * CasparCG restarts under a running bridge (NSSM auto-restart on the plant). The reconnect
 * samples occupancy once, finds every layer silent, and `reconcileOnReconnect` resets each
 * played row to `idle` — **which is correct and stays.** What did NOT happen is the other
 * half: `#liveLayers`, the ledger naming the Live Source layers this bridge seated, was left
 * naming layers 30…35 with producers that no longer exist.
 *
 * `#ownsLiveSeats` is `on air OR the ledger holds seats`, so on a row whose status the
 * reconciler had just reset to `idle` the ledger alone kept the answer TRUE — and golden rule
 * 10's gate is precisely that predicate. The consequence is `B-161` reached through a stale
 * belief instead of through the rehearse flag: an UPDATE on a stopped row re-enters the
 * binding reconcile, seats producers, and puts video on air **with no template above it** —
 * on a row the console is showing as stopped, after an event the operator was never told
 * about.
 *
 * ── WHY IT WAS NEVER JOINED (the answer this file pins) ─────────────────────
 *
 * Not a deliberate record of INTENT outliving the truth — a MISSED JOIN, and the dates say so:
 *
 *   - `f82e9e68` (2026-07-15, `B-086`) — `reconcileOnReconnect`, in `@cg/caspar-client`'s
 *     Reconciler, which knows only an item's TEMPLATE slot and has never heard of a ledger.
 *   - `7e595ac5` (2026-08-10) — the ledger's types, four weeks later.
 *   - `229885cd` (2026-08-18, `B-145`) — `reconcileLiveLayers`, **the one spelling of
 *     "correct the ledger's claim by the server's evidence"** … wired to the BOOT door only.
 *
 * So the identical physical event — CasparCG came back with empty layers — is reconciled
 * against the ledger when it is met at boot and not when it is met at reconnect. Both doors
 * now call the same function, from the same one occupancy sample.
 *
 * ⚠ **THE `heard` GATE IS THE POSITIVE CONTROL AND IT IS LOAD-BEARING.** The drop runs only
 * inside the branch that has already proven the OSC tap is HEARING (`hasFreshOsc`). From a
 * blind tap silence is evidence of nothing (`B-101`, `B-053`), and dropping there would make
 * the console forget seats it still owns — the inverse fault, and the worse one. Test 3 pins
 * the blip case: same connection, producers intact, ledger untouched.
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

function singleServer(amcpPort: number, port: number): ConnectionConfig {
  return {
    servers: { A: { host: '127.0.0.1', amcpPort, oscPort: port } },
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

/** `ownership-is-the-ledger`'s fixture: a three-box, a two-box and a solo. */
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

const delay = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

async function waitFor(cond: () => boolean, timeoutMs: number, what: string): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!cond()) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
    await delay(25);
  }
}

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
  runtime = r;
  r.start();
  await r.startServing();
  r.templateImport(TEMPLATE, '<!doctype html><html></html>');
  await r.whenServerHealthy(HEALTH_MS);
  await awaitChannelModeRead(r);
  return r;
}

async function boot(): Promise<CasparRuntime> {
  oscPort = await freeUdpPort();
  tracePath = path.join(
    os.tmpdir(),
    `cg-ledger-truth-${String(process.pid)}-${String(Date.now())}-${String(Math.round(performance.now() * 1000))}.ndjson`,
  );
  mock = await createMock({ amcpPort: 0, oscPort, oscHost: '127.0.0.1', oscHz: 30, tracePath });
  return bootRuntime();
}

async function since(before: number): Promise<string[]> {
  return (await recvLines()).slice(before);
}

const layerSet = (r: CasparRuntime, itemId = 'item-1'): number[] =>
  (r.liveLayers().get(itemId) ?? []).map((rec) => rec.slot.layer).sort((a, b) => a - b);

/** The three commands that can put a picture on air — `B-161`'s reading, `B-216`'s helper. */
const reaching = (lines: readonly string[]) => ({
  plays: lines.filter((l) => l.startsWith('PLAY 1-')),
  volumes: lines.filter((l) => /^MIXER 1-\d+ VOLUME/.test(l)),
  fits: lines.filter((l) => /^MIXER 1-\d+ (FILL|CLIP)/.test(l)),
});
const NOTHING = { plays: [], volumes: [], fits: [] };

const statusOf = (r: CasparRuntime, itemId = 'item-1'): string | undefined =>
  r.stackSnapshot().find((i) => i.itemId === itemId)?.status;

/**
 * CasparCG restarts: the mock is stopped and a FRESH instance comes up on the same ports, so
 * its layers are genuinely empty (`server-restart-retake`'s fidelity note — the `B-041`
 * lesson). The drop must be OBSERVED before the port returns, or a wait-for-healthy right
 * after can sample the stale pre-drop state and race the reconnect.
 */
async function restartCasparCG(r: CasparRuntime): Promise<void> {
  if (mock === null || tracePath === null) throw new Error('no mock');
  const amcpPort = mock.amcpPort;
  const dying = mock;
  mock = null;
  await dying.stop();
  await waitFor(() => r.health().primary.state !== 'healthy', 5000, 'the drop to be observed');
  mock = await createMock({ amcpPort, oscPort, oscHost: '127.0.0.1', oscHz: 30, tracePath });
  await waitFor(() => r.health().primary.state === 'healthy', 15_000, 'the session to reconnect');
}

/** Seat the union for `item-1` and hand back the layers it owns. */
async function takeSeated(r: CasparRuntime): Promise<number[]> {
  expect((await r.load('item-1', 'debate', { title: 'before' })).accepted).toBe(true);
  expect((await r.take('item-1')).accepted).toBe(true);
  const seats = layerSet(r);
  expect(seats.length, 'the take seats the union').toBeGreaterThan(0);
  return seats;
}

describe('B-227 — a CasparCG restart empties the ledger with the rows it emptied', () => {
  it('🔴 the ledger is dropped with the reset, so an UPDATE on the stopped row seats NOTHING', async () => {
    const r = await boot();
    const seats = await takeSeated(r);

    await restartCasparCG(r);

    // ── UNCHANGED, AND IT MUST STAY UNCHANGED: the row reconciles to `idle`. ──
    await waitFor(() => statusOf(r) === 'idle', 10_000, 'the row to reconcile to idle');

    // 🔴 RED BEFORE THE FIX. The ledger still named every one of `seats`, so
    // `#ownsLiveSeats` answered TRUE for a row the console shows stopped.
    expect(layerSet(r), 'the ledger no longer names layers the server does not have').toEqual([]);

    /*
      🔴 THE AIR-PATH ASSERTION — golden rule 10, measured at the wire.

      An UPDATE is a CONFIGURATION verb. On a row that owns no live seats it lands in STATE
      and reaches no layer. Before the fix the stale ledger carried `#ownsLiveSeats` past its
      gate and this UPDATE re-entered the binding reconcile: `PLAY`s onto the empty band,
      `MIXER VOLUME`s and `FILL`/`CLIP`s — video on air under no template, on a stopped row.
    */
    const before = (await recvLines()).length;
    expect((await r.update('item-1', { title: 'after' }, 'merge', NEW_BINDING)).accepted).toBe(
      true,
    );
    expect(reaching(await since(before)), 'UPDATE after a restart reaches no layer').toEqual(
      NOTHING,
    );

    // …and the edit was not DISCARDED — it is in force for the next take, which is the
    // whole of what a configuration verb owes (`B-161`).
    const item = r.stackSnapshot().find((i) => i.itemId === 'item-1');
    expect(item?.lookSourceOverride).toEqual(NEW_BINDING);

    /*
      The seats are recoverable by the ordinary door, and the edit is seated WITH them: a TAKE
      is what puts content on air, which is the other half of rule 10. The union is one seat
      WIDER than `seats` because the UPDATE bound an input no look held before (`src-4`,
      route 5) — the edit was in force, waiting for the take, exactly as specified.
    */
    expect((await r.take('item-1')).accepted).toBe(true);
    const reseated = layerSet(r);
    expect(reseated.length, 'the take re-seats at least the union it lost').toBeGreaterThanOrEqual(
      seats.length,
    );
    expect(
      (r.liveLayers().get('item-1') ?? []).some((rec) => rec.producer.includes('route://5')),
      'and the binding the UPDATE recorded is what the take seated',
    ).toBe(true);
  }, 40_000);

  it('🔴 …and the other doors go with it: SWAP and a LOOK SWITCH reach no layer either', async () => {
    /*
      One predicate, four doors (`B-216`). A fix that dropped the ledger but left any door
      reading a second spelling of ownership would still put a `PLAY` on the wire, so the
      sweep is asserted rather than assumed — `#ownsLiveSeats` is the ONE read, and this is
      what proves the other doors take it.
    */
    const r = await boot();
    await takeSeated(r);
    await restartCasparCG(r);
    await waitFor(() => statusOf(r) === 'idle', 10_000, 'the row to reconcile to idle');

    const beforeSwap = (await recvLines()).length;
    expect((await r.swapLiveSource('item-1', 'live-1', 'src-5')).ok).toBe(true);
    expect(reaching(await since(beforeSwap)), 'SWAP after a restart').toEqual(NOTHING);

    const beforeSwitch = (await recvLines()).length;
    expect((await r.setActiveLook('item-1', 'solo')).ok).toBe(true);
    expect(reaching(await since(beforeSwitch)), 'LOOK SWITCH after a restart').toEqual(NOTHING);

    const beforeRaise = (await recvLines()).length;
    expect(await r.setLivePlateVolume('item-1', 'live-1', 1)).toEqual({ ok: true, sent: false });
    expect(reaching(await since(beforeRaise)), 'a volume RAISE after a restart').toEqual(NOTHING);
  }, 40_000);

  it('the INVERSE — a blinked socket keeps every seat: the producers survived, so the ledger must', async () => {
    /*
      🔴 THE FAULT THIS TEST EXISTS TO CATCH IS THE FIX'S OWN INVERSE. Dropping the ledger on
      any reconnect would make the console forget seats it genuinely owns — the producers are
      still on those layers, composited on the channel, and a row that has forgotten them can
      neither re-point them nor tear them down. The discriminator is EVIDENCE: a TCP reset
      leaves the same server with its producers, so the one occupancy sample reports them
      occupied and `reconcileLiveLayers` keeps them, exactly as it keeps them at boot.
    */
    const r = await boot();
    const seats = await takeSeated(r);
    if (mock === null) throw new Error('no mock');

    mock.closeAllAmcpConnections();
    await waitFor(() => r.health().primary.state !== 'healthy', 5000, 'the blip to be observed');
    await waitFor(() => r.health().primary.state === 'healthy', 15_000, 'the session to reconnect');

    // The OSC sample the reconnect takes must have seen the surviving producers.
    await delay(300);
    expect(layerSet(r), 'the ledger still names the seats that survived').toEqual(seats);
    expect(statusOf(r), 'and the row is still on air').toBe('on-air');
  }, 40_000);
});
