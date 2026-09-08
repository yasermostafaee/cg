import * as dgram from 'node:dgram';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { createMock, type MockHandle } from '@cg/amcp-mock';
import {
  REMOVE_ON_AIR_CODE,
  type ConnectionConfig,
  type SourceAssignments,
  type SourceCatalog,
  type TemplateInfo,
  type TemplateLook,
} from '@cg/shared-ipc';
import type { LiveSourceRect } from '@cg/shared-schema';
import { CasparRuntime } from '../src/caspar-runtime.js';
import { awaitChannelModeRead, HEALTH_MS } from './support/harness.js';

/**
 * 🔴 **`RUNTIME-REDESIGN-01` PHASE 10 — THE SIX AIR-SENSITIVE SCENARIOS, END TO END, IN ONE
 * OPERATOR SESSION, ASSERTED AT THE WIRE.**
 *
 * ── WHAT THIS ADDS THAT THE SIX EXISTING SUITES DO NOT ──────────────────────
 *
 * Every scenario below already has a dedicated suite, and each of those is the deeper
 * treatment of its own property — `update-does-not-take`, `remove-on-air-refusal`,
 * `stop-verb`, `audio-does-not-take`, `look-switch-preserves-bindings`,
 * `emptied-air-notice`. This file does not restate them and is not a copy of them.
 *
 * What it adds is the one thing six isolated suites structurally cannot show: that the
 * properties hold **on the same row, on the same bridge, in the order an operator actually
 * performs them**, with the state each verb leaves behind carried into the next. Each of
 * those suites boots a clean runtime and exercises one verb against it; a defect that only
 * appears once a row has been updated, taken, refused a REMOVE, stopped, resumed, cleared,
 * re-taken and survived a server restart is invisible to all six and visible here.
 *
 * ⚠ **This is a VERIFICATION file: it is red-first against nothing.** Phase 10 verifies; the
 * red-first proofs for these properties are in the phases that built them (`design.md`
 * §10.3, §11.5, §13.5, §16.6) and their plants are recorded there. What this file owes is
 * that every assertion below is a real reading of a real wire — which is why every
 * "nothing happened" claim carries a positive control taken from the same instrument.
 *
 * ── WHERE THE READING COMES FROM ────────────────────────────────────────────
 *
 * The mock's AMCP trace (`recv` lines: what CasparCG was actually told), the mock's own
 * layer state (what the channel actually holds) and the bridge's ledger. Never a UI, never
 * a status field standing in for a command.
 *
 * ── THE ONE HONEST BOUND ON SCENARIO 2 ──────────────────────────────────────
 *
 * `PROMPT.md` §10 asks that REMOVE on air be *"refused, with its canonical sentence"*. The
 * canonical sentence — `REMOVE_ON_AIR_REASON` — is a RENDERER constant and cannot be read
 * here: the bridge is Node and the renderer is browser code, which is the seam golden rule 1
 * exists to keep. What crosses the seam is `REMOVE_ON_AIR_CODE`, which lives in
 * `@cg/shared-ipc` and is imported by BOTH sides. So the split is:
 *
 *   - **here, at the wire:** the refusal happens, it carries exactly that code, it names the
 *     way out, and nothing whatsoever was destroyed;
 *   - **in jsdom (`removeRowRefusal.dom.test.ts`):** that same code maps to
 *     `REMOVE_ON_AIR_REASON` verbatim, on both surfaces that answer it.
 *
 * Together those two are the sentence. Neither alone is, and this file says so rather than
 * asserting a string it cannot see.
 */

let mock: MockHandle | null = null;
let oscPort = 0;
let runtime: CasparRuntime | null = null;
let tracePath: string | null = null;

