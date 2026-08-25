import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, expect, it, describe } from 'vitest';
import {
  createMock,
  type AmcpHandler,
  type AmcpRequest,
  type AmcpResponse,
  type MockHandle,
} from '@cg/amcp-mock';
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
 * 🔴 **`B-166` / `B-167` — A LOOK SWITCH THAT REFUSES MUST HAVE CHANGED NOTHING, AND ONE THAT
 * REPORTS SUCCESS MUST HAVE DONE SOMETHING.**
 *
 * The owner, on the plant: with one source of a 3-box look faulty he pressed the 3-box button.
 * **An error appeared and the button did not activate — but the boxes switched to 3-box
 * anyway** and the faulty box went black.
 *
 * ── 🔴 THE ONE-AXIS TRAP THAT LET THIS SHIP, STATED BEFORE THE TESTS ────────
 *
 * **The boxes move by `MIXER FILL` / `MIXER CLIP` — NOT by `PLAY`.** A plain switch is a pure
 * delta and issues no `PLAY` at all, so **a test asserting "no `PLAY` on refusal" passes while
 * this bug is fully present**. That is exactly why the assertions below enumerate every verb
 * that can move a picture rather than summarising, and why they are written against a
 * PROVEN-QUIESCENT wire (`awaitChannelModeRead`) so an ambient one-shot cannot be mistaken for
 * the verb's own traffic.
 *
 * ── ⚠ TWO KINDS OF REFUSAL, AND ONLY ONE OF THEM CAN BE SILENT ─────────────
 *
 * This distinction is the reason there are two tests and not one, and it corrects the brief:
 *
 * - **PLAN-time** — the switch is refused before the wire (an unresolvable source). Here
 *   "nothing reached the wire" is literally true and is asserted verb by verb.
 * - **WIRE-time** — the source resolves and CasparCG then refuses the command. The wire
 *   CANNOT be silent: the refusal came from it. What must hold is that the row **ENDS where it
 *   started** — every box back at the previous look's geometry, the ledger unchanged, the page
 *   never told. "Refused" means *changed nothing*, not *sent nothing*.
 *
 * The owner's plant case is the WIRE-time one: a box that renders black is one whose command
 * was attempted.
 */

let mock: MockHandle | null = null;
let runtime: CasparRuntime | null = null;
let tracePath: string | null = null;

const BAND = { start: 30, end: 35 };
const SCENE = { width: 1920, height: 1080 };
const CENTRED = { anchor: 'center' as const, offset: { x: 0, y: 0 } };

/**
 * 🔴 THE DISCRIMINATING FIXTURE. Three looks with DIFFERENT membership — not a superset and
 * not a subset of one another — because a same-membership switch moves nothing and would pass
 * every assertion here while the defect was fully present.
 */
const GRID: Record<string, LiveSourceRect> = {
  'live-1': { x: 0, y: 0, width: 640, height: 360 },
  'live-2': { x: 640, y: 0, width: 640, height: 360 },
  'live-3': { x: 1280, y: 0, width: 640, height: 360 },
};
const ROUTE_KEYS = Object.keys(GRID);

/** TWO-BOX: `live-1` + `live-2`, side by side and BIGGER than their 3-box cells. */
const TWO: Record<string, LiveSourceRect> = {
  'live-1': { x: 0, y: 0, width: 960, height: 540 },
  'live-2': { x: 960, y: 0, width: 960, height: 540 },
};
/** THREE-BOX: adds `live-3` and MOVES the other two — different membership AND different geometry. */
const THREE: Record<string, LiveSourceRect> = {
  'live-1': { x: 0, y: 200, width: 640, height: 360 },
  'live-2': { x: 640, y: 200, width: 640, height: 360 },
  'live-3': { x: 1280, y: 200, width: 640, height: 360 },
};

function look(id: string, rects: Record<string, LiveSourceRect>): TemplateLook {
  return { id, name: id, entered: { mode: 'cut' }, rects };
}

function template(): TemplateInfo {
  return {
    templateId: 'debate',
    templateType: 'debate',
    fields: [],
    liveSources: {
      resolution: SCENE,
      defaultPosition: CENTRED,
      sources: ROUTE_KEYS.map((k) => ({
        elementId: `el-${k}`,
        sourceId: k,
        rect: GRID[k] as LiveSourceRect,
        dynamic: false,
      })),
      arrangements: [],
      looks: [look('two', TWO), look('three', THREE)],
      defaultLookId: 'two',
    },
  } as unknown as TemplateInfo;
}

