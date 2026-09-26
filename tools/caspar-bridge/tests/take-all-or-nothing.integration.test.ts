import * as dgram from 'node:dgram';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createMock, defaultHandlers, type MockHandle } from '@cg/amcp-mock';
import { DEFAULT_LAYER_POLICY } from '@cg/caspar-client';
import type {
  ConnectionConfig,
  FixedLayerBank,
  SourceAssignments,
  SourceCatalog,
  TemplateInfo,
} from '@cg/shared-ipc';
import { CasparRuntime } from '../src/caspar-runtime.js';
import { validateFixedBank } from '../src/fixed-layers-store.js';
import { mayClearAfterRefusal, outcomeOf } from '../src/refusal-cleanup.js';
import { awaitChannelModeRead, HEALTH_MS } from './support/harness.js';

/**
 * 🔴 `FIELD-FIXES-01-A` — **A FRESH TAKE AIRS EVERYTHING OR NOTHING, AND A REFUSED `PLAY` NEVER
 * CLEARS A WORKING PICTURE.**
 *
 * The owner's own shape: a bed (`2-59`) whose look shows two DeckLink plates, taken on a server with
 * no such card. `FIELD-FIXES-01` §0 replayed his take on the mock and found the refusal stopped at
 * the first plate and never played the graphic — but left the graphic ADDed on its layer, and a
 * re-take of a row already on air cleared a working plate on its way out. Decision 1 is the owner's
 * answer; the Rule is the one clean-up every refusal site now asks (`refusal-cleanup.ts`).
 *
 * Asserted ON THE WIRE (the mock's trace) and on the mock's own layer state, never on a status.
 * CasparCG 2.5.0 answers a refused command with ONE line, `<code> <COMMAND> FAILED`
 * (`AMCPCommandQueue.cpp`), and that is the line the refusing handlers here send.
 */

let mock: MockHandle | null = null;
let runtime: CasparRuntime | null = null;
let tracePath: string | null = null;

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

const BANK: FixedLayerBank = { channel: 2, start: 80, count: 20, low: { start: 50, count: 10 } };
const BED = { channel: 2, layer: 59 };
const OTHER_BED = { channel: 2, layer: 58 };
const TEMPLATE_ID = 'two-box';
const ONE_BOX = 'one-box';

const CATALOG: SourceCatalog = {
  sources: [
    {
      id: 'src-1',
      name: 'studio1',
      format: '1080p5000',
      producer: { kind: 'decklink', device: 1 },
    },
    {
      id: 'src-2',
      name: 'studio2',
      format: '1080p5000',
      producer: { kind: 'decklink', device: 2 },
    },
    {
      id: 'src-3',
      name: 'studio3',
      format: '1080p5000',
      producer: { kind: 'decklink', device: 3 },
    },
  ],
  layerRange: { start: 60, end: 79 },
};

const ASSIGNMENTS: SourceAssignments = {
  assignments: [
    { templateId: TEMPLATE_ID, plateId: 'l1', sourceId: 'src-1' },
    { templateId: TEMPLATE_ID, plateId: 'l2', sourceId: 'src-2' },
    { templateId: ONE_BOX, plateId: 'solo', sourceId: 'src-3' },
  ],
};

const SCENE = { width: 1920, height: 1080 };
const CENTRED = { anchor: 'center' as const, offset: { x: 0, y: 0 } };

/** The owner's `2ghab` shape: two plates, two looks, the second showing both. */
function twoBox(): TemplateInfo {
  return {
    templateId: TEMPLATE_ID,
    templateType: 'custom',
    fields: [],
    liveSources: {
      resolution: SCENE,
      defaultPosition: CENTRED,
      sources: [
        {
          elementId: 'el-l1',
          sourceId: 'l1',
          rect: { x: 0, y: 0, width: 1920, height: 1080 },
          expectedAspect: 16 / 9,
          dynamic: false,
        },
        {
          elementId: 'el-l2',
          sourceId: 'l2',
          rect: { x: 1004, y: 0, width: 916, height: 1080 },
          expectedAspect: 16 / 9,
          dynamic: false,
        },
      ],
      looks: [
        {
          id: 'look-1',
          name: 'look-1',
          entered: { mode: 'cut' },
          rects: { l1: { x: 0, y: 0, width: 1920, height: 1080 } },
        },
        {
          id: 'look-2',
          name: 'look-2',
          entered: { mode: 'cut' },
          rects: {
            l1: { x: 0, y: 0, width: 1004, height: 1080 },
            l2: { x: 1004, y: 0, width: 916, height: 1080 },
          },
        },
      ],
      defaultLookId: 'look-1',
    },
  };
}

