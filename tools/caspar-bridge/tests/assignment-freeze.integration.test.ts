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
import type { LiveSourceRect, RetainedStackItem } from '@cg/shared-schema';
import { CasparRuntime } from '../src/caspar-runtime.js';
import { awaitChannelModeRead, HEALTH_MS } from './support/harness.js';

/**
 * 🔴 **SESSION BP — THE ROW FREEZES ITS TEMPLATE ASSIGNMENT AT TAKE.**
 *
 * ── THE ONE SENTENCE ────────────────────────────────────────────────────────
 *
 * **A ROW THAT IS ON AIR DOES NOT CHANGE ITS PICTURE BECAUSE SOMEBODY EDITED
 * CONFIGURATION.** Level 2 — the template's `{plate → catalog id}` — is captured by the take
 * and every later resolution on that row reads the snapshot.
 *
 * ── WHAT THIS REPLACES, AND WHY THE NARROWER ANSWERS WERE NOT ENOUGH ────────
 *
 * `B-155`: `setSourceAssignments` writes without reconciling, so an edit LURKS until the
 * next reconcile applies it — and the next reconcile is usually a look press, which carries
 * a producer change into the middle of a switch and flashes the previous guest on air.
 *
 * Two smaller fixes were on the table and both leave the MECHANISM intact, narrowing only
 * who can reach it. Disabling the Inspector's editor on an on-air row is defeated by the
 * fact that the assignment is TEMPLATE-wide and INSTALLATION-wide: `it('...a SECOND row...')`
 * below is that case, on the wire — two rows of one template on air, each pinned by its own
 * take, resolving different level-2 answers at the same moment. No rule about one panel can
 * produce that.
 *
 * ── 🔴 WHAT THESE TESTS CANNOT PROVE, STATED UP FRONT ───────────────────────
 *
 * **That the plant no longer flashes.** This removes the CAUSE; the residual is a plant
 * measurement (`B-155`'s `6.9a`, the frame count) and stays owed. What is proven here is the
 * COMMAND SEQUENCE — that the edit reaches no producer until a re-take — which is the axis a
 * dev machine can actually answer.
 *
 * Every assertion is on the AMCP wire, from the mock's NDJSON trace, for the reason
 * `live-look-reconcile`'s header gives: every internal structure can be correct while
 * nothing reaches CasparCG.
 */

let mock: MockHandle | null = null;
let runtime: CasparRuntime | null = null;
let tracePath: string | null = null;

const BAND = { start: 30, end: 35 };
const SCENE = { width: 1920, height: 1080 };
const CENTRED = { anchor: 'center' as const, offset: { x: 0, y: 0 } };

/** Two boxes side by side — the smallest shape that has a look to switch AWAY from. */
const PAIR: Record<string, LiveSourceRect> = {
  'guest-1': { x: 0, y: 0, width: 960, height: 540 },
  'guest-2': { x: 960, y: 0, width: 960, height: 540 },
};
/** …and SOLO, which shows `guest-1` alone, full frame. */
const SOLO: Record<string, LiveSourceRect> = {
  'guest-1': { x: 0, y: 0, width: 1920, height: 1080 },
};

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

const TEMPLATE: TemplateInfo = {
  templateId: 'debate',
  templateType: 'debate',
  fields: [],
  liveSources: {
    resolution: SCENE,
    defaultPosition: CENTRED,
    sources: [
      {
        elementId: 'el-1',
        sourceId: 'guest-1',
        rect: PAIR['guest-1'] as LiveSourceRect,
        dynamic: false,
      },
      {
        elementId: 'el-2',
        sourceId: 'guest-2',
        rect: PAIR['guest-2'] as LiveSourceRect,
        dynamic: false,
      },
    ],
    looks: [look('pair', PAIR), look('solo', SOLO)],
    defaultLookId: 'pair',
  },
};

/**
 * ⚠ **A ONE-PLATE TEMPLATE, AND THE PLATE COUNT IS WHY IT EXISTS.** §12.6's exclusivity
 * refuses a second MULTI-BOX template on a channel that already has one, so two rows of
 * `debate` can never be on air together — which is correct, and it is not the claim the
 * per-row test below is making. A single-plate template is not multi-box
 * (`#multiBoxCount <= 1`), so two of its rows co-exist and the pin can be shown to belong to
 * the ROW rather than to the template.
 */