/**
 * DECLARED OPERATOR ROWS — the surface `R-017`'s refusal is scoped to.
 *
 * ⚠ **In the LOW half of the bank, and that is forced rather than chosen.** A PLATE-BEARING
 * package is classified `low` by `requiredBankFor`, and `loadFixed` refuses `wrong-bank` for
 * a low package on a high row — a plate-bearing package on a high row composites its own
 * background OVER every plate it declares, which is a silent on-air fault. So the only rows
 * that can carry this template are low ones, and both scenarios that need a plate (audio,
 * looks) and both that need the REMOVE refusal (which is scoped to `operator-row`) have to
 * live on the same kind of row. Discovered by taking the refusal, not by reading it.
 */
const SLOT_A = { channel: 1, layer: 1 };
const SLOT_B = { channel: 1, layer: 2 };
const BANK = { channel: 1, low: { start: 1, count: 9 }, start: 70, count: 4 };
/** The live-plate band. Disjoint from the bank's rows AND from its low layers. */
const BAND = { start: 30, end: 39 };
const SCENE = { width: 1920, height: 1080 };
const CENTRED = { anchor: 'center' as const, offset: { x: 0, y: 0 } };

const box = (x: number, y: number): LiveSourceRect => ({ x, y, width: 480, height: 270 });

/**
 * LEFT places {1,2}; RIGHT places {3,4}. **Disjoint on purpose** — a switch away that really
 * moves the picture is what makes scenario 5's positive control a control rather than a hope.
 */
const LEFT: Record<string, LiveSourceRect> = { 'live-1': box(0, 0), 'live-2': box(480, 0) };
const RIGHT: Record<string, LiveSourceRect> = { 'live-3': box(960, 0), 'live-4': box(0, 270) };
const KEYS = ['live-1', 'live-2', 'live-3', 'live-4'] as const;

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
      sock.close(() => {
        resolve(port);
      });
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

const look = (id: string, rects: Record<string, LiveSourceRect>): TemplateLook => ({
  id,
  name: id,
  entered: { mode: 'cut' },
  rects,
});

function template(): TemplateInfo {
  const all = { ...LEFT, ...RIGHT };
  return {
    templateId: 'debate',
    templateType: 'debate',
    fields: [{ id: 'title', label: 'Title', type: 'text', required: false, default: '' }],
    liveSources: {
      resolution: SCENE,
      defaultPosition: CENTRED,
      sources: KEYS.map((k) => ({
        elementId: `el-${k}`,
        sourceId: k,
        rect: all[k] ?? box(0, 0),
        dynamic: false,
      })),
      looks: [look('left', LEFT), look('right', RIGHT)],
      defaultLookId: 'left',
    },
  };
}

const CATALOG: SourceCatalog = {
  sources: [
    ...KEYS.map((_k, i) => ({
      id: `src-${String(i + 1)}`,
      name: `Feed ${String(i + 1)}`,
      format: '1080i5000' as const,
      producer: { kind: 'route' as const, channel: i + 2 },
    })),
    {
      id: 'src-preset',
      name: 'Preset Feed',
      format: '1080i5000',
      producer: { kind: 'route' as const, channel: 9 },
    },
  ],
  layerRange: BAND,
};

const ASSIGNMENTS: SourceAssignments = {
  assignments: KEYS.map((k, i) => ({
    templateId: 'debate',
    plateId: k,
    sourceId: `src-${String(i + 1)}`,
  })),
};

const HTML = '<!doctype html><html><head><meta charset="utf-8"></head><body>سلام</body></html>';

const delay = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

async function waitFor(cond: () => boolean, timeoutMs: number, what: string): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!cond()) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
    await delay(25);
  }
}

