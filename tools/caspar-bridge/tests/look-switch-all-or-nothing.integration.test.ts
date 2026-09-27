import * as dgram from 'node:dgram';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMock, defaultHandlers, type AmcpHandler, type MockHandle } from '@cg/amcp-mock';
import { DEFAULT_LAYER_POLICY } from '@cg/caspar-client';
import {
  fixedBankSlots,
  type ConnectionConfig,
  type FixedLayerBank,
  type SourceAssignments,
  type SourceCatalog,
  type TemplateInfo,
} from '@cg/shared-ipc';
import { CasparRuntime } from '../src/caspar-runtime.js';
import { validateFixedBank } from '../src/fixed-layers-store.js';
import { awaitChannelModeRead, HEALTH_MS } from './support/harness.js';

/**
 * 🔴 `LOOK-SWITCH-01` / `B-273` — **A LOOK SWITCH AIRS ALL OF ITS NEW LOOK OR NONE OF IT, AND EVERY
 * PLATE IS SEATED HIDDEN.**
 *
 * The owner's decision (2026-09-27): if a plate the new look needs is refused, the page never moves
 * and nothing on air changes; if every plate is accepted, the switch lands as before. The Playout's
 * core team's pattern for it (`PLAYOUT-CG-RESPONSE-V13-STATE` §3.2): hide and mute first
 * (`OPACITY 0`, `VOLUME 0` and the fit, as `DEFER`, then one `MIXER <ch> COMMIT`), then `PLAY`, then
 * reveal (`OPACITY 1`) in the action's one commit — on EVERY seating path.
 *
 * Asserted ON THE WIRE (the mock's trace) and on the mock's own layer state. Each absence is read
 * off a window whose positive control is on the same wire. CasparCG 2.5.0 answers a refused
 * command with ONE line, `<code> <COMMAND> FAILED`, which is what the refusing handlers send.
 */

let mocks: MockHandle[] = [];
let runtime: CasparRuntime | null = null;
let traces: string[] = [];