function catalog(): SourceCatalog {
  return {
    layerRange: BAND,
    sources: [1, 2, 3].map((n) => ({
      id: `src-${String(n)}`,
      name: `Studio ${String(n)}`,
      producer: { kind: 'decklink' as const, device: n },
    })),
  } as unknown as SourceCatalog;
}

const ASSIGNMENTS: SourceAssignments = {
  assignments: ROUTE_KEYS.map((k, i) => ({
    templateId: 'debate',
    plateId: k,
    sourceId: `src-${String(i + 1)}`,
  })),
};

function singleServer(amcpPort: number, oscPort: number): ConnectionConfig {
  return {
    servers: { A: { host: '127.0.0.1', amcpPort, oscPort } },
    strategy: 'mirror-sync',
    autoFailoverEnabled: true,
  } as unknown as ConnectionConfig;
}

async function freeUdpPort(): Promise<number> {
  const dgram = await import('node:dgram');
  return new Promise((resolve) => {
    const s = dgram.createSocket('udp4');
    s.bind(0, '127.0.0.1', () => {
      const p = s.address().port;
      s.close(() => resolve(p));
    });
  });
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

async function boot(): Promise<CasparRuntime> {
  const oscPort = await freeUdpPort();
  tracePath = path.join(
    os.tmpdir(),
    `cg-lookrefuse-${String(process.pid)}-${String(Date.now())}-${String(
      Math.round(performance.now() * 1000),
    )}.ndjson`,
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
  r.templateImport(template(), '<!doctype html><html></html>');
  await r.whenServerHealthy(HEALTH_MS);
  // 🔴 The baseline is only valid from a PROVEN-QUIESCENT wire: R-030's timer-driven one-shot
  // `INFO` has to have landed first, or a "nothing reached the wire" assertion is measuring a
  // race. Not filterable — filtering would make it pass vacuously if the read stopped happening.
  await awaitChannelModeRead(r);
  return r;
}

async function onAirOnTwo(r: CasparRuntime): Promise<void> {
  await r.load('item-1', 'debate', {});
  expect((await r.take('item-1')).accepted).toBe(true);
  expect(r.activeLookId('item-1')).toBe('two');
}

/** The plates' geometry as the ledger records it — the thing a switch moves. */
const fits = (r: CasparRuntime): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const rec of r.liveLayers().get('item-1') ?? []) {
    out[`${rec.sourceId}@${String(rec.slot.layer)}`] =
      `${JSON.stringify(rec.fill)}|${JSON.stringify(rec.clip)}`;
  }
  return out;
};

/**
 * 🔴 EVERY VERB THAT CAN MOVE A PICTURE, ENUMERATED. Not `PLAY` alone — the owner's boxes
 * moved by `MIXER FILL`, so a `PLAY`-only assertion is the one-axis blindness that shipped it.
 */
const MOVING_VERBS = ['PLAY', 'MIXER', 'FILL', 'CLIP', 'VOLUME', 'CG'] as const;

/**
 * Refuse the FIRST `MIXER … FILL` with a 404, then answer normally.
 *
 * ⚠ **`setHandler` OVERRIDES the verb outright — there is no fall-through**, and returning
 * anything that is not a full response makes the mock answer `500` to every later `MIXER`,
 * which is a different failure wearing the same clothes. So the non-refusing path returns the
 * `202` `handleMixer` returns.
 *
 * ⚠ **It does NOT call `ctx.setLayer`, so the MOCK's own fill/clip state stops tracking once
 * this is installed.** Every assertion in this file reads the BRIDGE's ledger (`liveLayers()`)
 * — which is the thing `B-166`/`B-167` are about — so that is sound here. **Do not add a
 * `layerRenderedRect` assertion to a test using this without fixing it first**: it would read
 * a state nobody is updating and pass for the wrong reason.
 */
function refuseFirstFill(): void {
  let armed = true;
  const handler: AmcpHandler = (req: AmcpRequest): AmcpResponse => {
    const sub = (req.args[1] ?? '').toUpperCase();
    if (armed && sub === 'FILL') {
      armed = false;
      return { kind: 'err', code: 404, verb: 'MIXER' };
    }
    return { kind: 'ok', code: 202, verb: 'MIXER' };
  };
  mock?.setHandler('MIXER', handler);
}

