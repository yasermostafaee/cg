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
} from '@cg/shared-ipc';
import { readCgControl, type CgControl, type LiveSourceRect } from '@cg/shared-schema';
import { CasparRuntime } from '../src/caspar-runtime.js';
import { awaitChannelModeRead, HEALTH_MS } from './support/harness.js';

/**
 * 🔴 **`SKEW-INTERSECT-01` — THE TRANSITION WINDOW ON THE WIRE: a switch narrows the page's
 * mask, moves the fills inside the window, and widens it again — and NOTHING can leave the
 * page narrowed.**
 *
 * `B-174` closed the gap between the two halves of a switch to ±1 FIELD and no further: the
 * page's paint clock and the channel tick are not phase-locked and, per `SKEW-RESIDUE-01`,
 * nothing on any transport this version speaks carries a channel frame number to lock them
 * with. So the residual is covered instead of chased: for the length of the window the page
 * punches `outgoing ∩ entering`, every pixel of which is backed by a picture in BOTH
 * geometries, and the mixer's move lands strictly inside it.
 *
 * ── WHAT THIS FILE PINS THAT NO OTHER DOES ──────────────────────────────────
 *
 * `live-look-reconcile` pins the two tells and their payloads byte for byte on the common
 * path. What is here is everything that is only visible when the window has DURATION: that
 * the two halves are real sleeps derived from the observed mode, that the flag turning them
 * off restores the single-tell switch exactly, and — the part `B-161` earns a place for —
 * **what can arrive inside the second window and what the bridge does about it.**
 *
 * ⚠ **NO WALL-CLOCK CEILINGS ANYWHERE** (`B-098` / `P-034`). Durations are asserted as lower
 * bounds, and the "0 is a real value" property as a DIFFERENCE OF MINIMA between two
 * configurations measured in the same process — the discipline `look-switch-hold` states in
 * full and for the same reason.
 */

const SCENE = { width: 1920, height: 1080 } as const;
const CENTRED = { anchor: 'center', offset: { x: 0, y: 0 } } as const;

/**
 * 🔴 **THE OWNER'S OWN SHAPE, from `tools/skew-harness/fixtures/owner/3-ghab.vcg`.** `full`
 * is ONE plate over the whole frame and `boxes` is two of his actual rects, so every switch
 * here opens or closes a nearly-full-frame hole — the case where the artefact is largest and
 * the one two similarly-sized boxes cannot discriminate.
 */
const FULL: Record<string, LiveSourceRect> = {
  'live-1': { x: 0, y: 0, width: 1920, height: 1080 },
};
const BOXES: Record<string, LiveSourceRect> = {
  'live-1': { x: 23, y: 301, width: 916, height: 515 },
  'live-2': { x: 984, y: 301, width: 916, height: 515 },
};
/** A third look, so a switch can be pressed while another is still in its window. */
const STACKED: Record<string, LiveSourceRect> = {
  'live-1': { x: 23, y: 23, width: 916, height: 515 },
  'live-2': { x: 23, y: 560, width: 916, height: 515 },
};

function template(): TemplateInfo {
  return {
    templateId: 'ghab',
    templateType: 'ghab',
    fields: [],
    liveSources: {
      resolution: SCENE,
      defaultPosition: CENTRED,
      sources: ['live-1', 'live-2'].map((k) => ({
        elementId: `el-${k}`,
        sourceId: k,
        rect: BOXES[k] as LiveSourceRect,
        dynamic: false,
      })),
      arrangements: [],
      looks: [
        { id: 'boxes', name: 'boxes', entered: { mode: 'cut' }, rects: BOXES },
        { id: 'full', name: 'full', entered: { mode: 'cut' }, rects: FULL },
        { id: 'stacked', name: 'stacked', entered: { mode: 'cut' }, rects: STACKED },
      ],
      defaultLookId: 'boxes',
    },
  } as unknown as TemplateInfo;
}

const CATALOG = {
  layerRange: { start: 30, end: 35 },
  sources: [1, 2].map((n) => ({
    id: `src-${String(n)}`,
    name: `Studio ${String(n)}`,
    producer: { kind: 'decklink' as const, device: n },
  })),
} as unknown as SourceCatalog;

