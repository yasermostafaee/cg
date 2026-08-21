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

const layerOf = (r: CasparRuntime, plateId: string, itemId = 'item-1'): number =>
  (r.liveLayers().get(itemId) ?? []).find((rec) => rec.sourceId === plateId)?.slot.layer ?? -1;

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
    🔴 THIS ASSERTION WAS INVERTED TWICE, AND BOTH TIMES FOR A REASON WORTH KEEPING.

    Version one asserted ZERO plays and was wrong about the fixture. Version two — the one
    this replaces — asserted exactly TWO, with the note: _"`left` seated {1,2}; `all` adds
    {3,4}, which have never been seated at all — a plate arriving for the FIRST time needs
    its producer."_ Right about the model as it then was, and it is the very sentence
    session BM's (B′) exists to make false: the seat set is now the union over EVERY look,
    so {3,4} were seated — parked, off screen — at the TAKE.

    So it is back to zero, by a different route, and the rule it pins is stronger than
    either earlier version: **a look switch moves geometry and never a producer.** The
    "never PLAY on a switch" rule that was wrong in version one is right now, because the
    thing that made it wrong (a plate arriving with no seat) can no longer happen.
  */
  expect(
    lines.filter((l) => /^PLAY /.test(l)),
    'a switch moves no producer',
  ).toEqual([]);
  // All four were allocated by the take, and the switch changed none of that.
  expect(seated(r)).toEqual(['live-1', 'live-2', 'live-3', 'live-4']);
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

it('🔴 5.2 — a preset is STAGED ON AIR: the producer is seated, muted and rendering nothing', async () => {
  /*
    🔴 THIS ASSERTION WAS INVERTED BY SESSION BM, AND THE OLD COMMENT SAID WHY IT HAD TO BE.

    It read _"a preset on a source the CURRENT look does not show reaches no wire"_, and
    justified itself with: _"That is what makes 'preset' a real thing rather than a wish —
    the change is staged on air, not merely in a UI."_ The claim was right and the
    implementation did not meet it: nothing was staged on air at all, only an entry in an
    override map, and the producer was created at the moment of the SWITCH — which is
    exactly the visible re-acquire the operator was trying to avoid by presetting.

    Under (B′) the sentence is finally true. The preset seats its producer NOW, off screen,
    where a re-acquire costs nothing, and the switch that shows it moves a `MIXER FILL`.
  */
  const r = await boot();
  await onAir(r);
  const before = (await recvLines()).length;

  expect((await r.swapLiveSource('item-1', 'live-3', 'src-preset')).ok).toBe(true);

  const lines = await since(before);
  // It reaches the wire — and everything it sends is about staying invisible.
  expect(
    lines.filter((l) => /^PLAY /.test(l)),
    'the preset is seated now',
  ).toHaveLength(1);
  expect(producerOf(r, 'live-3')).toContain('9');
  const layer = layerOf(r, 'live-3');
  expect(lines).toContain(`MIXER 1-${String(layer)} VOLUME 0`);
  expect(mock?.layerRenderedRect({ channel: 1, layer }), 'and it renders nothing').toBeNull();
});