afterEach(async () => {
  await runtime?.stop();
  runtime = null;
  for (const m of mocks) await m.stop();
  mocks = [];
  for (const t of traces) if (fs.existsSync(t)) fs.rmSync(t);
  traces = [];
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

const BANK: FixedLayerBank = { channel: 2, start: 80, count: 20, low: { start: 50, count: 10 } };
const BED = { channel: 2, layer: 59 };
const TWO = 'two-box';
const THREE = 'three-box';

const CATALOG: SourceCatalog = {
  sources: [1, 2, 3].map((n) => ({
    id: `src-${String(n)}`,
    name: `studio${String(n)}`,
    format: '1080p5000',
    producer: { kind: 'decklink' as const, device: n },
  })),
  layerRange: { start: 60, end: 79 },
};

const ASSIGNMENTS: SourceAssignments = {
  assignments: [
    { templateId: TWO, plateId: 'l1', sourceId: 'src-1' },
    { templateId: TWO, plateId: 'l2', sourceId: 'src-2' },
    { templateId: THREE, plateId: 'l1', sourceId: 'src-1' },
    { templateId: THREE, plateId: 'l2', sourceId: 'src-2' },
    { templateId: THREE, plateId: 'l3', sourceId: 'src-3' },
  ],
};

const SCENE = { width: 1920, height: 1080 };
const CENTRED = { anchor: 'center' as const, offset: { x: 0, y: 0 } };
const FULL = { x: 0, y: 0, width: 1920, height: 1080 };

function plate(id: string, rect: { x: number; y: number; width: number; height: number }) {
  return { elementId: `el-${id}`, sourceId: id, rect, expectedAspect: 16 / 9, dynamic: false };
}

/** The owner's `2ghab` shape: `look-1` shows l1 full frame; `look-2` shows l1 and l2 side by side. */
function twoBox(): TemplateInfo {
  const left = { x: 0, y: 0, width: 1004, height: 1080 };
  const right = { x: 1004, y: 0, width: 916, height: 1080 };
  return {
    templateId: TWO,
    templateType: 'custom',
    fields: [],
    liveSources: {
      resolution: SCENE,
      defaultPosition: CENTRED,
      sources: [plate('l1', FULL), plate('l2', right)],
      looks: [
        { id: 'look-1', name: 'look-1', entered: { mode: 'cut' }, rects: { l1: FULL } },
        { id: 'look-2', name: 'look-2', entered: { mode: 'cut' }, rects: { l1: left, l2: right } },
      ],
      defaultLookId: 'look-1',
    },
  };
}

/** `look-1` shows l1 full frame; `look-3` shows l1, l2 and l3 in thirds. */
function threeBox(): TemplateInfo {
  const third = (i: number) => ({ x: 640 * i, y: 0, width: 640, height: 1080 });
  return {
    templateId: THREE,
    templateType: 'custom',
    fields: [],
    liveSources: {
      resolution: SCENE,
      defaultPosition: CENTRED,
      sources: [plate('l1', FULL), plate('l2', third(1)), plate('l3', third(2))],
      looks: [
        { id: 'look-1', name: 'look-1', entered: { mode: 'cut' }, rects: { l1: FULL } },
        {
          id: 'look-3',
          name: 'look-3',
          entered: { mode: 'cut' },
          rects: { l1: third(0), l2: third(1), l3: third(2) },
        },
      ],
      defaultLookId: 'look-1',
    },
  };
}

/**
 * Which lines a stand-in refuses, and with what code: `<code> <VERB> FAILED` with nothing after it,
 * exactly as 2.5.0 answers. Every other line goes to the mock's own handler.
 */
let refusals: { match: RegExp; code: number }[] = [];

function refusingHandler(verb: string): AmcpHandler {
  const fallback = defaultHandlers().get(verb);
  if (fallback === undefined) throw new Error(`no default ${verb}`);
  return (req, ctx) => {
    const hit = refusals.find((r) => r.match.test(req.raw));
    if (hit !== undefined) return { kind: 'ok', code: hit.code as 202, verb: `${verb} FAILED` };
    return fallback(req, ctx);
  };
}

const REFUSABLE = ['PLAY', 'MIXER', 'CG', 'CLEAR'];

function refusing(m: MockHandle, verb: string): void {
  m.setHandler(verb, refusingHandler(verb));
}

/** What `newMock` answers `verb` with: the refusing stand-in, or the mock's own handler. */
function standIn(verb: string): AmcpHandler {
  if (REFUSABLE.includes(verb)) return refusingHandler(verb);
  const handler = defaultHandlers().get(verb);
  if (handler === undefined) throw new Error(`no default ${verb}`);
  return handler;
}

/**
 * 🔴 `TIMING-TESTS-01` — **THE MOCK ANSWERS ONE CONNECTION IN ORDER, AS CASPARCG DOES.** Each
 * command is handled only once the command before it has been answered, so a reply held on a
 * promise holds every reply behind it. Left to itself the mock dispatches every line at once, and a
 * reply held in one handler is overtaken by the next command's — which the bridge's queue, pairing
 * replies by position, hands to the HELD command. Measured: `out`'s `202 CLEAR` settled the
 * switch's held `PLAY`, so the preroll began before `out` had finished and the test's margin was
 * about 10 ms, not the 120 ms its comment described.
 *
 * `arrived` hears each line as it LANDS on the mock's wire, before it waits its turn.
 */
function answerInOrder(
  m: MockHandle,
  handlerFor: (verb: string) => AmcpHandler,
  arrived: (raw: string) => void,
): void {
  let turn: Promise<unknown> = Promise.resolve();
  for (const verb of defaultHandlers().keys()) {
    const handler = handlerFor(verb);
    m.setHandler(verb, (req, ctx) => {
      arrived(req.raw);
      const answer = turn.then(() => handler(req, ctx));
      turn = answer.catch(() => undefined);
      return answer;
    });
  }
}

/**
 * 🔴 `TIMING-TESTS-01` — **HOLD THE NEXT TIMER OF EXACTLY `ms` UNTIL THE TEST FIRES IT.** Every
 * other timer runs as scheduled, and the intercept removes itself once it has caught one.
 * `scheduled` resolves when that timer is set; `restore` undoes an intercept that caught nothing.
 */
function holdNextTimer(ms: number): {
  scheduled: Promise<void>;
  fire: () => void;
  restore: () => void;
} {
  const real = globalThis.setTimeout;
  let held: (() => void) | undefined;
  let heard: () => void = () => undefined;
  const scheduled = new Promise<void>((resolve) => {
    heard = resolve;
  });
  const spy = vi.spyOn(globalThis, 'setTimeout').mockImplementation(((
    callback: (...args: unknown[]) => void,
    delay?: number,
    ...args: unknown[]
  ) => {
    if (held === undefined && delay === ms) {
      held = () => {
        callback(...args);
      };
      spy.mockRestore();
      heard();
      return real(() => undefined, 0);
    }
    return real(callback, delay, ...args);
  }) as unknown as typeof setTimeout);
  return {
    scheduled,
    fire: () => {
      if (held === undefined) throw new Error(`no ${String(ms)} ms timer was held`);
      held();
    },
    restore: () => {
      spy.mockRestore();
    },
  };
}

async function newMock(): Promise<{ mock: MockHandle; oscPort: number; trace: string }> {
  const oscPort = await freeUdpPort();
  const trace = path.join(
    os.tmpdir(),
    `cg-look-aon-${String(process.pid)}-${String(Date.now())}-${String(Math.round(performance.now() * 1000))}.ndjson`,
  );
  const mock = await createMock({
    amcpPort: 0,
    oscPort,
    oscHost: '127.0.0.1',
    oscHz: 30,
    channels: 2,
    tracePath: trace,
  });
  for (const verb of REFUSABLE) refusing(mock, verb);
  mocks.push(mock);
  traces.push(trace);
  return { mock, oscPort, trace };
}

interface TraceLine {
  readonly ts: string;
  readonly dir: 'recv' | 'send';
  readonly line: string;
}

async function traceOf(m: MockHandle, trace: string): Promise<TraceLine[]> {
  await m.traceFlush();
  return fs
    .readFileSync(trace, 'utf-8')
    .split('\n')
    .filter((l) => l.length > 0)
    .map((l) => JSON.parse(l) as TraceLine);
}

interface Rig {
  readonly r: CasparRuntime;
  readonly mock: MockHandle;
  /** Everything the mock RECEIVED (what the bridge sent) since `from`, in order. */
  sentSince(from: number): Promise<string[]>;
  mark(): Promise<number>;
  /** The raw trace from `from`: the bridge's lines (`recv`) AND the mock's replies (`send`). */
  exchangeSince(from: number): Promise<TraceLine[]>;
}

async function boot(
  options: {
    readonly bank?: FixedLayerBank;
    readonly catalog?: SourceCatalog;
    readonly fixedSlots?: readonly { channel: number; layer: number }[];
    /** The look-switch hold; 0 (the default here) keeps the order and skips the sleeps. */
    readonly holdMs?: number;
  } = {},
): Promise<Rig> {
  refusals = [];
  const { mock, oscPort, trace } = await newMock();
  const bank = options.bank ?? BANK;
  const config: ConnectionConfig = {
    servers: { A: { host: '127.0.0.1', amcpPort: mock.amcpPort, oscPort } },
    strategy: 'mirror-sync',
    autoFailoverEnabled: true,
  };
  const r = new CasparRuntime(
    config,
    {},
    {
      fixedSlots:
        options.fixedSlots ??
        validateFixedBank(bank, { policy: DEFAULT_LAYER_POLICY, reservedLayers: [] }),
      fixedBanks: [bank],
      layerPolicy: DEFAULT_LAYER_POLICY,
      reservedLayers: [],
      lookMixerHoldMs: options.holdMs ?? 0,
      sourceCatalog: options.catalog ?? CATALOG,
      sourceAssignments: ASSIGNMENTS,
    },
  );
  runtime = r;
  r.start();
  await r.startServing();
  r.templateImport(twoBox(), '<!doctype html><html><body>two-box</body></html>');
  r.templateImport(threeBox(), '<!doctype html><html><body>three-box</body></html>');
  await r.whenServerHealthy(HEALTH_MS);
  await awaitChannelModeRead(r);
  await new Promise((resolve) => setTimeout(resolve, 250));
  const exchangeSince = async (from: number) => (await traceOf(mock, trace)).slice(from);
  return {
    r,
    mock,
    exchangeSince,
    mark: async () => (await traceOf(mock, trace)).length,
    sentSince: async (from) =>
      (await exchangeSince(from)).filter((e) => e.dir === 'recv').map((e) => e.line),
  };
}

const layerOf = (m: MockHandle, layer: number, channel = 2) => m.layerState({ channel, layer });
const row = (r: CasparRuntime, itemId = 'bed-59') =>
  r.stackSnapshot().find((i) => i.itemId === itemId);

/** Load the bed on `templateId`, take it on `look-1`. Refusals in force during the take apply. */
async function takeOnLookOne(r: CasparRuntime, templateId = TWO): Promise<void> {
  expect(await r.loadFixed(BED, 'bed-59', templateId, {})).toEqual({ accepted: true });
  expect(await r.take('bed-59')).toEqual({ accepted: true });
  expect(r.activeLookId('bed-59')).toBe('look-1');
}

/**
 * 🔴 THE HIDE RULE, READ OFF A WIRE: every `PLAY` onto `<ch>-<layer>` is preceded by that layer's
 * `OPACITY 0` and `VOLUME 0`, both `DEFER`, and by a `MIXER <ch> COMMIT` after them — so the
 * producer starts on a layer that is already hidden and muted.
 */
function expectHiddenBeforeEveryPlay(lines: readonly string[], channel = 2): number {
  let plays = 0;
  for (const [p, line] of lines.entries()) {
    const m = /^PLAY (\d+)-(\d+) /.exec(line);
    if (m === null) continue;
    plays += 1;
    const target = `${m[1] as string}-${m[2] as string}`;
    const before = lines.slice(0, p);
    const hide = before.lastIndexOf(`MIXER ${target} OPACITY 0 DEFER`);
    const mute = before.lastIndexOf(`MIXER ${target} VOLUME 0 DEFER`);
    expect(hide, `${line}: its layer was hidden first`).toBeGreaterThanOrEqual(0);
    expect(mute, `${line}: and muted first`).toBeGreaterThanOrEqual(0);
    const commit = before.lastIndexOf(`MIXER ${String(channel)} COMMIT`);
    expect(commit, `${line}: and the hide was committed before it`).toBeGreaterThan(
      Math.max(hide, mute),
    );
  }
  return plays;
}

// ─────────────────────────────── ALL OR NOTHING (`B-273`) ───────────────────────────────

describe('B-273 — a look switch airs all of its new look or none of it', () => {
  it('🔴 REFUSED 1 → 2 — no page UPDATE and no MIXER COMMIT after the hide, plate 1 untouched, plate 2 not cleared, the row on its old look with the line', async () => {
    const { r, mock, mark, sentSince } = await boot();
    // Plate 2's input is refused at the take: its PRESET is dropped (a preset never fails the take).
    refusals = [{ match: /^PLAY 2-\d+ DECKLINK DEVICE 2$/, code: 404 }];
    await takeOnLookOne(r);
    expect(
      r
        .liveLayers()
        .get('bed-59')
        ?.map((rec) => rec.sourceId),
    ).toEqual(['l1']);
    const plate1 = layerOf(mock, 60);
    expect(plate1?.producer).toBe('decklink');

    const from = await mark();
    const verdict = await r.setActiveLook('bed-59', 'look-2');

    expect(verdict).toMatchObject({ ok: false, reason: 'amcp-404', refusalOnRow: true });
    const lines = await sentSince(from);
    // The whole switch, on the wire: plate 2 hidden in ONE commit, its PLAY refused — and nothing
    // after it. No page `UPDATE` and no further `MIXER COMMIT`.
    expect(lines).toEqual([
      'MIXER 2-61 OPACITY 0 DEFER',
      'MIXER 2-61 VOLUME 0 DEFER',
      'MIXER 2-61 FILL 0.522917 0.261458 0.477083 0.477083 DEFER',
      'MIXER 2-61 CLIP 0.522917 0.261458 0.477083 0.477083 DEFER',
      'MIXER 2 COMMIT',
      'PLAY 2-61 DECKLINK DEVICE 2',
    ]);
    // Plate 1 (already live) is untouched: not one line addressed to its layer, and the server
    // still shows it where it was.
    expect(lines.some((l) => / 2-60( |$)/.test(l))).toBe(false);
    expect(layerOf(mock, 60)).toMatchObject({
      producer: 'decklink',
      fill: plate1?.fill,
      clip: plate1?.clip,
      opacity: 1,
    });
    // Plate 2's PLAY was REFUSED, so it seated nothing and its layer is not cleared.
    expect(lines).not.toContain('CLEAR 2-61');
    expect(lines).not.toContain('MIXER 2-61 CLEAR');
    expect(layerOf(mock, 61)?.producer ?? 'empty').toBe('empty');
    // The row still reads the old look, with FIELD-FIXES-01's line naming the plate and source.
    expect(r.activeLookId('bed-59')).toBe('look-1');
    expect(row(r)?.takeRefusal).toEqual({
      code: 'amcp-404',
      command: 'PLAY 2-61 DECKLINK DEVICE 2',
      plateId: 'l2',
      sourceId: 'src-2',
      sourceName: 'studio2',
    });
    // It is still ON AIR — a refused switch is not a refused take.
    expect(row(r)?.status).not.toBe('error');
    expect(
      r
        .liveLayers()
        .get('bed-59')
        ?.map((rec) => rec.sourceId),
    ).toEqual(['l1']);
  });

  it('🔴 VARIANT 1 → 3 — plate 2 lands and plate 3 is refused: plate 2 is cleared, and only plate 2', async () => {
    const { r, mock, mark, sentSince } = await boot();
    refusals = [{ match: /^PLAY 2-\d+ DECKLINK DEVICE [23]$/, code: 404 }];
    await takeOnLookOne(r, THREE);
    refusals = [{ match: /^PLAY 2-\d+ DECKLINK DEVICE 3$/, code: 404 }];

    const from = await mark();
    const verdict = await r.setActiveLook('bed-59', 'look-3');

    expect(verdict).toMatchObject({ ok: false, refusalOnRow: true });
    const lines = await sentSince(from);
    // Both new plates were hidden in ONE commit before either PLAY.
    expect(lines.filter((l) => l === 'MIXER 2 COMMIT')).toEqual(['MIXER 2 COMMIT']);
    expect(lines).toContain('PLAY 2-61 DECKLINK DEVICE 2');
    expect(lines).toContain('PLAY 2-62 DECKLINK DEVICE 3');
    // Plate 2 LANDED, so this switch put it there: it comes back off, mixer and all.
    expect(lines).toContain('CLEAR 2-61');
    expect(lines).toContain('MIXER 2-61 CLEAR');
    expect(layerOf(mock, 61)?.producer ?? 'empty').toBe('empty');
    // Plate 3 was REFUSED: the server left 2-62 as it was, so it is not cleared.
    expect(lines).not.toContain('CLEAR 2-62');
    expect(lines).not.toContain('MIXER 2-62 CLEAR');
    // …and nothing else: no page UPDATE, nothing addressed to plate 1.
    expect(lines.some((l) => l.startsWith('CG '))).toBe(false);
    expect(lines.some((l) => / 2-60( |$)/.test(l))).toBe(false);
    expect(layerOf(mock, 60)?.producer).toBe('decklink');
    expect(r.activeLookId('bed-59')).toBe('look-1');
    expect(row(r)?.takeRefusal).toMatchObject({ plateId: 'l3', sourceName: 'studio3' });
    expect(
      r
        .liveLayers()
        .get('bed-59')
        ?.map((rec) => rec.sourceId),
    ).toEqual(['l1']);
  });

  it('CONTROL — every plate accepted: the switch completes, the new plate on air and shown', async () => {
    const { r, mock, mark, sentSince } = await boot();
    refusals = [{ match: /^PLAY 2-\d+ DECKLINK DEVICE 2$/, code: 404 }];
    await takeOnLookOne(r);
    refusals = [];

    const from = await mark();
    expect(await r.setActiveLook('bed-59', 'look-2')).toEqual({ ok: true });

    const lines = await sentSince(from);
    expect(lines.some((l) => l.startsWith('CG 2-59 UPDATE'))).toBe(true);
    expect(r.activeLookId('bed-59')).toBe('look-2');
    expect(layerOf(mock, 61)).toMatchObject({ producer: 'decklink', opacity: 1, volume: 0 });
    expect(layerOf(mock, 60)?.opacity).toBe(1);
    expect(row(r)?.takeRefusal).toBeUndefined();
    expect(mock.stagedMixerCount(2), 'nothing left staged').toBe(0);
  });

  it('the row’s line is withdrawn by the next switch that lands', async () => {
    const { r } = await boot();
    refusals = [{ match: /^PLAY 2-\d+ DECKLINK DEVICE 2$/, code: 404 }];
    await takeOnLookOne(r);
    expect((await r.setActiveLook('bed-59', 'look-2')).ok).toBe(false);
    expect(row(r)?.takeRefusal).toBeDefined();

    refusals = [];
    expect(await r.setActiveLook('bed-59', 'look-2')).toEqual({ ok: true });
    expect(row(r)?.takeRefusal).toBeUndefined();
  });
});

// ─────────────────────────────── HELD PLATES ───────────────────────────────

describe('held plates', () => {
  it('a switch whose new plates are all HELD sends no PLAY, and hides nothing', async () => {
    const { r, mark, sentSince } = await boot();
    // Every preset lands at the take, so plate 2 is seated and held when look-2 is entered.
    await takeOnLookOne(r);
    expect(
      r
        .liveLayers()
        .get('bed-59')
        ?.find((rec) => rec.sourceId === 'l2')?.held,
    ).toBe(true);

    const from = await mark();
    expect(await r.setActiveLook('bed-59', 'look-2')).toEqual({ ok: true });

    const lines = await sentSince(from);
    // The positive control: the switch DID move plates on this wire.
    expect(lines.some((l) => /^MIXER 2-60 FILL /.test(l))).toBe(true);
    expect(lines.some((l) => l.startsWith('PLAY '))).toBe(false);
    expect(lines.some((l) => l.includes(' OPACITY '))).toBe(false);
  });
});

// ─────────────────────────────── ORDER ───────────────────────────────

describe('order', () => {
  it('🔴 every pre-seat PLAY is ANSWERED before the page UPDATE, and the reveal is in the one commit after it', async () => {
    const { r, mark, exchangeSince } = await boot();
    refusals = [{ match: /^PLAY 2-\d+ DECKLINK DEVICE 2$/, code: 404 }];
    await takeOnLookOne(r);
    refusals = [];

    const from = await mark();
    expect(await r.setActiveLook('bed-59', 'look-2')).toEqual({ ok: true });
    const ex = await exchangeSince(from);

    const playAt = ex.findIndex((e) => e.dir === 'recv' && e.line.startsWith('PLAY 2-61 '));
    // The mock answers `202 PLAY` (its serializer writes the code and the verb).
    const replyAt = ex.findIndex(
      (e, i) => i > playAt && e.dir === 'send' && /^\d{3} PLAY\b/.test(e.line),
    );
    const tellAt = ex.findIndex((e) => e.dir === 'recv' && e.line.startsWith('CG 2-59 UPDATE'));
    expect(playAt).toBeGreaterThanOrEqual(0);
    expect(ex[replyAt]?.line, 'the PLAY was answered').toMatch(/^202 /);
    expect(replyAt, 'before the page was told anything').toBeLessThan(tellAt);

    const after = ex
      .slice(tellAt)
      .filter((e) => e.dir === 'recv')
      .map((e) => e.line);
    const reveal = after.indexOf('MIXER 2-61 OPACITY 1 DEFER');
    const commits = after.filter((l) => l === 'MIXER 2 COMMIT');
    expect(reveal, 'the reveal comes after the page UPDATE').toBeGreaterThan(0);
    expect(commits, 'in ONE commit').toEqual(['MIXER 2 COMMIT']);
    expect(after.indexOf('MIXER 2 COMMIT')).toBeGreaterThan(reveal);
    // …the same commit that moves plate 1 (the frame every box lands on).
    expect(after.indexOf('MIXER 2-60 FILL 0 0.238542 0.522917 0.522917 DEFER')).toBeGreaterThan(0);
    expect(after.indexOf('MIXER 2-60 FILL 0 0.238542 0.522917 0.522917 DEFER')).toBeLessThan(
      after.indexOf('MIXER 2 COMMIT'),
    );
  });
});

// ─────────────────────────────── THE PRE-SEAT'S WINDOW ───────────────────────────────

describe('the pre-seat’s window — the preroll, and a row that leaves the air inside it', () => {
  it('🔴 a freshly seated plate runs hidden for three holds before the page is told — CONTROL: a switch of held plates tells the page first', async () => {
    const HOLD = 40;
    const { r, mark, exchangeSince, sentSince } = await boot({ holdMs: HOLD });
    refusals = [{ match: /^PLAY 2-\d+ DECKLINK DEVICE 2$/, code: 404 }];
    await takeOnLookOne(r);
    refusals = [];

    let from = await mark();
    expect(await r.setActiveLook('bed-59', 'look-2')).toEqual({ ok: true });
    const ex = await exchangeSince(from);
    const playAt = ex.findIndex((e) => e.dir === 'recv' && e.line.startsWith('PLAY 2-61 '));
    const replyAt = ex.findIndex(
      (e, i) => i > playAt && e.dir === 'send' && /^\d{3} PLAY\b/.test(e.line),
    );
    const tellAt = ex.findIndex((e) => e.dir === 'recv' && e.line.startsWith('CG 2-59 UPDATE'));
    const ms = (i: number): number => Date.parse(ex[i]?.ts ?? '');
    expect(replyAt).toBeGreaterThan(playAt);
    expect(tellAt).toBeGreaterThan(replyAt);
    // Three holds, less a few ms of timer and clock granularity.
    expect(
      ms(tellAt) - ms(replyAt),
      'the plate ran hidden before the page was told',
    ).toBeGreaterThanOrEqual(3 * HOLD - 5);

    // CONTROL — back to look-1 and forward again: plate 2 is now HELD, so the switch seats nothing
    // and its first line is the page tell itself.
    expect(await r.setActiveLook('bed-59', 'look-1')).toEqual({ ok: true });
    from = await mark();
    expect(await r.setActiveLook('bed-59', 'look-2')).toEqual({ ok: true });
    const held = await sentSince(from);
    expect(held[0]).toMatch(/^CG 2-59 UPDATE /);
    expect(held.some((l) => l.startsWith('PLAY '))).toBe(false);
  });

  it('🔴 a row taken OUT while its pre-seat is in flight: no page UPDATE, nothing revealed, the pre-seat undone', async () => {
    /*
      The production hold (40 ms), so the switch prerolls 120 ms after its PLAY is answered. The
      emergency verb is pressed while that PLAY is in flight; one AMCP connection answers in order,
      so `out`'s own commands run behind the PLAY and complete inside the preroll — the window this
      guards. (With no preroll there is no such window: nothing interleaves between the answer and
      the re-ask.)

      🔴 `TIMING-TESTS-01` — EVERY STEP IS ORDERED BY THE TEST, NONE BY A SLEEP. It was a 150 ms
      delay on the PLAY and a 50 ms sleep before `out`, and under the gate's load `out` did not
      finish inside the preroll. Now:
        1. the mock answers in order (`answerInOrder`), so each reply settles its own command;
        2. plate 2's PLAY is held, and `out` is pressed once that PLAY has LANDED;
        3. the PLAY is released once `out`'s first command has landed behind it — the only one that
           can while the PLAY is unanswered, because the teardown awaits each reply in turn;
        4. the preroll is held open until `out` has COMPLETED, so the re-ask after it is asked of a
           row that has left the air. That is the precondition, asserted rather than hoped.
    */
    const HOLD = 40;
    const { r, mock, mark, sentSince } = await boot({ holdMs: HOLD });
    refusals = [{ match: /^PLAY 2-\d+ DECKLINK DEVICE 2$/, code: 404 }];
    await takeOnLookOne(r);
    refusals = [];

    let letPlayAnswer: () => void = () => undefined;
    const playMayAnswer = new Promise<void>((resolve) => {
      letPlayAnswer = resolve;
    });
    let playLanded: () => void = () => undefined;
    const playOnWire = new Promise<void>((resolve) => {
      playLanded = resolve;
    });
    let outLanded: () => void = () => undefined;
    const outOnWire = new Promise<void>((resolve) => {
      outLanded = resolve;
    });
    answerInOrder(
      mock,
      (verb) => {
        const answer = standIn(verb);
        if (verb !== 'PLAY') return answer;
        return async (req, ctx) => {
          if (/DECKLINK DEVICE 2$/.test(req.raw)) await playMayAnswer;
          return answer(req, ctx);
        };
      },
      (raw) => {
        if (raw === 'PLAY 2-61 DECKLINK DEVICE 2') playLanded();
        if (raw === 'CLEAR 2-60') outLanded();
      },
    );

    const from = await mark();
    const switching = r.setActiveLook('bed-59', 'look-2');
    await playOnWire;
    const out = r.out('bed-59');
    await outOnWire;
    const preroll = holdNextTimer(3 * HOLD);
    let verdict: Awaited<typeof switching>;
    try {
      letPlayAnswer();
      await preroll.scheduled;
      expect((await out).accepted, '`out` completed inside the preroll').toBe(true);
      preroll.fire();
      verdict = await switching;
    } finally {
      preroll.restore();
    }

    expect(verdict).toMatchObject({ ok: false, reason: 'not-live' });
    const lines = await sentSince(from);
    // The positive control: the pre-seat's PLAY IS on this wire…
    expect(lines).toContain('PLAY 2-61 DECKLINK DEVICE 2');
    // …the page was never told, nothing was revealed, and what the pre-seat started came off.
    expect(lines.some((l) => l.startsWith('CG 2-59 UPDATE'))).toBe(false);
    expect(lines).not.toContain('MIXER 2-61 OPACITY 1 DEFER');
    expect(lines).toContain('CLEAR 2-61');
    expect(layerOf(mock, 61)?.producer ?? 'empty').toBe('empty');
    expect(r.liveLayers().has('bed-59'), 'no ledger resurrected for a row off air').toBe(false);
  });
});

// ─────────────────────────────── HIDDEN BEFORE PLAY ───────────────────────────────

describe('hidden before PLAY — take, switch, swap', () => {
  it('🔴 TAKE — both plates hidden and muted, committed, before their PLAYs; CONTROL: the page layer’s take order is unchanged', async () => {
    const { r, mock, mark, sentSince } = await boot();
    expect(await r.loadFixed(BED, 'bed-59', TWO, {})).toEqual({ accepted: true });
    expect(await r.setActiveLook('bed-59', 'look-2')).toEqual({ ok: true });
    const from = await mark();
    expect(await r.take('bed-59')).toEqual({ accepted: true });
    const lines = await sentSince(from);

    expect(expectHiddenBeforeEveryPlay(lines), 'the positive control: there WERE plays').toBe(2);
    // The page's own lines keep their order: mute, ADD, unmute first; its CG PLAY last.
    expect(lines.slice(0, 3).map((l) => l.split(' ').slice(0, 3).join(' '))).toEqual([
      'MIXER 2-59 VOLUME',
      'CG 2-59 ADD',
      'MIXER 2-59 VOLUME',
    ]);
    expect(lines[lines.length - 1]).toBe('CG 2-59 PLAY 0');
    for (const layer of [60, 61]) expect(layerOf(mock, layer)?.opacity).toBe(1);
  });

  it('🔴 SWITCH — the pre-seated plate is hidden, committed, before its PLAY', async () => {
    const { r, mark, sentSince } = await boot();
    refusals = [{ match: /^PLAY 2-\d+ DECKLINK DEVICE 2$/, code: 404 }];
    await takeOnLookOne(r);
    refusals = [];
    const from = await mark();
    expect(await r.setActiveLook('bed-59', 'look-2')).toEqual({ ok: true });
    expect(expectHiddenBeforeEveryPlay(await sentSince(from))).toBe(1);
  });

  it('🔴 SWAP onto a FRESH layer — hidden before its PLAY, and revealed in its one commit', async () => {
    const { r, mock, mark, sentSince } = await boot();
    expect(await r.loadFixed(BED, 'bed-59', TWO, {})).toEqual({ accepted: true });
    expect(await r.setActiveLook('bed-59', 'look-2')).toEqual({ ok: true });
    expect(await r.take('bed-59')).toEqual({ accepted: true });

    // Point l1 at studio3 in look-2 ONLY: look-1 still binds studio1, so studio3 takes a FRESH layer.
    const from = await mark();
    expect((await r.swapLiveSource('bed-59', 'l1', 'src-3', 'look-2')).ok).toBe(true);
    const lines = await sentSince(from);
    expect(expectHiddenBeforeEveryPlay(lines)).toBe(1);
    const play = lines.indexOf('PLAY 2-62 DECKLINK DEVICE 3');
    expect(lines.indexOf('MIXER 2-62 OPACITY 1 DEFER')).toBeGreaterThan(play);
    expect(layerOf(mock, 62)).toMatchObject({ producer: 'decklink', opacity: 1 });
  });

  it('🔴 a swap or restore that REPLACES IN PLACE is never hidden — a refused PLAY must not take the working picture off air', async () => {
    const { r, mock, mark, sentSince } = await boot();
    expect(await r.loadFixed(BED, 'bed-59', TWO, {})).toEqual({ accepted: true });
    expect(await r.setActiveLook('bed-59', 'look-2')).toEqual({ ok: true });
    expect(await r.take('bed-59')).toEqual({ accepted: true });

    // Point l1 at studio3 in EVERY look: studio1 leaves entirely, so studio3 replaces it on 2-60.
    let from = await mark();
    expect((await r.swapLiveSource('bed-59', 'l1', 'src-3')).ok).toBe(true);
    let lines = await sentSince(from);
    expect(lines, 'the positive control: the replace IS on this wire').toContain(
      'PLAY 2-60 DECKLINK DEVICE 3',
    );
    expect(lines).not.toContain('MIXER 2-60 OPACITY 0 DEFER');
    expect(layerOf(mock, 60)?.opacity).toBe(1);

    // …and the RESTORE, back to the assignment, is the same replace on the same layer.
    from = await mark();
    expect((await r.swapLiveSource('bed-59', 'l1', null)).ok).toBe(true);
    lines = await sentSince(from);
    expect(lines).toContain('PLAY 2-60 DECKLINK DEVICE 1');
    expect(lines).not.toContain('MIXER 2-60 OPACITY 0 DEFER');

    // Refused: the working picture stays on air, un-hidden.
    refusals = [{ match: /^PLAY 2-60 DECKLINK DEVICE 3$/, code: 404 }];
    expect((await r.swapLiveSource('bed-59', 'l1', 'src-3')).ok).toBe(false);
    expect(layerOf(mock, 60)).toMatchObject({ producer: 'decklink', opacity: 1 });
  });
});

// ─────────────────────────────── REVEAL VOLUME ───────────────────────────────

describe('the reveal restores the plate’s desired volume, never a fixed 1', () => {
  it('🔴 a plate whose desired volume is 0 stays at 0; CONTROL: a plate at 1 returns to 1', async () => {
    const { r, mock, mark, sentSince } = await boot();
    refusals = [{ match: /^PLAY 2-\d+ DECKLINK DEVICE 2$/, code: 404 }];
    await takeOnLookOne(r);
    refusals = [];
    // The operator raises plate 2 while it is not seated: the intent is recorded.
    expect(await r.setLivePlateVolume('bed-59', 'l2', 1)).toMatchObject({ ok: true });

    const from = await mark();
    expect(await r.setActiveLook('bed-59', 'look-2')).toEqual({ ok: true });
    const lines = await sentSince(from);
    expect(lines).toContain('MIXER 2-61 VOLUME 1 DEFER');
    expect(layerOf(mock, 61)).toMatchObject({ opacity: 1, volume: 1 });
    // Plate 1 was never raised: 0 it was, 0 it stays.
    expect(layerOf(mock, 60)?.volume).toBe(0);

    // The take reveals the same way: l1 at 0, l2 at its raised 1.
    const second = await boot();
    expect(await second.r.loadFixed(BED, 'bed-59', TWO, {})).toEqual({ accepted: true });
    expect(await second.r.setActiveLook('bed-59', 'look-2')).toEqual({ ok: true });
    expect(await second.r.setLivePlateVolume('bed-59', 'l2', 1)).toMatchObject({ ok: true });
    expect(await second.r.take('bed-59')).toEqual({ accepted: true });
    expect(layerOf(second.mock, 60)).toMatchObject({ opacity: 1, volume: 0 });
    expect(layerOf(second.mock, 61)).toMatchObject({ opacity: 1, volume: 1 });
  });
});

// ─────────────────────────────── RECONNECT ───────────────────────────────

async function settleFor(
  predicate: () => boolean | Promise<boolean>,
  ms: number,
): Promise<boolean> {
  const deadline = Date.now() + ms;
  while (!(await predicate())) {
    if (Date.now() >= deadline) return false;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  return true;
}

async function reconnect(rig: Rig): Promise<void> {
  rig.mock.closeAllAmcpConnections();
  expect(await settleFor(() => rig.r.health().primary.state !== 'healthy', 4000)).toBe(true);
  expect(await settleFor(() => rig.r.health().primary.state === 'healthy', 10_000)).toBe(true);
}

describe('after an AMCP reconnect, our full mixer state is re-sent', () => {
  it('🔴 the first commit after a reconnect carries every plate’s FILL, CLIP, VOLUME and OPACITY — CONTROL: a normal switch sends only its deltas', async () => {
    const rig = await boot();
    const { r, mark, sentSince } = rig;
    expect(await r.loadFixed(BED, 'bed-59', TWO, {})).toEqual({ accepted: true });
    expect(await r.setActiveLook('bed-59', 'look-2')).toEqual({ ok: true });
    expect(await r.setLivePlateVolume('bed-59', 'l2', 1)).toMatchObject({ ok: true });
    expect(await r.take('bed-59')).toEqual({ accepted: true });

    // CONTROL FIRST: an ordinary switch sends only what it moves — no re-send, nothing revealed.
    let from = await mark();
    expect(await r.setActiveLook('bed-59', 'look-1')).toEqual({ ok: true });
    const ordinary = await sentSince(from);
    expect(ordinary.some((l) => /^MIXER 2-60 FILL /.test(l))).toBe(true);
    expect(ordinary.some((l) => l.includes(' OPACITY '))).toBe(false);

    from = await mark();
    await reconnect(rig);
    // Bounded, and NOT an assertion: the red belongs on the named assertions below.
    await settleFor(async () => {
      const lines = await sentSince(from);
      return lines.slice(lines.lastIndexOf('VERSION')).includes('MIXER 2 COMMIT');
    }, 4000);
    const post = await sentSince(from);
    const handshake = post.lastIndexOf('VERSION');
    expect(handshake, 'a new connection handshook (the instrument is live)').toBeGreaterThanOrEqual(
      0,
    );
    const after = post.slice(handshake);
    const commit = after.indexOf('MIXER 2 COMMIT');
    expect(commit, 'a commit follows the reconnect').toBeGreaterThan(0);
    const set = after.slice(0, commit).filter((l) => l.endsWith(' DEFER'));
    const ledger = r.liveLayers().get('bed-59') ?? [];
    expect(ledger).toHaveLength(2);
    for (const rec of ledger) {
      const t = `2-${String(rec.slot.layer)}`;
      for (const verb of ['FILL', 'CLIP', 'VOLUME', 'OPACITY']) {
        expect(
          set.some((l) => l.startsWith(`MIXER ${t} ${verb} `)),
          `${t} ${verb}`,
        ).toBe(true);
      }
    }
    // Look-1 holds plate 2 (parked, muted); plate 1 is shown at its intent, 0.
    expect(set).toContain('MIXER 2-61 VOLUME 0 DEFER');
    expect(set).toContain('MIXER 2-60 VOLUME 0 DEFER');
    expect(set).toContain('MIXER 2-61 OPACITY 1 DEFER');
    expect(rig.mock.stagedMixerCount(2), 'nothing left staged').toBe(0);
  }, 30_000);

  it('🔴 NOTHING below layer 50 — a plate band that straddles the floor re-sends only its layers from 50 up', async () => {
    // The harness's shape, moved to straddle the floor: beds 1–9, a plate band 49–58, rows 70–79.
    const bank: FixedLayerBank = { channel: 2, start: 70, count: 10, low: { start: 1, count: 9 } };
    const rig = await boot({
      bank,
      fixedSlots: fixedBankSlots(bank),
      catalog: { ...CATALOG, layerRange: { start: 49, end: 58 } },
    });
    const { r, mark, sentSince } = rig;
    expect(await r.loadFixed({ channel: 2, layer: 9 }, 'bed-9', TWO, {})).toEqual({
      accepted: true,
    });
    expect(await r.setActiveLook('bed-9', 'look-2')).toEqual({ ok: true });
    expect(await r.take('bed-9')).toEqual({ accepted: true });
    const layers = (r.liveLayers().get('bed-9') ?? []).map((rec) => rec.slot.layer).sort();
    expect(layers, 'one plate below the floor, one above it').toEqual([49, 50]);

    const from = await mark();
    await reconnect(rig);
    await settleFor(async () => {
      const lines = await sentSince(from);
      return lines.slice(lines.lastIndexOf('VERSION')).includes('MIXER 2 COMMIT');
    }, 4000);
    const post = await sentSince(from);
    const after = post.slice(post.lastIndexOf('VERSION'));
    // The positive control: layer 50 IS re-sent…
    expect(after).toContain('MIXER 2-50 OPACITY 1 DEFER');
    // …and layer 49, one below the floor, gets nothing at all.
    expect(after.some((l) => / 2-49 /.test(l))).toBe(false);
  }, 30_000);
});

// ─────────────────────────────── THE BACKUP ───────────────────────────────

describe('the backup gets the same order', () => {
  it('🔴 the backup’s JOURNAL REPLAY carries the switch in the primary’s order — hide, commit, PLAY, tell, reveal, commit', async () => {
    refusals = [];
    const a = await newMock();
    const b = await newMock();
    const config: ConnectionConfig = {
      servers: {
        A: { host: '127.0.0.1', amcpPort: a.mock.amcpPort, oscPort: a.oscPort },
        B: { host: '127.0.0.1', amcpPort: b.mock.amcpPort, oscPort: b.oscPort },
      },
      strategy: 'journal-replay',
      autoFailoverEnabled: false,
    };
    const r = new CasparRuntime(
      config,
      {},
      {
        fixedSlots: validateFixedBank(BANK, { policy: DEFAULT_LAYER_POLICY, reservedLayers: [] }),
        fixedBanks: [BANK],
        layerPolicy: DEFAULT_LAYER_POLICY,
        reservedLayers: [],
        lookMixerHoldMs: 0,
        sourceCatalog: CATALOG,
        sourceAssignments: ASSIGNMENTS,
      },
    );
    runtime = r;
    r.start();
    await r.startServing();
    r.templateImport(twoBox(), '<!doctype html><html><body>two-box</body></html>');
    await r.whenServerHealthy(HEALTH_MS);
    await awaitChannelModeRead(r);
    // The replay goes only to a LIVE session (`B-046`), so the backup must be up before failover.
    expect(
      await settleFor(
        () => ['healthy', 'degraded'].includes(r.health().backup?.state ?? ''),
        10_000,
      ),
      'the backup is live',
    ).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 250));

    refusals = [{ match: /^PLAY 2-\d+ DECKLINK DEVICE 2$/, code: 404 }];
    await takeOnLookOne(r);
    refusals = [];
    expect(await r.setActiveLook('bed-59', 'look-2')).toEqual({ ok: true });

    const onA = (await traceOf(a.mock, a.trace)).filter((e) => e.dir === 'recv').map((e) => e.line);
    const bBefore = (await traceOf(b.mock, b.trace)).length;
    expect((await r.failover()).ok).toBe(true);
    const onB = (await traceOf(b.mock, b.trace))
      .slice(bBefore)
      .filter((e) => e.dir === 'recv')
      .map((e) => e.line);

    // The switch as the PRIMARY received it — the control — from its hide to its last commit.
    const window = (lines: readonly string[]): string[] => {
      const start = lines.lastIndexOf('MIXER 2-61 OPACITY 0 DEFER');
      const end = lines.lastIndexOf('MIXER 2 COMMIT');
      return start < 0 || end < start ? [] : lines.slice(start, end + 1);
    };
    const primary = window(onA);
    expect(primary.slice(0, 6)).toEqual([
      'MIXER 2-61 OPACITY 0 DEFER',
      'MIXER 2-61 VOLUME 0 DEFER',
      'MIXER 2-61 FILL 0.522917 0.261458 0.477083 0.477083 DEFER',
      'MIXER 2-61 CLIP 0.522917 0.261458 0.477083 0.477083 DEFER',
      'MIXER 2 COMMIT',
      'PLAY 2-61 DECKLINK DEVICE 2',
    ]);
    expect(primary.some((l) => l.startsWith('CG 2-59 UPDATE'))).toBe(true);
    expect(primary).toContain('MIXER 2-61 OPACITY 1 DEFER');
    // …and the backup's replay carries exactly the same lines in exactly the same order.
    expect(window(onB)).toEqual(primary);
  }, 30_000);
});

// ─────────────────────────────── MIXER CLEAR ONLY ON AN EMPTY LAYER ───────────────────────────────

describe('a plate layer’s mixer is reset only once its CLEAR landed', () => {
  it('🔴 a CLEAR the server refused is followed by NO MIXER CLEAR — CONTROL: the one that landed is', async () => {
    const { r, mock, mark, sentSince } = await boot();
    expect(await r.loadFixed(BED, 'bed-59', TWO, {})).toEqual({ accepted: true });
    expect(await r.setActiveLook('bed-59', 'look-2')).toEqual({ ok: true });
    expect(await r.take('bed-59')).toEqual({ accepted: true });

    refusals = [{ match: /^CLEAR 2-60$/, code: 404 }];
    const from = await mark();
    await r.out('bed-59');
    const lines = await sentSince(from);

    expect(lines).toContain('CLEAR 2-60');
    expect(lines, 'the refused CLEAR left a plate on 2-60: its mixer is not reset').not.toContain(
      'MIXER 2-60 CLEAR',
    );
    expect(layerOf(mock, 60)?.producer).toBe('decklink');
    // The control on the same wire: 2-61's CLEAR landed, so its mixer IS reset.
    expect(lines).toContain('CLEAR 2-61');
    expect(lines).toContain('MIXER 2-61 CLEAR');
  });
});