const ASSIGNMENTS: SourceAssignments = {
  assignments: ['live-1', 'live-2'].map((k, i) => ({
    templateId: 'ghab',
    plateId: k,
    sourceId: `src-${String(i + 1)}`,
  })),
};

let mock: MockHandle | null = null;
let runtime: CasparRuntime | null = null;
let tracePath: string | null = null;

function freeUdpPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const s = dgram.createSocket('udp4');
    s.once('error', reject);
    s.bind(0, '127.0.0.1', () => {
      const port = s.address().port;
      s.close(() => resolve(port));
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

interface BootOptions {
  readonly lookMixerHoldMs?: number;
  readonly lookTransitionLeadMs?: number;
  readonly lookTransitionTailMs?: number;
  readonly lookTransitionMask?: boolean;
}

async function boot(options: BootOptions = {}): Promise<CasparRuntime> {
  const oscPort = await freeUdpPort();
  tracePath = path.join(
    os.tmpdir(),
    `cg-window-${String(process.pid)}-${String(Date.now())}-${String(
      Math.round(performance.now() * 1000),
    )}.ndjson`,
  );
  mock = await createMock({ amcpPort: 0, oscPort, oscHost: '127.0.0.1', oscHz: 30, tracePath });
  const r = new CasparRuntime(
    singleServer(mock.amcpPort, oscPort),
    {},
    {
      sweepMs: 150,
      sourceCatalog: CATALOG,
      sourceAssignments: ASSIGNMENTS,
      ...options,
    },
  );
  runtime = r;
  r.start();
  await r.startServing();
  r.templateImport(template(), '<!doctype html><html></html>');
  await r.whenServerHealthy(HEALTH_MS);
  // The DEFAULTS derive from the OBSERVED mode, so the reading must exist before anything is
  // timed — otherwise the fallback answers and the derivation goes untested.
  await awaitChannelModeRead(r);
  await r.load('item-1', 'ghab', {});
  expect((await r.take('item-1')).accepted).toBe(true);
  return r;
}

async function teardown(): Promise<void> {
  await runtime?.stop();
  runtime = null;
  await mock?.stop();
  mock = null;
  if (tracePath !== null && fs.existsSync(tracePath)) fs.rmSync(tracePath);
  tracePath = null;
}

afterEach(teardown);

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

/**
 * Every `__cg` control object the page was told, in order, read back through the SAME codec
 * the page reads with — a payload the page could not parse must not satisfy an assertion here.
 *
 * ⚠ The wire form carries the hardware-verified two-layer escape (`B-041` take 2), so the
 * unescape is undone rather than guessed.
 */
function toldControls(lines: readonly string[]): CgControl[] {
  const out: CgControl[] = [];
  for (const line of lines) {
    const m = /^CG \d+-\d+ UPDATE \d+ "(.*)"$/s.exec(line);
    if (m === null) continue;
    const payload = JSON.parse((m[1] ?? '').replace(/\\(.)/g, '$1')) as Record<string, unknown>;
    const control = readCgControl(payload);
    if (control !== undefined) out.push(control);
  }
  return out;
}

/** The POSITIVE CONTROL for every "the page was told X" claim: the parser reads a known take. */
async function parserControl(): Promise<void> {
  const lines = (await recvLines()).filter((l) => /^CG \d+-\d+ ADD /.test(l));
  const m = /^CG \d+-\d+ ADD \d+ ".*?" 0 "(.*)"$/s.exec(lines[0] ?? '');
  expect(
    m,
    'the take must have carried a CG ADD payload for the parser to prove itself on',
  ).not.toBeNull();
  const payload = JSON.parse((m?.[1] ?? '').replace(/\\(.)/g, '$1')) as Record<string, unknown>;
  expect(readCgControl(payload)?.look, 'parser control: the first take names the default').toBe(
    'boxes',
  );
}

async function timedSwitch(r: CasparRuntime, to: string): Promise<number> {
  const started = performance.now();
  expect((await r.setActiveLook('item-1', to)).ok).toBe(true);
  return performance.now() - started;
}

/** The FASTEST of `n` switches — a stall inflates one sample; the minimum survives it. */
async function fastestSwitch(r: CasparRuntime, n: number): Promise<number> {
  let best = Number.POSITIVE_INFINITY;
  for (let i = 0; i < n; i++) {
    best = Math.min(best, await timedSwitch(r, i % 2 === 0 ? 'full' : 'boxes'));
  }
  return best;
}

// ───────────────────────────── THE WINDOW HAS DURATION ─────────────────────────────

it('an EXPLICIT lead and tail are honoured — the switch waits for both', async () => {
  const r = await boot({
    lookMixerHoldMs: 0,
    lookTransitionLeadMs: 120,
    lookTransitionTailMs: 120,
  });
  expect(
    await timedSwitch(r, 'full'),
    'the switch spans both halves of the window',
  ).toBeGreaterThanOrEqual(235);
});

it('the DEFAULTS derive from the OBSERVED mode: two more 1080i5000 frames than a zero window', async () => {
  /*
    `??`-resolved, so an explicit 0 must not fall through to the derived default — the
    falsy-zero trap this repo has paid for more than once. Spelled as a COMPARISON rather than
    a ceiling: both configurations run the same plan, the same two tells and the same fills,
    so everything but the deliberate sleeps cancels. The mock reports `1080i5000` — a 25 Hz
    tick, 40 ms per channel frame — so the window's two halves are 80 ms of the difference.
  */
  const zero = await boot({
    lookMixerHoldMs: 0,
    lookTransitionLeadMs: 0,
    lookTransitionTailMs: 0,
  });
  const withoutWindow = await fastestSwitch(zero, 5);
  await teardown();

  const derived = await boot({ lookMixerHoldMs: 0 });
  const withWindow = await fastestSwitch(derived, 5);

  expect(
    withWindow - withoutWindow,
    `two 1080i5000 frames: ${String(Math.round(withWindow))} ms with the window, ` +
      `${String(Math.round(withoutWindow))} ms without`,
  ).toBeGreaterThanOrEqual(60);
});

it('🔴 the CONTROL: with the mask OFF the switch is the single tell that shipped before', async () => {
  /*
    The flag exists so a before/after measurement runs the SAME binary twice — a
    discrimination claim resting on a build that was never exercised is not a control at all.
    What it must restore is exact: ONE `CG UPDATE`, naming the entering look, carrying no
    `from`, before any fill moves.
  */
  const r = await boot({ lookMixerHoldMs: 0, lookTransitionMask: false });
  const before = (await recvLines()).length;
  expect((await r.setActiveLook('item-1', 'full')).ok).toBe(true);
  const lines = (await recvLines()).slice(before);

  await parserControl();
  const told = toldControls(lines);
  expect(told, 'exactly one tell, as before this existed').toHaveLength(1);
  expect(told[0]).toEqual({ look: 'full', plates: expect.anything() as never });
  const firstFill = lines.findIndex((l) => /^MIXER 1-\d+ FILL /.test(l));
  expect(firstFill, 'the fills still moved').toBeGreaterThanOrEqual(0);
  expect(
    lines.findIndex((l) => /^CG 1-\d+ UPDATE /.test(l)),
    'and the page is still told first',
  ).toBeLessThan(firstFill);
});

// ───────────── WHAT ARRIVES INSIDE THE WINDOW — and the invariant it must not break ─────────────

/**
 * 🔴 **THE INVARIANT: the page is NEVER left narrowed.** The transition mask is a SUBSET of
 * the entering look's holes, so a page left in it shows less picture than the look asks for,
 * for as long as nothing else re-punches. Every exit from a switch that narrowed must
 * therefore end with a tell carrying no `from` — the settle when it succeeded, the revert to
 * the previous look when it did not.
 */
const lastTold = (told: readonly CgControl[]): CgControl | undefined => told[told.length - 1];

it('🔴 the HAPPY path ends widened: narrow → fills → settle, in that order', async () => {
  const r = await boot({ lookMixerHoldMs: 0 });
  const before = (await recvLines()).length;
  expect((await r.setActiveLook('item-1', 'full')).ok).toBe(true);
  const lines = (await recvLines()).slice(before);

  await parserControl();
  const told = toldControls(lines);
  expect(told.map((c) => [c.look, c.from])).toEqual([
    ['full', 'boxes'],
    ['full', undefined],
  ]);

  /*
    ⚠ **THE TAIL IS A SECOND WINDOW, and what follows the fills is the guard on it.** `B-174`'s
    hold opened the first one and `B-161`'s shape is what it risked: a deterministic span in
    which an un-gated emergency verb can land, followed by work that puts content back on air.
    Everything after the last `MIXER` here must therefore be ONE `CG … UPDATE` and nothing
    else — no `PLAY`, no `CG ADD`, no `MIXER` — so an `out` arriving inside the tail cannot be
    answered by a command that re-lights a producer on a layer it has just cleared.
  */
  const lastMixer = lines.map((l) => /^MIXER /.test(l)).lastIndexOf(true);
  expect(lastMixer, 'the fills moved').toBeGreaterThanOrEqual(0);
  const afterFills = lines.slice(lastMixer + 1);
  expect(afterFills).toHaveLength(1);
  expect(afterFills[0]).toMatch(/^CG 1-\d+ UPDATE 0 /);
});

it('🔴 a row taken OFF AIR inside the LEAD is put back — and put back WIDE', async () => {
  /*
    The window this opens is the hold's, one channel frame longer. The abort itself is
    `B-174`'s and is pinned in `look-switch-hold`; what is pinned HERE is the half the
    transition mask adds: the revert tell must carry NO `from`, or a refused switch would
    leave the page punching `outgoing ∩ entering` — a narrowed mask for a switch that never
    happened, with the fills never having moved at all.
  */
  const r = await boot({ lookMixerHoldMs: 600 });
  const before = (await recvLines()).length;

  let sawTell!: () => void;
  const told = new Promise<void>((resolve) => {
    sawTell = resolve;
  });
  // Installed after the take, so its `CG ADD`/`PLAY` went through the default handler.
  mock?.setHandler('CG', (req) => {
    if ((req.args[1] ?? '').toUpperCase() === 'UPDATE') sawTell();
    return { kind: 'ok', code: 202, verb: 'CG' };
  });

  const switching = r.setActiveLook('item-1', 'full');
  await told;
  expect((await r.out('item-1')).accepted).toBe(true);
  const outcome = await switching;
  expect(outcome.ok).toBe(false);
  expect(outcome.reason).toBe('not-live');

  const controls = toldControls((await recvLines()).slice(before));
  expect(controls[0], 'the switch did narrow before the row left').toEqual(
    expect.objectContaining({ look: 'full', from: 'boxes' }),
  );
  expect(lastTold(controls)?.look, 'the page is put back on the look it shows').toBe('boxes');
  expect(lastTold(controls)?.from, 'and put back WIDE').toBeUndefined();
});

it('🔴 a row taken OFF AIR inside the TAIL is not resurrected by the settling tell', async () => {
  /*
    🔴 **THE SECOND WINDOW, and the question `SKEW-HOLD-01`'s review asks of every one of
    them.** `B-174`'s hold made the span between the plan and the first fill a deterministic
    place an un-gated `out`/`stop`/`clearAll` could land in, and the damage was not the
    interruption — it was what ran AFTERWARDS: an apply re-`PLAY`ing the union pre-seat onto
    layers the operator had just cleared, and `registerLiveLayers` resurrecting a ledger for a
    row the stack believes idle. `B-161`'s shape, reached with no take.

    This fix opens a second span, between the fills landing and the mask widening. What can
    arrive is the same set — the emergency verbs are DELIBERATELY outside the seat lock — and
    the answer is that the only thing scheduled after them is ONE `CG UPDATE`: a payload for a
    page, carrying no playout verb, unable to seat anything. So the row STAYS off air, its
    ledger stays gone, and the switch still reports the truth about the geometry it did move.

    Deterministic, not timed: the tail is long, and the moment the last fill lands is read off
    the wire rather than waited for.
  */
  const r = await boot({ lookMixerHoldMs: 0, lookTransitionTailMs: 600 });
  const seated = r.liveLayers().get('item-1') ?? [];
  expect(seated.length, 'the row must be seated before an out means anything').toBeGreaterThan(0);

  let sawFill!: () => void;
  const filled = new Promise<void>((resolve) => {
    sawFill = resolve;
  });
  mock?.setHandler('MIXER', (req) => {
    if ((req.args[1] ?? '').toUpperCase() === 'CLIP') sawFill();
    return { kind: 'ok', code: 202, verb: 'MIXER' };
  });

  const switching = r.setActiveLook('item-1', 'full');
  await filled;
  const beforeOut = (await recvLines()).length;
  expect((await r.out('item-1')).accepted, 'the un-gated OUT must not queue behind the tail').toBe(
    true,
  );
  const afterOut = (await recvLines()).length;
  // The switch's own geometry did land before the out, so it reports success about it.
  expect((await switching).ok).toBe(true);

  const settleWindow = (await recvLines()).slice(afterOut);
  expect(
    settleWindow.filter((l) => /^(PLAY |CG \d+-\d+ ADD |MIXER )/.test(l)),
    'nothing after the out may re-light a producer or re-seat a layer',
  ).toEqual([]);
  expect(r.liveLayers().get('item-1') ?? [], 'and the ledger stays gone — no resurrection').toEqual(
    [],
  );
  // The positive control for that emptiness: the OUT itself was loud on the wire, so a silent
  // window above cannot be a trace that stopped recording.
  expect((await recvLines()).slice(beforeOut, afterOut).length).toBeGreaterThan(0);
});

it('🔴 a WIRE REFUSAL after the page moved also ends widened', async () => {
  /*
    The one refusal only the wire can deliver: CasparCG refusing a `MIXER` line it has already
    been sent. `#applyLivePlates`'s `'switch'` branch puts every fill back (`B-166`); this is
    the page's half of the same rollback, and under the transition mask it has to WIDEN as
    well as revert — the previous look's own holes, not the intersection.
  */
  const r = await boot({ lookMixerHoldMs: 0 });
  const before = (await recvLines()).length;
  mock?.setHandler('MIXER', () => ({ kind: 'err', code: 502, verb: 'MIXER' }));
  const outcome = await r.setActiveLook('item-1', 'full');
  expect(outcome.ok).toBe(false);

  const controls = toldControls((await recvLines()).slice(before));
  expect(controls.length, 'narrowed, then put back').toBeGreaterThanOrEqual(2);
  expect(lastTold(controls)?.look).toBe('boxes');
  expect(lastTold(controls)?.from).toBeUndefined();
});

it('🔴 a SECOND switch pressed inside the window runs AFTER it — never interleaved', async () => {
  /*
    `B-155` §B's live-seat lock spans the WHOLE on-air branch, and `SKEW-INTERSECT-01` extends
    what that branch contains: the tail and the settling tell are inside it too. If they were
    not, a second switch's narrowing tell could land between the first's fills and its settle
    — and the first's settle would then widen the page onto a look the row had already left,
    punching the abandoned geometry over the new fills.

    Both are issued without awaiting, which is exactly how `bridge.ts` dispatches them.
  */
  const r = await boot({ lookMixerHoldMs: 0 });
  const before = (await recvLines()).length;
  const first = r.setActiveLook('item-1', 'full');
  const second = r.setActiveLook('item-1', 'stacked');
  expect((await first).ok).toBe(true);
  expect((await second).ok).toBe(true);

  const controls = toldControls((await recvLines()).slice(before));
  expect(controls.map((c) => [c.look, c.from])).toEqual([
    ['full', 'boxes'],
    ['full', undefined],
    ['stacked', 'full'],
    ['stacked', undefined],
  ]);
});

it('a switch to the SAME look narrows nothing — there is no second geometry', async () => {
  // Re-asserting a look is a legitimate repair path (the page may have missed a tell), and it
  // must stay ONE tell: an intersection with itself is the look's own holes, so a window
  // there would be latency for nothing.
  const r = await boot({ lookMixerHoldMs: 0 });
  const before = (await recvLines()).length;
  expect((await r.setActiveLook('item-1', 'boxes')).ok).toBe(true);
  const controls = toldControls((await recvLines()).slice(before));
  expect(controls.every((c) => c.from === undefined)).toBe(true);
});