it('🔴 5.2 — …and the SWITCH that shows it is a cut: no producer moves', async () => {
  const r = await boot();
  await onAir(r);
  await r.swapLiveSource('item-1', 'live-3', 'src-preset');
  const before = (await recvLines()).length;

  expect((await r.setActiveLook('item-1', 'right')).ok).toBe(true);

  // 🔴 THE PAYOFF — the owner's walk step 3. The preset feed appears with no `PLAY` at all.
  expect(
    (await since(before)).filter((l) => /^PLAY /.test(l)),
    'the preset already had its producer',
  ).toEqual([]);
  expect(producerOf(r, 'live-3')).toContain('9');
  expect(mock?.layerRenderedRect({ channel: 1, layer: layerOf(r, 'live-3') })).not.toBeNull();
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

it('🔴 5.4 — the RESTORE door refuses it too: a template can change under a retained row', async () => {
  /*
    The take refuses a zero-look template, so it LOOKS impossible for one to be retained on
    air — and that reading is what would leave this door uncovered. It is not impossible: the
    TEMPLATE changes under the row. The operator takes a template that has looks, re-imports
    it with the group emptied, and a reconnect restores the on-air row against the NEW
    definition — seating nothing and putting a designed layout of empty holes on air,
    silently, on a link that just came back.

    Restore never passes through `take()`, which is exactly why §12.6's exclusivity refusal
    is at both doors. One predicate, two sites.
  */
  const r = await boot();
  /*
    The row became retained-on-air in a PREVIOUS process, back when the template still had
    looks; what this process boots into is the re-imported, emptied definition. No incumbent
    is taken here on purpose — §12.6’s exclusivity refusal is checked FIRST (it is about the
    on-air SET, and the narrower answer must not mask the broader one), so a row already on
    air would win the race and this door would go untested.
  */
  r.templateImport(template({ looks: [] }), '<!doctype html><html></html>');

  const res = await r.restore([
    { itemId: 'item-1', templateId: 'debate', fields: {}, state: 'on-air' },
  ]);

  expect(res.skipped.map((s2) => s2.reason)).toContain('looks-none-authored');
  expect(res.skipped[0]?.detail, 'and it says WHICH template and what to do').toMatch(/Designer/);
});

it('🔴 a RESTORE re-applies the operator’s look, so the picker does not lie after a blip', async () => {
  /*
    THE DIVERGENCE STAGE E CREATED, AND THEREFORE OWES A FIX.

    The bridge’s `#activeLooks` is process memory. Before this session nothing DISPLAYED the
    look, so losing it across a bridge blip was invisible; the picker turns it into a false
    readout — an adopted row would publish the AUTHORED DEFAULT while the page is still
    showing the look the operator chose.

    Retention already carries `sourceOverride` and `plateVolumes` for exactly this reason
    (B-107 / B-109: retention dropping state it did not model), and the look now travels the
    same way. ⚠ This does NOT persist `#activeLooks` on the BRIDGE — that is still BC’s
    deferred finding — it closes the gap from the side that already has a durable store.
  */
  const r = await boot();

  await r.restore([
    {
      itemId: 'item-1',
      templateId: 'debate',
      fields: {},
      state: 'on-air',
      activeLookId: 'right',
    },
  ]);

  expect(publishedLook(r), 'the row comes back on the look it was on').toBe('right');
});

it('a restore with NO look recorded still resolves to the authored default', async () => {
  // The pre-Stage-E retained shape, and every row nobody ever switched. Absent must mean
  // “nothing was chosen”, not “no look” — or the picker would have nothing marked.
  const r = await boot();

  await r.restore([{ itemId: 'item-1', templateId: 'debate', fields: {}, state: 'on-air' }]);

  expect(publishedLook(r)).toBe('left');
});

it('🔴 5.1 — the switch PUBLISHES the stack, so a live console actually learns the new look', async () => {
  /*
    THE DEFECT THIS PINS, AND WHY THE FIRST VERSION OF THIS FILE MISSED IT.

    `#published()` recomputes the look on every read, so `stackSnapshot()` was ALWAYS right —
    and the test above that reads it passed while a real console would have been stuck. A
    browser learns item state only from the `stackChanged` push, and `#markDirty` is the one
    thing that emits it. Without it the operator presses a look, the fills move on air, and
    the picker goes on marking the OLD one until something unrelated publishes.

    ⚠ The offline mock had it right from the start, which inverted the usual risk: the mock
    was MORE correct than the bridge, so the E2E passed too. Asserting the PUSH — not the
    snapshot — is the only thing that separates them.
  */
  const r = await boot();
  /*
    🔴 OFF AIR, and that is the whole sharpness of this test.

    On an ON-AIR row the reconcile’s own AMCP produces acks that move the reconciler, which
    marks the item dirty and publishes ANYWAY — so the push happens by a neighbouring
    mechanism rather than because this code says so, and removing the publish still passes.
    That is accidental correctness, and it evaporates in the one case the picker explicitly
    supports: an OFF-AIR row, where `setActiveLook` records the look and sends NOTHING (there
    is nothing seated to reconcile). No send, no ack, no incidental publish — so if the switch
    does not publish for itself, the picker never moves.
  */
  await r.load('item-1', 'debate', {});
  // …and let the LOAD’s own coalesced flush drain before subscribing. Without this the
  // switch rides a publish somebody else scheduled, which is the same accidental
  // correctness one level down.
  await new Promise((resolve) => setTimeout(resolve, 150));

  const pushed: (string | undefined)[] = [];
  r.stackChanged.subscribe((items) => {
    pushed.push(items.find((i) => i.itemId === 'item-1')?.activeLookId);
  });

  expect((await r.setActiveLook('item-1', 'right')).ok).toBe(true);
  // `#markDirty` coalesces, so give the flush its beat.
  await new Promise((resolve) => setTimeout(resolve, 120));

  expect(pushed, 'a push carrying the new look reached the console').toContain('right');
});

it('🔴 5.4 — a re-issue of the CURRENT look is accepted, because that is the documented remedy', async () => {
  /*
    The look is recorded BEFORE the reconcile and stays recorded when the reconcile or the
    CG UPDATE is refused — so after a half-failed switch the row already reads as the new
    look while the fills or the holes did not move. The bridge’s own refusals then say
    “Re-issue it once the server is back” and “Re-issue the switch”, so re-sending the
    CURRENT look has to work. A UI that dropped it as a no-op would make the one remedy the
    bridge names unreachable.
  */
  const r = await boot();
  await onAir(r);
  await r.setActiveLook('item-1', 'right');
  const before = (await recvLines()).length;

  expect((await r.setActiveLook('item-1', 'right')).ok, 'accepted, not refused as a no-op').toBe(
    true,
  );

  // …and it really re-asserted: the page is told again, which is the half a lost CG UPDATE
  // would have dropped.
  expect((await since(before)).some((l) => l.startsWith('CG '))).toBe(true);
});