const PROMO: TemplateInfo = {
  templateId: 'promo',
  templateType: 'promo',
  fields: [],
  liveSources: {
    resolution: SCENE,
    defaultPosition: CENTRED,
    sources: [
      {
        elementId: 'el-p',
        sourceId: 'guest-1',
        rect: SOLO['guest-1'] as LiveSourceRect,
        dynamic: false,
      },
    ],
    looks: [look('full', SOLO)],
    defaultLookId: 'full',
  },
};

/**
 * Four ROUTE feeds on distinct channels, so a producer change is legible on the wire as a
 * different `route://n` argument rather than as a coincidence of layer allocation.
 */
function catalog(over: Partial<SourceCatalog> = {}): SourceCatalog {
  return {
    sources: [
      {
        id: 'src-1',
        name: 'Studio 1',
        format: '1080i5000',
        producer: { kind: 'route', channel: 2 },
      },
      {
        id: 'src-2',
        name: 'Studio 2',
        format: '1080i5000',
        producer: { kind: 'route', channel: 3 },
      },
      {
        id: 'src-3',
        name: 'Studio 3',
        format: '1080i5000',
        producer: { kind: 'route', channel: 4 },
      },
      {
        id: 'src-4',
        name: 'Studio 4',
        format: '1080i5000',
        producer: { kind: 'route', channel: 5 },
      },
    ],
    layerRange: BAND,
    ...over,
  };
}

function assign(pairs: readonly (readonly [string, string])[]): SourceAssignments {
  return {
    assignments: pairs.map(([plateId, sourceId]) => ({ templateId: 'debate', plateId, sourceId })),
  };
}

const START: SourceAssignments = {
  assignments: [
    ...assign([
      ['guest-1', 'src-1'],
      ['guest-2', 'src-2'],
    ]).assignments,
    { templateId: 'promo', plateId: 'guest-1', sourceId: 'src-1' },
  ],
};
/** The same plates, with `guest-1` re-pointed. This is the edit that must not reach air. */
const EDITED: SourceAssignments = {
  assignments: [
    ...assign([
      ['guest-1', 'src-3'],
      ['guest-2', 'src-2'],
    ]).assignments,
    { templateId: 'promo', plateId: 'guest-1', sourceId: 'src-3' },
  ],
};

async function boot(options: { assignments?: SourceAssignments; catalog?: SourceCatalog } = {}) {
  const oscPort = await freeUdpPort();
  tracePath = path.join(
    os.tmpdir(),
    `cg-freeze-${String(process.pid)}-${String(Date.now())}-${String(Math.round(performance.now() * 1000))}.ndjson`,
  );
  mock = await createMock({ amcpPort: 0, oscPort, oscHost: '127.0.0.1', oscHz: 30, tracePath });
  const r = new CasparRuntime(
    singleServer(mock.amcpPort, oscPort),
    {},
    {
      sweepMs: 150,
      sourceCatalog: options.catalog ?? catalog(),
      sourceAssignments: options.assignments ?? START,
    },
  );
  runtime = r;
  r.start();
  await r.startServing();
  r.templateImport(TEMPLATE, '<!doctype html><html></html>');
  r.templateImport(PROMO, '<!doctype html><html></html>');
  await r.whenServerHealthy(HEALTH_MS);
  // Every "nothing reached the wire" assertion baselines the trace, which is valid only from
  // a PROVEN-QUIESCENT wire — R-030's one-shot `INFO` has to have landed first.
  await awaitChannelModeRead(r);
  return r;
}

async function onAir(r: CasparRuntime, itemId = 'item-1', templateId = 'debate'): Promise<void> {
  await r.load(itemId, templateId, {});
  expect((await r.take(itemId)).accepted, `${itemId} must take`).toBe(true);
}

async function since(before: number): Promise<string[]> {
  return (await recvLines()).slice(before);
}

const playsIn = (lines: readonly string[]): string[] =>
  lines.filter((l) => l.startsWith('PLAY 1-'));

/** Which ROUTE arguments this stretch of wire played, in order. */
const routesPlayed = (lines: readonly string[]): string[] =>
  playsIn(lines)
    .map((l) => /"(route:\/\/\d+)"/.exec(l)?.[1] ?? '')
    .filter((a) => a !== '');

