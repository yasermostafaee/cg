import * as dgram from 'node:dgram';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { createMock, type MockHandle } from '@cg/amcp-mock';
import type {
  ConnectionConfig,
  SourceAssignments,
  SourceCatalog,
  TemplateInfo,
  TemplateLook,
} from '@cg/shared-ipc';
import { readCgControl, type LiveSourceRect } from '@cg/shared-schema';
import { CasparRuntime } from '../src/caspar-runtime.js';
import { awaitChannelModeRead, HEALTH_MS } from './support/harness.js';

/**
 * 🔴 **§14.5 / `tasks.md` 7.1–7.5 (LOOKS Stage E) — THE OPERATOR'S SWITCH, on the wire.**
 *
 * `live-look-reconcile` proves the RECONCILE. This file proves the thing the operator
 * actually does: pick a look, and preset a source before switching to it. Every assertion
 * is on the AMCP trace, for that file's reason — every internal structure can be correct
 * while nothing reaches CasparCG.
 *
 * ── 🔴 WHAT THESE CANNOT PROVE, SAID UP FRONT ────────────────────────────────
 *
 * **What it looks like on air.** No unit test can photograph a cut. What is proven is the
 * COMMAND SEQUENCE — that a switch moves the fills and then tells the page, in that order,
 * and that a preset lands only on the switch. Whether that reads as a clean cut on a 2.3.2
 * server is a plant measurement.
 *
 * **The picker itself.** The control is a renderer concern and is tested in
 * `apps/runtime/tests/lookPicker.dom.test.ts`. What crosses between them is
 * `StackItemState.activeLookId`, which is asserted here as the bridge publishes it.
 *
 * ── 5.6 — `awaitChannelModeRead` IS called, and here is why it has to be ─────
 *
 * Several tests below baseline the trace and assert the slice is EMPTY ("the preset did
 * NOT reach the wire"). A negative observation is only valid from a proven-quiescent wire,
 * and R-030's one-shot channel-mode `INFO` rides the first sweep tick on a TIMER — so on a
 * loaded box it can land inside an assertion window and read as take traffic. `boot()`
 * waits for it rather than filtering it out: filtering would make the baseline pass
 * vacuously if the read ever stopped happening (flake family 3, `support/harness.ts`).
 */

let mock: MockHandle | null = null;
let runtime: CasparRuntime | null = null;
let tracePath: string | null = null;

const BAND = { start: 30, end: 35 };
const SCENE = { width: 1920, height: 1080 };
const CENTRED = { anchor: 'center' as const, offset: { x: 0, y: 0 } };

/** Four declared sources, so a look can hold two and its sibling the OTHER two. */
const KEYS = ['live-1', 'live-2', 'live-3', 'live-4'] as const;

const box = (x: number, y: number): LiveSourceRect => ({ x, y, width: 480, height: 270 });

/**
 * 🔴 **THE DISJOINT PAIR — `tasks.md` 5.3, and the whole reason this fixture is not the
 * six-box one.**
 *
 * `LEFT` holds {1,2}; `RIGHT` holds {3,4}. **No source is in both.** A switch between them
 * therefore has to release two AND seat two in the same reconcile, which is a strictly
 * harder shape than the add/drop cases (`six` → `solo` only ever drops). That shape is
 * what hid the held-layer bug: a reconcile that offered a held plate's layer as free was
 * invisible while every switch was a subset of the one before it, because the plate that
 * would have collided was never the plate that moved.
 */
const LEFT: Record<string, LiveSourceRect> = { 'live-1': box(0, 0), 'live-2': box(480, 0) };
const RIGHT: Record<string, LiveSourceRect> = { 'live-3': box(960, 0), 'live-4': box(0, 270) };
/** Everything, so a test can come back to a look that shows all four. */
const ALL: Record<string, LiveSourceRect> = { ...LEFT, ...RIGHT };

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

const look = (id: string, rects: Record<string, LiveSourceRect>): TemplateLook => ({
  id,
  name: id,
  entered: { mode: 'cut' },
  rects,
});

function template(over: { looks?: TemplateLook[] | undefined; defaultLookId?: string } = {}) {
  const looks = over.looks ?? [look('left', LEFT), look('right', RIGHT), look('all', ALL)];
  return {
    templateId: 'debate',
    templateType: 'debate',
    fields: [],
    liveSources: {
      resolution: SCENE,
      defaultPosition: CENTRED,
      sources: KEYS.map((k) => ({
        elementId: `el-${k}`,
        sourceId: k,
        rect: (ALL[k] ?? box(0, 0)) as LiveSourceRect,
        dynamic: false,
      })),
      looks,
      ...(looks.length > 0 ? { defaultLookId: over.defaultLookId ?? looks[0]?.id } : {}),
    },
  } satisfies TemplateInfo;
}