/** A one-plate bed for the neighbouring row. */
function oneBox(): TemplateInfo {
  return {
    templateId: ONE_BOX,
    templateType: 'custom',
    fields: [],
    liveSources: {
      resolution: SCENE,
      defaultPosition: CENTRED,
      sources: [
        {
          elementId: 'el-solo',
          sourceId: 'solo',
          rect: { x: 0, y: 0, width: 960, height: 540 },
          expectedAspect: 16 / 9,
          dynamic: false,
        },
      ],
    },
  };
}

/**
 * Which lines the stand-in refuses, and with what code. A refusal answers exactly as 2.5.0 does,
 * `<code> <VERB> FAILED` with nothing after it; every other line goes to the mock's own handler.
 */
let refusals: { match: RegExp; code: number }[] = [];

function refusing(verb: string): void {
  const fallback = defaultHandlers().get(verb);
  if (fallback === undefined) throw new Error(`no default ${verb}`);
  mock?.setHandler(verb, (req, ctx) => {
    const hit = refusals.find((r) => r.match.test(req.raw));
    if (hit !== undefined) return { kind: 'ok', code: hit.code as 202, verb: `${verb} FAILED` };
    return fallback(req, ctx);
  });
}

async function trace(): Promise<{ dir: string; line: string }[]> {
  if (mock === null || tracePath === null) throw new Error('no trace');
  await mock.traceFlush();
  return fs
    .readFileSync(tracePath, 'utf-8')
    .split('\n')
    .filter((l) => l.length > 0)
    .map((l) => JSON.parse(l) as { dir: string; line: string });
}

const mark = async (): Promise<number> => (await trace()).length;
const sentSince = async (from: number): Promise<string[]> =>
  (await trace())
    .slice(from)
    .filter((e) => e.dir === 'recv')
    .map((e) => e.line);