async function boot(): Promise<CasparRuntime> {
  oscPort = await freeUdpPort();
  tracePath = path.join(
    os.tmpdir(),
    `cg-air-e2e-${String(process.pid)}-${String(Date.now())}-${String(Math.round(performance.now() * 1000))}.ndjson`,
  );
  mock = await createMock({ amcpPort: 0, oscPort, oscHost: '127.0.0.1', oscHz: 30, tracePath });
  const r = new CasparRuntime(
    singleServer(mock.amcpPort, oscPort),
    {},
    {
      sweepMs: 150,
      lookMixerHoldMs: 0,
      sourceCatalog: CATALOG,
      sourceAssignments: ASSIGNMENTS,
      fixedSlots: [SLOT_A, SLOT_B],
      fixedBank: BANK,
    },
  );
  runtime = r;
  r.start();
  await r.startServing();
  r.templateImport(template(), HTML);
  await r.whenServerHealthy(HEALTH_MS);
  /*
    A "nothing reached the wire" assertion is valid only from a PROVEN-QUIESCENT wire:
    `R-030`'s one-shot channel-mode read and `C-029`'s output check must both have landed
    before any baseline is taken (flake family 3, `support/harness.ts`), and `R-022`'s boot
    volume re-assert fires 140–160 ms after HEALTHY.
  */
  await awaitChannelModeRead(r);
  await delay(250);
  return r;
}