function catalog(): SourceCatalog {
  return {
    sources: [
      ...KEYS.map((k, i) => ({
        id: `src-${String(i + 1)}`,
        name: `Feed ${String(i + 1)}`,
        format: '1080i5000',
        producer: { kind: 'route' as const, channel: i + 2 },
      })),
      // The PRESET target — a second feed to point a plate at before switching to it.
      {
        id: 'src-preset',
        name: 'Preset Feed',
        format: '1080i5000',
        producer: { kind: 'route' as const, channel: 9 },
      },
    ],
    layerRange: BAND,
  };
}

const ASSIGNMENTS: SourceAssignments = {
  assignments: KEYS.map((k, i) => ({
    templateId: 'debate',
    plateId: k,
    sourceId: `src-${String(i + 1)}`,
  })),
};

async function boot(options: { template?: TemplateInfo } = {}): Promise<CasparRuntime> {
  const oscPort = await freeUdpPort();
  tracePath = path.join(
    os.tmpdir(),
    `cg-stagee-${String(process.pid)}-${String(Date.now())}-${String(Math.round(performance.now() * 1000))}.ndjson`,
  );
  mock = await createMock({ amcpPort: 0, oscPort, oscHost: '127.0.0.1', oscHz: 30, tracePath });
  const r = new CasparRuntime(
    singleServer(mock.amcpPort, oscPort),
    {},
    { sweepMs: 150, sourceCatalog: catalog(), sourceAssignments: ASSIGNMENTS },
  );
  runtime = r;
  r.start();
  await r.startServing();
  r.templateImport(options.template ?? template(), '<!doctype html><html></html>');
  await r.whenServerHealthy(HEALTH_MS);
  // 5.6 / flake family 3 — see the header. Several tests below assert an EMPTY trace slice,
  // which is valid only from a proven-quiescent wire.
  await awaitChannelModeRead(r);
  return r;
}

async function onAir(r: CasparRuntime, itemId = 'item-1'): Promise<void> {
  await r.load(itemId, 'debate', {});
  expect((await r.take(itemId)).accepted).toBe(true);
}

const since = async (before: number): Promise<string[]> => (await recvLines()).slice(before);

const seated = (r: CasparRuntime, itemId = 'item-1'): string[] =>
  (r.liveLayers().get(itemId) ?? [])
    .filter((rec) => rec.held !== true)
    .map((rec) => rec.sourceId)
    .sort();

const producerOf = (r: CasparRuntime, plateId: string, itemId = 'item-1'): string | undefined =>
  (r.liveLayers().get(itemId) ?? []).find((rec) => rec.sourceId === plateId)?.producer;

/** The look this row publishes on its `StackItemState` — what the picker will render. */
const publishedLook = (r: CasparRuntime, itemId = 'item-1'): string | undefined =>
  r.stackSnapshot().find((i) => i.itemId === itemId)?.activeLookId;

// ─────────────────────── 5.1 — the picker's readout and its one path ───────────────────

it('5.1 — a fresh take publishes the AUTHORED DEFAULT look, so the picker is right untouched', async () => {
  const r = await boot();
  await onAir(r);

  // `tasks.md` 7.4. The operator has picked nothing, and the row is plainly showing
  // something — publishing nothing here would leave the picker with no segment marked on
  // every row nobody has switched, which is most of them.
  expect(publishedLook(r)).toBe('left');
  expect(seated(r)).toEqual(['live-1', 'live-2']);
});

it('5.1 — the switch drives ONE path: fills move, THEN the page is told, and no PLAY', async () => {
  const r = await boot();
  await onAir(r);
  const before = (await recvLines()).length;

  expect((await r.setActiveLook('item-1', 'all')).ok).toBe(true);

  const lines = await since(before);
  const fills = lines.filter((l) => /MIXER .* FILL/.test(l));
  const update = lines.findIndex((l) => l.startsWith('CG '));
  expect(fills.length, 'the two arriving plates get their geometry').toBeGreaterThan(0);
  // ORDER, not merely presence: a refused reconcile must leave the page on the old look, so
  // the page is told LAST and only on success. Fills-first also means a lost CG UPDATE
  // leaves a coherent previous look rather than a new look whose boxes never fill.
  expect(update, 'the page is told').toBeGreaterThanOrEqual(0);
  expect(
    lines.findIndex((l) => /MIXER .* FILL/.test(l)),
    'and it is told AFTER the fills moved',
  ).toBeLessThan(update);
  /*
    🔴 THE PLAYs HERE ARE CORRECT, AND SAYING SO IS THE POINT.

    `left` seated {1,2}; `all` adds {3,4}, which have never been seated at all — a plate
    arriving for the FIRST time needs its producer. What must never re-PLAY is a plate that
    was merely HELD, because that is a visible re-acquire of a producer that never left
    (§12.4’s whole reason for holding a seat) — asserted on the round trip in 5.3.

    An earlier version of this test asserted zero PLAYs here and was simply wrong about the
    fixture. The distinction is worth pinning rather than smoothing over: “never PLAY on a
    switch” would be the wrong rule, and a test that enforced it would have blocked the
    right behaviour.
  */
  const plays = lines.filter((l) => /^PLAY /.test(l));
  expect(plays, 'exactly the two arriving plates').toHaveLength(2);
  expect(
    lines.filter((l) => /^PLAY 1-30 |^PLAY 1-31 /.test(l)),
    'and NOT the two already seated',
  ).toHaveLength(0);
});