afterEach(async () => {
  await runtime?.stop();
  runtime = null;
  await mock?.stop();
  mock = null;
  if (tracePath !== null && fs.existsSync(tracePath)) fs.rmSync(tracePath);
  tracePath = null;
});

describe('B-166 / B-167 — a refused look switch', () => {
  it('🔴 PLAN-time refusal: NOTHING reaches the wire — every moving verb, enumerated', async () => {
    const r = await boot();
    await onAirOnTwo(r);
    const before = (await recvLines()).length;

    // An unknown look is refused before the plan even runs.
    const res = await r.setActiveLook('item-1', 'no-such-look');
    expect(res.ok).toBe(false);

    const sent = (await recvLines()).slice(before);
    for (const verb of MOVING_VERBS) {
      expect(
        sent.filter((l) => l.includes(verb)),
        `${verb} reached the wire`,
      ).toEqual([]);
    }
    expect(r.activeLookId('item-1')).toBe('two');
  });

  it('🔴 WIRE-time refusal: the row ENDS on the previous look, with every box back', async () => {
    const r = await boot();
    await onAirOnTwo(r);
    const geometryBefore = fits(r);
    const lookBefore = r.activeLookId('item-1');

    /*
      🔴 THE OWNER'S CASE: a source that resolves fine and that CasparCG then refuses.
      Injected on `MIXER`, because that is the verb a plain switch actually uses — the whole
      point of `B-166` is that the boxes moved without a single `PLAY`.
    */
    refuseFirstFill();

    const res = await r.setActiveLook('item-1', 'three');
    expect(res.ok, 'the switch must be refused').toBe(false);

    // 🔴 The whole of B-166: refused means CHANGED NOTHING, not SENT NOTHING.
    expect(r.activeLookId('item-1'), 'the row moved look on a refused switch').toBe(lookBefore);
    expect(fits(r), 'a box was left at the new geometry after a refusal').toEqual(geometryBefore);
  });

  it('🔴 B-167: the SECOND press is not a silent `ok` — it works, or it refuses again', async () => {
    const r = await boot();
    await onAirOnTwo(r);
    const geometryBefore = fits(r);

    refuseFirstFill();

    expect((await r.setActiveLook('item-1', 'three')).ok).toBe(false);
    expect(fits(r)).toEqual(geometryBefore);

    /*
      The re-press the product PRESCRIBES. Before this fix it was a GUARANTEED no-op that
      answered `ok`: the refused re-fit left the ATTEMPTED geometry in the ledger, so the
      delta computed to nothing, no `MIXER FILL` was emitted, and the page was then told the
      look — holes moved, boxes did not, and the switch went green. The mock now accepts, so
      the only honest outcomes are "it worked" or "it refused again for the same reason".
    */
    const second = await r.setActiveLook('item-1', 'three');
    expect(second.ok, 'the re-press must not be a silent no-op').toBe(true);
    expect(r.activeLookId('item-1')).toBe('three');
    expect(fits(r), 'the boxes must actually have moved this time').not.toEqual(geometryBefore);
  });

  it('a switch that SUCCEEDS still moves everything, and reports it', async () => {
    // The positive control. Without it every assertion above passes on a switch that never works.
    const r = await boot();
    await onAirOnTwo(r);
    const geometryBefore = fits(r);

    const res = await r.setActiveLook('item-1', 'three');
    expect(res.ok).toBe(true);
    expect(r.activeLookId('item-1')).toBe('three');
    expect(fits(r)).not.toEqual(geometryBefore);
  });

  it('🔴 §3 — the UNION pre-seat does not narrow: every look’s input stays seated', async () => {
    // A narrowed union puts a `PLAY` back inside a switch and is `B-155` case 3 returning.
    // Asserted as the whole seat SET, not as the boxes that happen to be visible.
    const r = await boot();
    await onAirOnTwo(r);
    const seatedOnTwo = new Set(
      (r.liveLayers().get('item-1') ?? []).map((rec) => rec.producer).filter(Boolean),
    );
    // `live-3` is bound only by the look that is NOT punched, and must still be seated.
    expect(seatedOnTwo.size, 'the union pre-seat is narrower than every look’s inputs').toBe(3);

    expect((await r.setActiveLook('item-1', 'three')).ok).toBe(true);
    const seatedOnThree = new Set(
      (r.liveLayers().get('item-1') ?? []).map((rec) => rec.producer).filter(Boolean),
    );
    expect(seatedOnThree).toEqual(seatedOnTwo);
  });
});