/** A fresh CasparCG on the same ports — genuinely empty layers, as after a real restart. */
async function restartCasparCG(r: CasparRuntime): Promise<void> {
  if (tracePath === null || mock === null) throw new Error('no mock');
  const amcpPort = mock.amcpPort;
  const dying = mock;
  mock = null;
  await dying.stop();
  await waitFor(() => r.health().primary.state !== 'healthy', 8000, 'the drop to be observed');
  mock = await createMock({ amcpPort, oscPort, oscHost: '127.0.0.1', oscHz: 30, tracePath });
  await waitFor(() => r.health().primary.state === 'healthy', 20_000, 'the session to reconnect');
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

/** A baseline the next action's traffic is measured from. */
const mark = async (): Promise<number> => (await recvLines()).length;
const since = async (before: number): Promise<string[]> => (await recvLines()).slice(before);

/**
 * The commands that can put a picture or a voice on air — `B-161`'s reading, on any layer of
 * the channel rather than one slot's, because a live-plate seat lands on the BAND.
 */
const reaching = (
  lines: readonly string[],
): { plays: string[]; adds: string[]; volumes: string[]; fits: string[] } => ({
  plays: lines.filter((l) => /^(PLAY|CG 1-\d+ PLAY)/.test(l)),
  adds: lines.filter((l) => /^CG 1-\d+ ADD/.test(l)),
  volumes: lines.filter((l) => /^MIXER 1-\d+ VOLUME/.test(l)),
  fits: lines.filter((l) => /^MIXER 1-\d+ (FILL|CLIP)/.test(l)),
});
const NOTHING = { plays: [], adds: [], volumes: [], fits: [] };

const statusOf = (r: CasparRuntime, itemId: string): string | undefined =>
  r.stackSnapshot().find((i) => i.itemId === itemId)?.status;

const seats = (r: CasparRuntime, itemId: string): number[] =>
  (r.liveLayers().get(itemId) ?? []).map((rec) => rec.slot.layer).sort((a, b) => a - b);

/** One frame's whole relationship: the producer seated for a plate and the rect it renders at. */
interface FrameReading {
  producer: string | undefined;
  layer: number;
  rendered: unknown;
}

function frameOf(r: CasparRuntime, itemId: string, plateId: string): FrameReading {
  const rec = (r.liveLayers().get(itemId) ?? []).find((x) => x.sourceId === plateId);
  const layer = rec?.slot.layer ?? -1;
  return {
    producer: rec?.producer,
    layer,
    rendered: layer < 0 ? null : (mock?.layerRenderedRect({ channel: 1, layer }) ?? null),
  };
}

const leftFrames = (r: CasparRuntime, itemId: string): Record<string, FrameReading> =>
  Object.fromEntries(Object.keys(LEFT).map((p) => [p, frameOf(r, itemId, p)]));

// ─────────────────────────────────────────────────────────────────────────────

it('🔴 PHASE 10 — the six air-sensitive scenarios, in one operator session, at the wire', async () => {
  const r = await boot();

  /* ═══ SCENARIO 1 — AN UPDATE ON A ROW THAT DOES NOT OWN THE LIVE LAYER SENDS NOTHING ═══
       Golden rule 10: `UPDATE` puts values IN FORCE; only a take puts content ON AIR. The row
       is loaded and never taken, so it owns no live seats — and `LOAD` is list-only (`R-021`
       stage 3), so the layer is legitimately empty and the wire is quiet before we start. */
  expect(await r.loadFixed(SLOT_A, 'row-a', 'debate', { title: 'first' })).toEqual({
    accepted: true,
  });
  expect(statusOf(r, 'row-a')).not.toBe('on-air');
  expect(seats(r, 'row-a'), 'a never-taken row owns no seats').toEqual([]);

  let before = await mark();
  // Both halves of one UPDATE press: the texts AND a per-look input change (session BM-2).
  expect((await r.update('row-a', { title: 'second' }, 'merge')).accepted).toBe(true);
  expect((await r.swapLiveSource('row-a', 'live-1', 'src-preset', 'left')).ok).toBe(true);

  expect(reaching(await since(before)), 'UPDATE on a row that owns nothing').toEqual(NOTHING);
  expect(seats(r, 'row-a'), 'and it seated nothing on the way').toEqual([]);
  expect(mock?.layerState(SLOT_A)?.producer, 'the row’s own layer is still empty').toBe('empty');

  /* ═══ THE POSITIVE CONTROL FOR SCENARIO 1 — the instrument is live ═══
       The same bridge, the same trace, one TAKE: the wire must light up. Without this, every
       "nothing reached the wire" above would be satisfied by a broken trace. */
  before = await mark();
  expect((await r.take('row-a')).accepted).toBe(true);
  await waitFor(() => statusOf(r, 'row-a') === 'on-air', 10_000, 'row-a reaches ON AIR');
  const takeTraffic = reaching(await since(before));
  expect(takeTraffic.adds.length, 'the take really did ADD').toBeGreaterThan(0);
  expect(takeTraffic.plays.length, 'the take really did PLAY').toBeGreaterThan(0);
  expect(mock?.layerState(SLOT_A)?.onAir).toBe(true);
  // And the update the row was carrying is what the take seated — `B-161`'s plant sequence.
  expect(seats(r, 'row-a').length, 'the take seated the row’s plates').toBeGreaterThan(0);
  expect(frameOf(r, 'row-a', 'live-1').producer, 'seated with the UPDATE’s input').toContain('9');

  /* ═══ SCENARIO 2 — REMOVE ON AIR IS REFUSED ═══
       The refusal is the bridge's, not the button's, and "refused" means CHANGED NOTHING:
       `#removeImpl` tears down the row's live plates before the slot's own CLEAR, so a
       CLEAR-only reading would pass while every guest plate was destroyed (`B-166`). */
  const seatsBefore = seats(r, 'row-a');
  before = await mark();
  const refusal = await r.remove('row-a');

  expect(refusal.accepted, 'the BRIDGE refuses, not merely the control').toBe(false);
  expect(refusal.errorCode, 'the code both sides share').toBe(REMOVE_ON_AIR_CODE);
  // It names the way OUT — the half that keeps a held verb from reading as a broken console.
  // The canonical SENTENCE is the renderer's (`removeRowRefusal.dom.test.ts`); this is the
  // wire's half of it.
  expect(refusal.message ?? '', 'names STOP').toMatch(/STOP/);
  expect(refusal.message ?? '', 'names CLEAR').toMatch(/CLEAR/);
  expect(reaching(await since(before)), 'a refusal sends nothing').toEqual(NOTHING);
  expect(mock?.layerState(SLOT_A)?.producer).not.toBe('empty');
  expect(mock?.layerState(SLOT_A)?.onAir).toBe(true);
  expect(seats(r, 'row-a'), 'and every live plate survived it').toEqual(seatsBefore);
  expect(
    r.stackSnapshot().map((i) => i.itemId),
    'the row is still on the stack',
  ).toContain('row-a');

  /* ═══ SCENARIO 3 — AN AUDIO CHANGE PLAYS NOTHING ═══
       On a SECOND row, loaded and never taken. A plate's volume is a configuration statement;
       a row that owns no seats must get no PLAY, no MIXER VOLUME and no fill from it. */
  expect(await r.loadFixed(SLOT_B, 'row-b', 'debate', { title: 'ready' })).toEqual({
    accepted: true,
  });
  expect(statusOf(r, 'row-b')).not.toBe('on-air');

  before = await mark();
  expect((await r.setLivePlateVolume('row-b', 'live-1', 1)).ok).toBe(true);
  expect((await r.setLivePlateVolumes('row-b', { 'live-1': 1, 'live-2': 0, 'live-3': 0 })).ok).toBe(
    true,
  );

  expect(reaching(await since(before)), 'audio on a ready row reaches nothing').toEqual(NOTHING);
  expect(seats(r, 'row-b'), 'and seated nothing to land on').toEqual([]);
  expect(statusOf(r, 'row-b'), 'the ready row did not go on air').not.toBe('on-air');
  expect(mock?.layerState(SLOT_B)?.producer).toBe('empty');
  // The intent WAS recorded — the change landed in state, which is what makes it an UPDATE
  // rather than a no-op, and what the next take will seat.
  expect(r.livePlateVolumes('row-b')).toEqual({ 'live-1': 1, 'live-2': 0, 'live-3': 0 });
  // …and the ON-AIR row beside it was not disturbed by any of it.
  expect(mock?.layerState(SLOT_A)?.onAir, 'row A is still on air').toBe(true);

  /* ═══ SCENARIO 4 — A LOOK SWITCH PRESERVES THE SOURCE-TO-FRAME RELATIONSHIP ═══
       On the ON-AIR row, carrying a LEVEL-3 per-look binding (scenario 1's swap): frame 1 shows
       the preset feed in LEFT. A switch that re-derived the frames from the TEMPLATE would put
       the same source back for the wrong reason; only the row's own composition survives. */
  const framesBefore = leftFrames(r, 'row-a');
  expect(framesBefore['live-1']?.producer, 'frame 1 is seated').toBeDefined();
  expect(framesBefore['live-1']?.producer, 'and carries the per-look binding').toContain('9');
  expect(framesBefore['live-1']?.rendered, 'frame 1 is on screen in LEFT').not.toBeNull();
  expect(framesBefore['live-2']?.rendered, 'frame 2 is on screen in LEFT').not.toBeNull();

  expect((await r.setActiveLook('row-a', 'right')).ok).toBe(true);
  // POSITIVE CONTROL: the picture really moved before it was moved back.
  expect(frameOf(r, 'row-a', 'live-1').rendered, 'frame 1 is off screen in RIGHT').toBeNull();
  expect(frameOf(r, 'row-a', 'live-3').rendered, 'frame 3 is on screen in RIGHT').not.toBeNull();

  before = await mark();
  expect((await r.setActiveLook('row-a', 'left')).ok).toBe(true);

  expect(leftFrames(r, 'row-a'), 'same producer, same layer, same rect').toEqual(framesBefore);
  const backTraffic = reaching(await since(before));
  expect(backTraffic.fits.length, 'coming back is geometry').toBeGreaterThan(0);
  expect(backTraffic.plays, 'no producer was rebuilt on the way back').toEqual([]);

  /* ═══ SCENARIO 5 — CLEAR AND STOP BEHAVE EXACTLY AS CONTRACTED ═══
       Hardware-verified on CasparCG 2.3.2 (`stop-verb.integration.test.ts`): STOP leaves the
       producer resident so PLAY resumes with no re-ADD; CLEAR destroys it. Asserted here on a
       row that has already been updated, taken, refused a REMOVE and switched looks. */
  before = await mark();
  expect((await r.stopItem('row-a')).accepted).toBe(true);
  let lines = await since(before);
  expect(
    lines.some((l) => l.startsWith('CG 1-1 STOP')),
    'STOP sends CG STOP',
  ).toBe(true);
  expect(
    lines.some((l) => l.startsWith('CLEAR 1-1')),
    'STOP is not a CLEAR',
  ).toBe(false);
  expect(
    lines.some((l) => l.startsWith('CG 1-1 ADD')),
    'STOP is not a re-ADD',
  ).toBe(false);
  await waitFor(() => statusOf(r, 'row-a') === 'loaded', 10_000, 'row-a settles at LOADED');
  expect(mock?.layerState(SLOT_A)?.producer, 'the producer is resident').toBe('html');

  // …and the resume it exists for: a bare PLAY, no re-ADD.
  before = await mark();
  expect((await r.take('row-a')).accepted).toBe(true);
  lines = await since(before);
  expect(
    lines.some((l) => l.startsWith('CG 1-1 PLAY')),
    'resumed',
  ).toBe(true);
  expect(
    lines.some((l) => l.startsWith('CG 1-1 ADD')),
    'not reloaded',
  ).toBe(false);
  await waitFor(() => statusOf(r, 'row-a') === 'on-air', 10_000, 'row-a back ON AIR');

  // CLEAR is the escalation, and it DESTROYS.
  expect((await r.out('row-a')).accepted).toBe(true);
  await waitFor(
    () => mock?.layerState(SLOT_A)?.producer !== 'html',
    10_000,
    'CLEAR destroys the producer',
  );
  expect(seats(r, 'row-a'), 'and takes the row’s live plates with it').toEqual([]);

  /* ═══ SCENARIO 6 — THE RESTART NOTICE FIRES, AND ONE PRESS RESTORES ═══
       `B-225`/`B-227`'s contract is DETECT AND SAY, ONE PRESS — automatic restore was REFUSED,
       so the scenario has to exercise the PRESS, not only the notice. Row A is put back on air
       first so the restart has something to take away. */
  expect((await r.take('row-a')).accepted).toBe(true);
  await waitFor(() => statusOf(r, 'row-a') === 'on-air', 10_000, 'row-a on air before restart');
  expect(mock?.layerState(SLOT_A)?.onAir).toBe(true);

  await restartCasparCG(r);
  await waitFor(() => r.emptiedAir() !== null, 20_000, 'the emptied-air notice');

  const notice = r.emptiedAir();
  expect(
    notice?.rows.map((row) => row.itemId),
    'it names the row the server took',
  ).toEqual(['row-a']);
  // 🔴 THE LOAD-BEARING HALF: between the restart and the press, NOTHING was put back.
  before = await mark();
  await delay(400);
  expect(reaching(await since(before)), 'the notice is a sentence, not an action').toEqual(NOTHING);
  expect(statusOf(r, 'row-a'), 'and the row is not claiming air').not.toBe('on-air');

  // …AND THE ONE PRESS.
  before = await mark();
  expect(await r.restoreEmptiedAir(['row-a'])).toMatchObject({ restored: 1 });

  const restoreTraffic = reaching(await since(before));
  expect(restoreTraffic.adds.length, 'the press re-ADDed').toBeGreaterThan(0);
  expect(restoreTraffic.plays.length, 'the press PLAYed').toBeGreaterThan(0);
  await waitFor(() => statusOf(r, 'row-a') === 'on-air', 10_000, 'row-a restored to ON AIR');
  expect(mock?.layerState(SLOT_A)?.onAir, 'the channel really carries it again').toBe(true);
  expect(r.emptiedAir(), 'and the notice retires with the situation').toBeNull();
}, 180_000);