it('5.1 — the page is told WHICH look, on the CG UPDATE payload', async () => {
  const r = await boot();
  await onAir(r);
  const before = (await recvLines()).length;

  await r.setActiveLook('item-1', 'right');

  const cg = (await since(before)).find((l) => l.startsWith('CG '));
  expect(cg).toBeDefined();
  // Undo BOTH AMCP escape layers, then read the reserved control key: the holes the page
  // punches and the fills the bridge moved are driven off this one id.
  const raw = /CG [^ ]+ UPDATE \d+ "(.*)"$/s.exec(cg ?? '')?.[1] ?? '';
  const json = raw.replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  expect(readCgControl(JSON.parse(json))?.look).toBe('right');
});

it('5.1 — and the published look follows, so the picker shows what the bridge did', async () => {
  const r = await boot();
  await onAir(r);

  await r.setActiveLook('item-1', 'right');

  expect(publishedLook(r)).toBe('right');
});

// ─────────────────── 5.3 — THE DISJOINT-MEMBERSHIP SWITCH ──────────────────────────────

it('🔴 5.3 — a DISJOINT switch releases two and seats two, with no layer collision', async () => {
  /*
    LEFT {1,2} → RIGHT {3,4}. Not a subset either way, which is the shape add/drop cases
    cannot reach: two plates leave and two arrive in ONE reconcile, so a planner that
    offered a departing plate's layer to an arriving one would double-book it here and
    nowhere else.
  */
  const r = await boot();
  await onAir(r);
  expect(seated(r)).toEqual(['live-1', 'live-2']);

  expect((await r.setActiveLook('item-1', 'right')).ok).toBe(true);

  expect(seated(r), 'the other two are now the ones on screen').toEqual(['live-3', 'live-4']);
  // 🔴 EVERY ledger record still has its OWN layer. A collision would show up as two
  // records naming one coordinate, which is exactly what the held-layer bug produced.
  const layers = (r.liveLayers().get('item-1') ?? []).map((rec) => rec.slot.layer);
  expect(new Set(layers).size, 'no two records share a layer').toBe(layers.length);
});

it('🔴 5.3 — the departed pair is HELD, not torn down, so coming back needs no re-seat', async () => {
  const r = await boot();
  await onAir(r);
  await r.setActiveLook('item-1', 'right');

  const held = (r.liveLayers().get('item-1') ?? []).filter((rec) => rec.held === true);
  expect(held.map((rec) => rec.sourceId).sort(), '§12.4 — held, muted, idle').toEqual([
    'live-1',
    'live-2',
  ]);
});

it('🔴 5.3 — switching BACK re-shows the original pair with no PLAY at all', async () => {
  /*
    The point of holding a seat: the way back is geometry, not re-acquisition. If anything
    re-PLAYed here, the operator would see a visible re-acquire on every switch back — the
    cut §12.4 chose B to avoid.
  */
  const r = await boot();
  await onAir(r);
  await r.setActiveLook('item-1', 'right');
  const before = (await recvLines()).length;

  expect((await r.setActiveLook('item-1', 'left')).ok).toBe(true);

  expect(seated(r)).toEqual(['live-1', 'live-2']);
  expect((await since(before)).filter((l) => /^PLAY /.test(l))).toHaveLength(0);
});

// ─────────────────── 5.2 — PRESET-THEN-TAKE ────────────────────────────────────────────

it('🔴 5.2 — a preset on a source the CURRENT look does not show reaches no wire', async () => {
  /*
    THE OPERATOR MODEL, in one assertion. `live-3` is not in LEFT, so it is held: pointing
    it at a different feed records the intent and sends NOTHING, because there is no
    visible plate to move. That is what makes "preset" a real thing rather than a wish —
    the change is staged on air, not merely in a UI.
  */
  const r = await boot();
  await onAir(r);
  const before = (await recvLines()).length;

  expect((await r.swapLiveSource('item-1', 'live-3', 'src-preset')).ok).toBe(true);

  expect(await since(before), 'nothing moved — the plate is not on screen').toEqual([]);
});