/** The two values a take mints afresh each time: the serve port and the take token. */
const normalise = (line: string): string =>
  line
    .replace(/http:\/\/127\.0\.0\.1:\d+\//g, 'http://127.0.0.1:<PORT>/')
    .replace(/\\"take\\":\\"[0-9a-f]+\\"/g, '\\"take\\":\\"<TOKEN>\\"');

async function boot(): Promise<CasparRuntime> {
  refusals = [];
  const oscPort = await freeUdpPort();
  tracePath = path.join(
    os.tmpdir(),
    `cg-take-aon-${String(process.pid)}-${String(Date.now())}-${String(Math.round(performance.now() * 1000))}.ndjson`,
  );
  mock = await createMock({
    amcpPort: 0,
    oscPort,
    oscHost: '127.0.0.1',
    oscHz: 30,
    channels: 2,
    tracePath,
  });
  for (const verb of ['PLAY', 'MIXER', 'CG']) refusing(verb);
  const config: ConnectionConfig = {
    servers: { A: { host: '127.0.0.1', amcpPort: mock.amcpPort, oscPort } },
    strategy: 'mirror-sync',
    autoFailoverEnabled: true,
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
  r.templateImport(oneBox(), '<!doctype html><html><body>one-box</body></html>');
  await r.whenServerHealthy(HEALTH_MS);
  await awaitChannelModeRead(r);
  await new Promise((resolve) => setTimeout(resolve, 250));
  return r;
}

/** Bed 59, bound (a LOAD sends nothing) and set to the look that shows both plates. */
async function bedOnLookTwo(r: CasparRuntime): Promise<void> {
  expect(await r.loadFixed(BED, 'bed-59', TEMPLATE_ID, {})).toEqual({ accepted: true });
  expect(await r.setActiveLook('bed-59', 'look-2')).toEqual({ ok: true });
}

const layerOf = (layer: number): { producer: string | undefined; onAir: boolean | undefined } => {
  const s = mock?.layerState({ channel: 2, layer });
  return { producer: s?.producer, onAir: s?.onAir };
};

const row = (r: CasparRuntime, itemId = 'bed-59') =>
  r.stackSnapshot(2).find((i) => i.itemId === itemId);

describe('Decision 1 — a fresh take airs everything or nothing', () => {
  it('🔴 HARD STOP — a take whose plates are all accepted sends the wire it sent before this change, byte for byte', async () => {
    /*
      RECORDED, not derived: these thirteen lines are what the code at `459c3f64` (before any of
      this) put on the mock's wire for exactly this take — captured by running it, then pasted.
      They agree with the fragments `live-seating.integration.test.ts` pins (PLAY, the created-muted
      VOLUME 0, FILL, CLIP, in that order, before the graphic's CG PLAY) and with `B-198`'s single
      COMMIT. Only the failure path may change; if this list moves, the success path moved.
    */
    const RECORDED = [
      'MIXER 2-59 VOLUME 0',
      'CG 2-59 ADD 0 "http://127.0.0.1:<PORT>/template/two-box?cw=1920&ch=1080" 0 "{\\"__cg\\":{\\"look\\":\\"look-2\\",\\"take\\":\\"<TOKEN>\\"}}"',
      'MIXER 2-59 VOLUME 1',
      'PLAY 2-60 DECKLINK DEVICE 1',
      'MIXER 2-60 VOLUME 0 DEFER',
      'MIXER 2-60 FILL 0 0.238542 0.522917 0.522917 DEFER',
      'MIXER 2-60 CLIP 0 0.238542 0.522917 0.522917 DEFER',
      'PLAY 2-61 DECKLINK DEVICE 2',
      'MIXER 2-61 VOLUME 0 DEFER',
      'MIXER 2-61 FILL 0.522917 0.261458 0.477083 0.477083 DEFER',
      'MIXER 2-61 CLIP 0.522917 0.261458 0.477083 0.477083 DEFER',
      'MIXER 2 COMMIT',
      'CG 2-59 PLAY 0',
    ];
    const r = await boot();
    await bedOnLookTwo(r);
    const from = await mark();
    expect(await r.take('bed-59')).toEqual({ accepted: true });
    expect((await sentSince(from)).map(normalise)).toEqual(RECORDED);
    // …and it is on air, with nothing to say about a refusal.
    expect(row(r)?.takeRefusal).toBeUndefined();
  });

  it('🔴 plate 1 refused — no CG PLAY, plate 2 never tried, nothing of the take left on 2-59 or 2-60, and the row names the plate', async () => {
    const r = await boot();
    await bedOnLookTwo(r);
    refusals = [{ match: /^PLAY 2-60 DECKLINK/, code: 403 }];
    const from = await mark();

    const verdict = await r.take('bed-59');

    expect(verdict).toMatchObject({
      accepted: false,
      errorCode: 'amcp-403',
      command: 'PLAY 2-60 DECKLINK DEVICE 1',
      // `FIELD-FIXES-01` B — the row carries it, so the console raises no banner for it.
      refusalOnRow: true,
    });
    const lines = await sentSince(from);
    expect(lines.map(normalise)).toEqual([
      'MIXER 2-59 VOLUME 0',
      'CG 2-59 ADD 0 "http://127.0.0.1:<PORT>/template/two-box?cw=1920&ch=1080" 0 "{\\"__cg\\":{\\"look\\":\\"look-2\\",\\"take\\":\\"<TOKEN>\\"}}"',
      'MIXER 2-59 VOLUME 1',
      'PLAY 2-60 DECKLINK DEVICE 1',
      // The graphic this take ADDED comes off its layer, the way `out()` takes it.
      'CLEAR 2-59',
      'MIXER 2-59 CLEAR',
    ]);
    // Absences, each read off the same wire that just showed a CLEAR (the positive control):
    expect(
      lines.some((l) => /^CG 2-59 PLAY/.test(l)),
      'the graphic never plays',
    ).toBe(false);
    expect(
      lines.some((l) => l.startsWith('PLAY 2-61')),
      'plate 2 is not tried',
    ).toBe(false);
    expect(lines).not.toContain('CLEAR 2-60'); // the refused PLAY put nothing there to clear
    // Nothing of ours is left on either layer.
    expect(layerOf(59).producer ?? 'empty').toBe('empty');
    expect(layerOf(60).producer ?? 'empty').toBe('empty');
    expect(r.liveLayers().has('bed-59')).toBe(false);
    // The row ends in ERROR and names the plate that was refused — and only that plate.
    const state = row(r);
    expect(state?.status).toBe('error');
    expect(state?.takeRefusal).toEqual({
      code: 'amcp-403',
      command: 'PLAY 2-60 DECKLINK DEVICE 1',
      plateId: 'l1',
      sourceId: 'src-1',
      sourceName: 'studio1',
    });
  });

  it('🔴 plate 2 refused after plate 1 was seated — plate 1 is cleared too, because this take seated it', async () => {
    const r = await boot();
    await bedOnLookTwo(r);
    refusals = [{ match: /^PLAY 2-61 DECKLINK/, code: 403 }];
    const from = await mark();

    expect(await r.take('bed-59')).toMatchObject({ accepted: false, errorCode: 'amcp-403' });

    const lines = await sentSince(from);
    // Plate 1 LANDED, so this take put it there: it comes down, geometry and all.
    expect(lines).toContain('CLEAR 2-60');
    expect(lines).toContain('MIXER 2-60 CLEAR');
    // Plate 2 was REFUSED, so the server left 2-61 as it was: nothing to clear.
    expect(lines).not.toContain('CLEAR 2-61');
    expect(lines).toContain('CLEAR 2-59');
    expect(lines.some((l) => /^CG 2-59 PLAY/.test(l))).toBe(false);
    for (const layer of [59, 60, 61]) expect(layerOf(layer).producer ?? 'empty').toBe('empty');
    expect(row(r)?.takeRefusal).toMatchObject({ plateId: 'l2', sourceName: 'studio2' });
  });

  it('CONTROL — a plate layer that already held one of our producers before the take is not cleared', async () => {
    const r = await boot();
    // Bed 58 is on air first, with its own plate on the band.
    expect(await r.loadFixed(OTHER_BED, 'bed-58', ONE_BOX, {})).toEqual({ accepted: true });
    expect(await r.take('bed-58')).toEqual({ accepted: true });
    const neighbour = r.liveLayers().get('bed-58')?.[0]?.slot.layer;
    expect(neighbour).toBeDefined();
    const theirs = neighbour as number;
    expect(layerOf(theirs).producer).toBe('decklink');

    await bedOnLookTwo(r);
    // Bed 59's second plate is refused — its own undo must stop at its own layers.
    refusals = [{ match: /^PLAY 2-\d+ DECKLINK DEVICE 2/, code: 403 }];
    const from = await mark();
    expect((await r.take('bed-59')).accepted).toBe(false);

    const lines = await sentSince(from);
    // The instrument sees this take's own undo (a CLEAR of its seated plate 1)…
    expect(lines.filter((l) => l.startsWith('CLEAR 2-6')).length).toBeGreaterThan(0);
    // …and not one line addressed to the neighbour's layer.
    expect(
      lines.some((l) => l.includes(`2-${String(theirs)} `) || l.endsWith(`2-${String(theirs)}`)),
    ).toBe(false);
    expect(layerOf(theirs).producer).toBe('decklink');
    expect(r.liveLayers().get('bed-58')).toHaveLength(1);
  });

  it("🔴 the graphic's own CG PLAY refused AFTER its plates were seated — the plates come down and the graphic comes off", async () => {
    const r = await boot();
    await bedOnLookTwo(r);
    refusals = [{ match: /^CG 2-59 PLAY/, code: 403 }];
    const from = await mark();

    expect(await r.take('bed-59')).toMatchObject({
      accepted: false,
      errorCode: 'amcp-403',
      refusalOnRow: true,
    });

    const lines = await sentSince(from);
    // Both plates landed before the graphic was refused: both come down, and so does the graphic.
    for (const layer of [60, 61]) {
      expect(lines).toContain(`CLEAR 2-${String(layer)}`);
      expect(layerOf(layer).producer ?? 'empty').toBe('empty');
    }
    expect(lines).toContain('CLEAR 2-59');
    expect(layerOf(59).producer ?? 'empty').toBe('empty');
    expect(r.liveLayers().has('bed-59')).toBe(false);
    expect(row(r)?.takeRefusal).toMatchObject({ code: 'amcp-403', command: 'CG 2-59 PLAY 0' });
    expect(row(r)?.takeRefusal?.plateId).toBeUndefined();
  });

  it('`refusalOnRow` rides only a refusal the row carries — control: a refusal before the wire has none', async () => {
    const r = await boot();
    await bedOnLookTwo(r);
    expect(await r.take('bed-59')).toEqual({ accepted: true });
    // Decision 2's refusal happens before anything is sent, and records nothing on the row.
    const onAir = await r.take('bed-59');
    expect(onAir).toMatchObject({ accepted: false, errorCode: 'already-on-air' });
    expect(onAir).not.toHaveProperty('refusalOnRow');
  });

  it('the refusal line is withdrawn by the next take that lands', async () => {
    const r = await boot();
    await bedOnLookTwo(r);
    refusals = [{ match: /^PLAY 2-60 DECKLINK/, code: 403 }];
    expect((await r.take('bed-59')).accepted).toBe(false);
    expect(row(r)?.takeRefusal).toBeDefined();

    refusals = [];
    expect(await r.take('bed-59')).toEqual({ accepted: true });
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(row(r)?.takeRefusal).toBeUndefined();
    expect(layerOf(59).onAir).toBe(true);
  });
});

describe('THE RULE — a refused PLAY never clears a working picture', () => {
  it('the one answer, as a table: cleared only if this operation put a producer there, never if one of ours was there before', () => {
    expect(mayClearAfterRefusal({ outcome: 'landed', heldBefore: false })).toBe(true);
    expect(mayClearAfterRefusal({ outcome: 'unknown', heldBefore: false })).toBe(true);
    expect(mayClearAfterRefusal({ outcome: 'refused', heldBefore: false })).toBe(false);
    for (const outcome of ['landed', 'unknown', 'refused'] as const) {
      expect(mayClearAfterRefusal({ outcome, heldBefore: true })).toBe(false);
    }
    // The reply decides the outcome: a 4xx arrived and refused; anything else is unknown.
    expect(outcomeOf({ ok: true })).toBe('landed');
    expect(outcomeOf({ ok: false, errorCode: 'amcp-403' })).toBe('refused');
    expect(outcomeOf({ ok: false, errorCode: 'amcp-404' })).toBe('refused');
    expect(outcomeOf({ ok: false, errorCode: 'amcp-501' })).toBe('unknown');
    expect(outcomeOf({ ok: false, errorCode: 'amcp-timeout' })).toBe('unknown');
    expect(outcomeOf({ ok: false, errorCode: 'amcp-send-failed' })).toBe('unknown');
  });

  it('🔴 an R-048 swap whose PLAY is refused leaves the old working producer on its layer, with no CLEAR sent', async () => {
    const r = await boot();
    await bedOnLookTwo(r);
    expect(await r.take('bed-59')).toEqual({ accepted: true });
    const layer = r
      .liveLayers()
      .get('bed-59')
      ?.find((rec) => rec.sourceId === 'l1')?.slot.layer;
    expect(layer).toBe(60);

    // Point l1 at studio3 in every look: studio1 leaves entirely, so studio3 REPLACES it in place.
    refusals = [{ match: /^PLAY 2-60 DECKLINK DEVICE 3/, code: 404 }];
    const from = await mark();
    const res = await r.swapLiveSource('bed-59', 'l1', 'src-3');

    expect(res.ok).toBe(false);
    const lines = await sentSince(from);
    expect(lines).toContain('PLAY 2-60 DECKLINK DEVICE 3');
    expect(lines).not.toContain('CLEAR 2-60');
    expect(lines).not.toContain('MIXER 2-60 CLEAR');
    // The working producer is still there, and the ledger still names it.
    expect(layerOf(60)).toEqual({ producer: 'decklink', onAir: true });
    expect(
      r
        .liveLayers()
        .get('bed-59')
        ?.find((rec) => rec.slot.layer === 60)?.producer,
    ).toBe('DECKLINK DEVICE 1');
  });

  it('CONTROL — a refusal on a layer the same operation seated IS cleared', async () => {
    const r = await boot();
    await bedOnLookTwo(r);
    expect(await r.take('bed-59')).toEqual({ accepted: true });

    // Point l1 at studio3 in look-2 ONLY: look-1 still binds studio1, so studio1 keeps its layer
    // and studio3 is seated on a FRESH one — whose mute is then refused.
    refusals = [{ match: /^MIXER 2-62 VOLUME/, code: 403 }];
    const from = await mark();
    const res = await r.swapLiveSource('bed-59', 'l1', 'src-3', 'look-2');

    expect(res.ok).toBe(false);
    const lines = await sentSince(from);
    // The operation put a producer on 2-62 (its PLAY landed), so the Rule clears it…
    expect(lines).toContain('PLAY 2-62 DECKLINK DEVICE 3');
    expect(lines).toContain('CLEAR 2-62');
    expect(lines).toContain('MIXER 2-62 CLEAR');
    expect(layerOf(62).producer ?? 'empty').toBe('empty');
    // …and nothing it did not put there.
    expect(lines).not.toContain('CLEAR 2-60');
    expect(layerOf(60).producer).toBe('decklink');
  });
});