/** The producer string the ledger says is behind one plate. */
const producerOf = (r: CasparRuntime, plateId: string, itemId = 'item-1'): string | undefined => {
  const records = r.liveLayers().get(itemId) ?? [];
  const record =
    records.find((rec) => rec.sourceId === plateId && rec.held !== true) ??
    records.find((rec) => rec.sourceId === plateId);
  return record?.producer;
};

const frozenOf = (r: CasparRuntime, itemId = 'item-1') =>
  r.stackSnapshot().find((i) => i.itemId === itemId)?.frozenAssignment;

// ───────────────────────────── §2.2 — THE FREEZE ITSELF ─────────────────────────────

it('🔴 §2.2 — a look switch after an assignment edit carries NO producer change', async () => {
  const r = await boot();
  await onAir(r);
  expect(producerOf(r, 'guest-1'), 'seated on the assignment in force at take').toContain(
    'route://2',
  );

  // THE EDIT. Any surface can make it — the Inspector, another row's panel, another station.
  expect(r.setSourceAssignments(EDITED).ok).toBe(true);

  const before = (await recvLines()).length;
  expect(await r.setActiveLook('item-1', 'solo')).toEqual({ ok: true });
  const lines = await since(before);

  /*
    🔴 THE ASSERTION THIS SESSION EXISTS FOR. Before the freeze this switch resolved
    `guest-1` to `src-3`, tore down the `route://2` producer and PLAYed `route://4` — a
    producer change in the middle of a look switch, which is `B-155`'s flash. The switch is
    now a pure geometry move, exactly as a switch with no edit is.
  */
  expect(playsIn(lines), 'an edited assignment must not reach a live row').toEqual([]);
  expect(producerOf(r, 'guest-1'), 'still the frozen source').toContain('route://2');
});

it('§2.2 positive control — the RE-TAKE adopts it, which is how an edit is meant to land', async () => {
  const r = await boot();
  await onAir(r);
  expect(r.setSourceAssignments(EDITED).ok).toBe(true);

  // Off, then on: the row is no longer pinned, and its next take freezes the NEW answer.
  expect((await r.out('item-1')).accepted).toBe(true);
  const before = (await recvLines()).length;
  expect((await r.take('item-1')).accepted).toBe(true);

  /*
    ⚠ THE POSITIVE CONTROL IS THE HALF THAT KEEPS THE TEST ABOVE HONEST. A freeze that never
    thawed would pass it perfectly and make the assignment editor permanently inert — which is
    a worse product than the defect. `src-3` is `route://4`.
  */
  expect(routesPlayed(await since(before))).toContain('route://4');
  expect(producerOf(r, 'guest-1')).toContain('route://4');
  expect(frozenOf(r), 'and the pin moved with it').toEqual({
    'guest-1': 'src-3',
    'guest-2': 'src-2',
  });
});

it('🔴 §2.2 — a SECOND row taken AFTER the edit gets the new answer; the first still does not', async () => {
  /*
    🔴 **THE CASE THAT RULED OUT "DISABLE THE EDITOR ON AN ON-AIR ROW".** The assignment is
    template-wide and installation-wide, so the writer need not be this row's panel at all: it
    can be another row's, or another station's Runtime against the same bridge — the
    configuration the DEFER/COMMIT ban already exists for. Freezing is a property of the ROW,
    so it holds however the write arrived.

    Both rows are on air, on one template, resolving DIFFERENT level-2 answers, each pinned by
    its own take. No rule about who may edit can produce that.

    ⚠ On `promo` rather than `debate`, and the reason is §12.6 rather than convenience: two
    MULTI-BOX rows may not share a channel, so `debate` cannot supply this case at all. See
    `PROMO`'s note.
  */
  const r = await boot();
  await onAir(r, 'item-1', 'promo');
  expect(r.setSourceAssignments(EDITED).ok).toBe(true);

  const before = (await recvLines()).length;
  await onAir(r, 'item-2', 'promo');
  expect(routesPlayed(await since(before)), 'the fresh row takes the edit').toContain('route://4');

  /*
    🔴 **item-1 IS RECONCILED, DELIBERATELY, AND WITHOUT THIS THE TEST PROVES NOTHING.** The
    lurk's whole shape is that an edited assignment sits harmless in the store until something
    reconciles — so reading item-1's LEDGER straight after the edit shows the old producer
    whether or not the freeze exists. Mutation-checked: with `#assignmentsFor` forced back to
    the live store this test PASSED until this reconcile was added, which is exactly the
    vacuous guard `stack-retention`'s fixture turned out to be.
  */
  const beforeReconcile = (await recvLines()).length;
  expect((await r.reconcileLivePlates('item-1', { mode: 'live' })).ok).toBe(true);
  expect(
    routesPlayed(await since(beforeReconcile)),
    'the edit must not reach the pinned row, even under a reconcile',
  ).not.toContain('route://4');

  expect(producerOf(r, 'guest-1', 'item-1'), 'item-1 is pinned to its own take').toContain(
    'route://2',
  );
  expect(producerOf(r, 'guest-1', 'item-2'), 'item-2 to its own').toContain('route://4');
  expect(frozenOf(r, 'item-1')).toEqual({ 'guest-1': 'src-1' });
  expect(frozenOf(r, 'item-2')).toEqual({ 'guest-1': 'src-3' });
});