it('🔴 5.2 — …and it goes live on the SWITCH, carrying the preset source', async () => {
  const r = await boot();
  await onAir(r);
  await r.swapLiveSource('item-1', 'live-3', 'src-preset');

  expect((await r.setActiveLook('item-1', 'right')).ok).toBe(true);

  // `src-preset` is route channel 9 — the plate came up on the PRESET feed, not on its
  // template assignment, and it did so at the moment of the switch.
  expect(producerOf(r, 'live-3')).toContain('9');
  expect(seated(r)).toEqual(['live-3', 'live-4']);
});

it('5.2 — a preset on a VISIBLE plate is not deferred: that one is the live path', async () => {
  // The mirror case, so "applies on the switch" is not mistaken for "always deferred".
  // `live-1` IS in LEFT, so the swap is R-048's on-air repoint and moves immediately.
  const r = await boot();
  await onAir(r);
  const before = (await recvLines()).length;

  expect((await r.swapLiveSource('item-1', 'live-1', 'src-preset')).ok).toBe(true);

  expect((await since(before)).length, 'this one DID reach the wire').toBeGreaterThan(0);
  expect(producerOf(r, 'live-1')).toContain('9');
});

// ─────────────────── 5.4 — the refusals ────────────────────────────────────────────────

it('5.4 — a look the template does not author is refused, and nothing moves', async () => {
  const r = await boot();
  await onAir(r);
  const before = (await recvLines()).length;

  const res = await r.setActiveLook('item-1', 'not-a-look');

  expect(res.ok).toBe(false);
  expect(res.reason).toBe('unknown-look');
  expect(await since(before), 'a refusal mutates nothing').toEqual([]);
  expect(publishedLook(r), 'and the row is still showing what it was').toBe('left');
});

it('5.4 — an item the stack does not carry is refused', async () => {
  const r = await boot();
  const res = await r.setActiveLook('ghost', 'right');
  expect(res.ok).toBe(false);
  expect(res.reason).toBe('unknown-item');
});

it('🔴 5.4 — a group that authors ZERO looks refuses the TAKE, naming what is missing', async () => {
  /*
    `tasks.md` 7.5's single trigger. A group with no looks resolves no rects, so nothing
    seats and the row would go to air as the background alone behind a designed layout of
    holes that never fill — a state the operator cannot fix from the console.
  */
  const r = await boot({ template: template({ looks: [] }) });
  await r.load('item-1', 'debate', {});

  const res = await r.take('item-1');

  expect(res.accepted).toBe(false);
  expect(res.errorCode).toBe('looks-none-authored');
  expect(res.message, 'and it names the remedy, not the rule').toMatch(/Designer/);
});

it('🔴 5.4 — a PRE-LOOKS template is NOT refused: absent is not empty', async () => {
  /*
    The upgrade guard, and the reason the refusal keys on `undefined` vs `[]` rather than
    on length alone. `buildTemplateLiveSources` omits `looks` entirely when the scene has
    no look group, so every multi-box template authored against the arrangement carrier
    arrives here with `undefined` — and refusing those would take a station's whole
    pre-carrier rundown off air on upgrade.
  */
  const pre = {
    ...template(),
    liveSources: { ...template().liveSources, looks: undefined, defaultLookId: undefined },
  } as unknown as TemplateInfo;
  const r = await boot({ template: pre });
  await r.load('item-1', 'debate', {});

  expect((await r.take('item-1')).accepted).toBe(true);
  expect(publishedLook(r), 'and it publishes no look, so no picker is offered').toBeUndefined();
});

it('5.4 — THE CUT IS THE ONLY MODE, so the switch itself is the immediate action', async () => {
  /*
    `tasks.md` 7.6 RETIRED D3's escape: v1 is cut-only, so there is no slower mode to
    escape FROM. Asserted rather than assumed, because "there is nothing to build" is a
    claim that should be checkable: every authored look enters by `cut`, and a switch
    emits no duration/tween on its fills.
  */
  const r = await boot();
  await onAir(r);
  const before = (await recvLines()).length;

  await r.setActiveLook('item-1', 'all');

  const fills = (await since(before)).filter((l) => /MIXER .* FILL/.test(l));
  expect(fills.length).toBeGreaterThan(0);
  for (const f of fills) {
    // `MIXER … FILL x y sx sy` and nothing after: a duration or a tween name would be an
    // animated move, which v1 does not ship.
    expect(f, 'no duration, no tween — the move is a cut').toMatch(
      /FILL\s+-?[\d.]+\s+-?[\d.]+\s+-?[\d.]+\s+-?[\d.]+\s*$/,
    );
  }
});