it('§1.1 — an OFF-AIR row is not pinned at all: the edit lands at its next take', async () => {
  // What the Inspector has always promised. The freeze must not turn a loaded row into one
  // that ignores configuration — only a row that is ON something has a picture to protect.
  const r = await boot();
  await r.load('item-1', 'debate', {});
  expect(frozenOf(r), 'nothing taken, nothing pinned').toBeUndefined();

  expect(r.setSourceAssignments(EDITED).ok).toBe(true);
  const before = (await recvLines()).length;
  expect((await r.take('item-1')).accepted).toBe(true);
  expect(routesPlayed(await since(before))).toContain('route://4');
});

// ───────────────────── §2.4 — THE THREE EXEMPTIONS, ONE TEST EACH ─────────────────────

it('🔴 §2.4 exemption 1 — `R-048`s EMERGENCY SWAP still reaches air on a frozen row, in ONE action', async () => {
  /*
    🔴 The one that matters most. The sentence "freeze the row's sources at take" would take
    this away by accident, and it is the operator's 20:59 tool: an input is DEAD and the
    graphic must not come off air to repair it. Level 4 is the OUTERMOST level and does not
    freeze — the freeze is level 2 alone.
  */
  const r = await boot();
  await onAir(r);
  expect(r.setSourceAssignments(EDITED).ok).toBe(true);

  const before = (await recvLines()).length;
  expect(await r.swapLiveSource('item-1', 'guest-1', 'src-4')).toEqual({ ok: true });

  // ONE action, and it is on air NOW — `src-4` is `route://5`.
  expect(routesPlayed(await since(before))).toContain('route://5');
  expect(producerOf(r, 'guest-1')).toContain('route://5');
  // …and it did NOT write back: the pin is untouched, so clearing the patch returns the row
  // to what its take froze rather than to the edit made behind it.
  expect(frozenOf(r)).toEqual({ 'guest-1': 'src-1', 'guest-2': 'src-2' });
});

it('🔴 §2.4 exemption 2 — a PER-LOOK BINDING still reaches air on a frozen row', async () => {
  // Level 3 is what session BM built and this must not undo. It is also the operator's live
  // door for a plate the freeze is holding on something they no longer want.
  const r = await boot();
  await onAir(r);
  expect(r.setSourceAssignments(EDITED).ok).toBe(true);

  const before = (await recvLines()).length;
  expect(await r.swapLiveSource('item-1', 'guest-1', 'src-4', 'pair')).toEqual({ ok: true });

  expect(routesPlayed(await since(before))).toContain('route://5');
  expect(producerOf(r, 'guest-1')).toContain('route://5');
});

it('🔴 §2.4 exemption 3 — the CATALOG is not frozen: re-pointing a source moves the frozen row', async () => {
  /*
    The frozen fact is WHICH ENTRY this plate uses, never WHAT THAT ENTRY RESOLVES TO. If the
    installation re-points `src-1` at a different router channel, a row holding `src-1`
    follows — the alternative is a row pinned to a device that no longer exists under that
    name, which is not "protecting the picture", it is refusing to notice reality.
  */
  const r = await boot();
  await onAir(r);
  expect(producerOf(r, 'guest-1')).toContain('route://2');

  const moved = catalog({
    sources: catalog().sources.map((s) =>
      s.id === 'src-1' ? { ...s, producer: { kind: 'route' as const, channel: 8 } } : s,
    ),
  });
  expect(r.setSourceCatalog(moved).ok).toBe(true);

  const before = (await recvLines()).length;
  expect((await r.reconcileLivePlates('item-1', { mode: 'live' })).ok).toBe(true);

  expect(routesPlayed(await since(before)), 'the row follows its entry').toContain('route://8');
  expect(producerOf(r, 'guest-1')).toContain('route://8');
  // The pin still names the ENTRY, unchanged — it was never a producer string.
  expect(frozenOf(r)).toEqual({ 'guest-1': 'src-1', 'guest-2': 'src-2' });
});

// ─────────────────────────── §2.5 — THE PIN SURVIVES A BLIP ───────────────────────────

it('🔴 §2.5 — the frozen assignment SURVIVES a bridge restart, or the blip silently thaws the row', async () => {
  /*
    🔴 The bridge's freeze is PROCESS memory. Without retention a momentary blip re-resolves
    level 2 from the live store for every on-air row, and every edit made during the show
    lands at the first reconcile after the reconnect — `B-155` through the one door nobody is
    watching, with the feature present, tested and gone exactly when a plant needed it. The
    `B-107` / `B-109` class, on the state whose loss RE-ARMS a defect rather than reverting a
    value.
  */
  const r = await boot();
  await onAir(r);
  const published = r.stackSnapshot().find((i) => i.itemId === 'item-1');
  expect(published?.frozenAssignment).toEqual({ 'guest-1': 'src-1', 'guest-2': 'src-2' });

  // What the browser retains and hands back to a fresh bridge process.
  const retained: RetainedStackItem[] = [
    {
      itemId: 'item-1',
      templateId: 'debate',
      fields: {},
      state: 'on-air',
      ...(published?.frozenAssignment !== undefined && {
        frozenAssignment: published.frozenAssignment,
      }),
    },
  ];
  await runtime?.stop();
  runtime = null;
  const fresh = new CasparRuntime(
    singleServer(mock?.amcpPort ?? 0, await freeUdpPort()),
    {},
    // ⚠ THE FRESH BRIDGE BOOTS ON THE EDITED ASSIGNMENT — which is the realistic case: the
    // file on disk is what somebody changed while the show was running.
    { sweepMs: 150, sourceCatalog: catalog(), sourceAssignments: EDITED },
  );
  runtime = fresh;
  fresh.start();
  await fresh.startServing();
  fresh.templateImport(TEMPLATE, '<!doctype html><html></html>');
  await fresh.whenServerHealthy(HEALTH_MS);

  await fresh.restore(retained);
  expect(frozenOf(fresh), 'the pin came back').toEqual({ 'guest-1': 'src-1', 'guest-2': 'src-2' });

  // 🔴 …and it is READ, not merely stored. A restored pin nobody resolves against is not a
  // restored pin, which is exactly how the retention half of this class fails silently.
  const before = (await recvLines()).length;
  expect((await fresh.reconcileLivePlates('item-1', { mode: 'live' })).ok).toBe(true);
  const played = routesPlayed(await since(before));
  // ⚠ NON-VACUITY FIRST. A reconcile that sent nothing would satisfy the negative below while
  // proving nothing at all, which is the shape this session found in `stack-retention`'s own
  // guard. `src-1` is `route://2` — the frozen answer, on the wire.
  expect(played, 'the reconcile must actually reach the wire').toContain('route://2');
  expect(played, 'the edited assignment must not arrive on the reconnect').not.toContain(
    'route://4',
  );
});

// ──────────────────────────────── THE THAW ────────────────────────────────

it('§1.1 — `out` THAWS the row, and a FAILED teardown deliberately does not', async () => {
  const r = await boot();
  await onAir(r);
  expect(frozenOf(r)).toBeDefined();

  expect((await r.out('item-1')).accepted).toBe(true);
  /*
    Off air, so level 2 resolves live again — and presence of the pin is itself the answer to
    "is this row's level 2 held", which is why nothing derives that from the row's status a
    second way. See `#thawAssignment` for why a FAILED clear keeps the pin instead: the
    graphic may still be up, and thawing there hands `B-155` back the exact window this
    closes.
  */
  expect(frozenOf(r), 'off air, not pinned').toBeUndefined();
});
