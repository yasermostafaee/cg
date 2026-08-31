import * as dgram from 'node:dgram';
import { afterEach, expect, it } from 'vitest';
import { createMock, type MockHandle } from '@cg/amcp-mock';
import type {
  ConnectionConfig,
  SourceAssignments,
  SourceCatalog,
  TemplateInfo,
} from '@cg/shared-ipc';
import type { LiveSourceRect } from '@cg/shared-schema';
import { CasparRuntime } from '../src/caspar-runtime.js';
import { awaitChannelModeRead, HEALTH_MS } from './support/harness.js';

/**
 * 🔴 **`B-174` — THE MIXER HOLD ITSELF: its duration is real, its default derives from the
 * observed video mode, an explicit value wins, and the window it opens is closed at its end.**
 *
 * The ORDER (page told before any fill) is pinned byte-for-byte by live-look-reconcile,
 * look-picker-operator and look-switch-refusal — all three boot with `lookMixerHoldMs: 0`, so
 * they pin the order without sleeping a frame per switch. What THIS file pins is the half a
 * zero-hold suite cannot see: that the switch genuinely WAITS between the two halves, and what
 * happens when the row is taken off air while it waits.
 *
 * ⚠ **NO TEST HERE ASSERTS A WALL-CLOCK CEILING**, and the third test is where that rule cost
 * something. Proving `0` is honoured needs the absence of a 40 ms sleep, and the obvious
 * spelling — `expect(elapsed).toBeLessThan(38)` — is the `B-098` load-flake class arriving by
 * invitation: measured on this host, 1 switch in 200 under load took 50 ms with no product
 * defect. So it is spelled as a DIFFERENCE OF MINIMA between two configurations measured in
 * the same process: a stall has to hit every zero-hold switch to red it, while a `||` that
 * swallowed the 0 collapses the difference to nothing. Lower bounds everywhere else.
 */

const SCENE = { width: 1920, height: 1080 } as const;
const CENTRED = { anchor: 'center', offset: { x: 0, y: 0 } } as const;
const RECTS: Record<string, Record<string, LiveSourceRect>> = {
  left: { 'live-1': { x: 0, y: 0, width: 960, height: 1080 } },
  right: { 'live-1': { x: 960, y: 0, width: 960, height: 1080 } },
};

function template(): TemplateInfo {
  return {
    templateId: 'hold-tpl',
    templateType: 'hold-tpl',
    fields: [],
    liveSources: {
      resolution: SCENE,
      defaultPosition: CENTRED,
      sources: [
        { elementId: 'el-1', sourceId: 'live-1', rect: RECTS['left']?.['live-1'], dynamic: false },
      ],
      arrangements: [],
      looks: [
        { id: 'left', name: 'left', entered: { mode: 'cut' }, rects: RECTS['left'] },
        { id: 'right', name: 'right', entered: { mode: 'cut' }, rects: RECTS['right'] },
      ],
      defaultLookId: 'left',
    },
  } as unknown as TemplateInfo;
}

const CATALOG = {
  layerRange: { start: 30, end: 35 },
  sources: [{ id: 'src-1', name: 'Studio 1', producer: { kind: 'decklink', device: 1 } }],
} as unknown as SourceCatalog;

const ASSIGNMENTS: SourceAssignments = {
  assignments: [{ templateId: 'hold-tpl', plateId: 'live-1', sourceId: 'src-1' }],
};

let mock: MockHandle | null = null;
let runtime: CasparRuntime | null = null;

afterEach(async () => {
  await runtime?.stop();
  runtime = null;
  await mock?.stop();
  mock = null;
});

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

async function boot(
  lookMixerHoldMs?: number,
  opts: { modeUnread?: boolean } = {},
): Promise<CasparRuntime> {
  const oscPort = await freeUdpPort();
  mock = await createMock({ amcpPort: 0, oscPort, oscHost: '127.0.0.1', oscHz: 30 });
  if (opts.modeUnread === true) {
    // Refuse the per-channel `INFO` only. The bare `INFO` is the session handshake's channel
    // list — refusing that would fail the boot instead of leaving the MODE unread, which is
    // the one fact this variant is trying to withhold.
    mock.setHandler('INFO', (req) =>
      req.args.length === 0
        ? { kind: 'ok-multi', code: 200, verb: 'INFO', lines: ['1 1080i5000 PLAYING'] }
        : { kind: 'err', code: 501, verb: 'INFO' },
    );
  }
  const r = new CasparRuntime(
    singleServer(mock.amcpPort, oscPort),
    {},
    {
      sweepMs: 150,
      ...(lookMixerHoldMs !== undefined ? { lookMixerHoldMs } : {}),
      sourceCatalog: CATALOG,
      sourceAssignments: ASSIGNMENTS,
    },
  );
  runtime = r;
  r.start();
  await r.startServing();
  r.templateImport(template(), '<!doctype html><html></html>');
  await r.whenServerHealthy(HEALTH_MS);
  // The DEFAULT hold derives from the OBSERVED mode, so the reading must exist before a
  // switch is timed — otherwise the fallback answers and the derivation goes untested.
  if (opts.modeUnread !== true) await awaitChannelModeRead(r);
  await r.load('item-1', 'hold-tpl', {});
  expect((await r.take('item-1')).accepted).toBe(true);
  return r;
}

async function teardown(): Promise<void> {
  await runtime?.stop();
  runtime = null;
  await mock?.stop();
  mock = null;
}

async function timedSwitch(r: CasparRuntime, to: string): Promise<number> {
  const started = performance.now();
  expect((await r.setActiveLook('item-1', to)).ok).toBe(true);
  return performance.now() - started;
}

/**
 * The FASTEST of `n` switches. A stall inflates one sample; the minimum survives it, which is
 * what lets the zero-hold assertion below compare two configurations without ever naming a
 * ceiling (see the file header).
 */
async function fastestSwitch(r: CasparRuntime, n: number): Promise<number> {
  let best = Number.POSITIVE_INFINITY;
  for (let i = 0; i < n; i++) {
    best = Math.min(best, await timedSwitch(r, i % 2 === 0 ? 'right' : 'left'));
  }
  return best;
}

it('an EXPLICIT hold is honoured: the switch takes at least that long', async () => {
  const r = await boot(250);
  const elapsed = await timedSwitch(r, 'right');
  expect(elapsed, 'the fills must have waited the configured hold').toBeGreaterThanOrEqual(245);
});

it('the DEFAULT hold is one channel frame of the OBSERVED mode (1080i5000 → 40 ms)', async () => {
  // The mock reports `<format>1080i5000</format>` — a 25 Hz tick, 40 ms per channel frame
  // (stage.cpp pulls both fields in one tick; see `videoModeFramePeriodMs`). Readable at
  // all because `B-189` is fixed: until then every real install's mode read failed and the
  // derivation could only ever have exercised its fallback.
  const r = await boot();
  const elapsed = await timedSwitch(r, 'right');
  expect(elapsed, 'one 1080i5000 frame, derived from the reading').toBeGreaterThanOrEqual(38);
});

it('the FALLBACK answers while the mode is unread: 40 ms, not no hold at all', async () => {
  /*
    The branch a server that refuses `INFO <ch>` takes — and the one every install took before
    `B-189`, when the reply was discarded whatever the server said. The failure worth pinning is
    not "40 vs 20": it is a `null` mode resolving to NO HOLD, which would put the skew straight
    back on air with nothing to see. So: mode unread, hold still real.
  */
  const r = await boot(undefined, { modeUnread: true });
  expect(r.channelSettingsState().observed.find((o) => o.channel === 1)?.mode).toBeUndefined();
  const elapsed = await timedSwitch(r, 'right');
  expect(elapsed, 'the 40 ms fallback, with no mode to derive from').toBeGreaterThanOrEqual(38);
});

it('hold 0 is a REAL value: measurably faster than the derived default, in the same process', async () => {
  /*
    `??`-resolved, so an explicit 0 must not fall through to the derived default — the
    falsy-zero trap this repo has paid for three times. The property needs a COMPARISON, not
    a ceiling: both configurations run the same plan, the same `CG UPDATE` and the same
    fills, so everything except the deliberate sleep cancels. A `||` in `#lookMixerHoldMsFor`
    turns 0 into 40 and collapses the difference to ~0; a loaded host inflates both sides and
    has to beat every one of the five zero-hold switches to produce a false red.
  */
  const zero = await boot(0);
  const withoutHold = await fastestSwitch(zero, 5);
  await teardown();

  const derived = await boot();
  const withHold = await fastestSwitch(derived, 5);

  expect(
    withHold - withoutHold,
    `the 1080i5000 frame the default sleeps: ${String(Math.round(withHold))} ms with the hold, ` +
      `${String(Math.round(withoutHold))} ms without`,
  ).toBeGreaterThanOrEqual(25);
});

it('B-174 — a row taken OFF AIR inside the hold abandons the switch: no fill lands', async () => {
  /*
    🔴 **THE WINDOW THE HOLD OPENS, CLOSED AT ITS OWN END.** `#withLiveSeatLock` serialises
    the gated verbs, but `out`/`stopItem`/`clearAll`/`take` are DELIBERATELY un-gated — an
    emergency verb must never queue behind the thing it may be repairing. Before the hold,
    plan→apply was synchronous and nothing could land between them; the hold makes that a
    deterministic window on every on-air switch. Without the re-ask, an `out` landing inside
    it left the apply re-`PLAY`ing the whole union pre-seat onto layers `out` had just
    cleared, and `registerLiveLayers` resurrecting a ledger for a row the stack believes
    idle — pictures on air with no template above them and no take, `B-161`'s shape.

    Deterministic, not timed: the switch is released to run, the CG handler tells us the
    exact moment the page-tell landed (so we are provably inside the sleep), and the hold is
    long enough that `out`'s three round-trips cannot spill past it.
  */
  const r = await boot(600);
  const seated = r.liveLayers().get('item-1') ?? [];
  const layer = seated[0]?.slot.layer ?? -1;
  // The positive control for every "nothing is there" assertion below: it WAS there. The
  // mock spells a cleared layer `'empty'` rather than dropping it, so both halves compare
  // against that word — `toBeFalsy` would pass on a layer holding a live producer named ''.
  expect(layer, 'the row must be seated before the out means anything').toBeGreaterThan(0);
  expect(mock?.layerState({ channel: 1, layer })?.producer).not.toBe('empty');

  let sawTell!: () => void;
  const told = new Promise<void>((resolve) => {
    sawTell = resolve;
  });
  // Installed after the take, so its `CG ADD`/`PLAY` went through the default handler. This
  // one answers everything 202 (including the rollback's revert tell) and reports the moment
  // the page was told.
  mock?.setHandler('CG', (req) => {
    if ((req.args[1] ?? '').toUpperCase() === 'UPDATE') sawTell();
    return { kind: 'ok', code: 202, verb: 'CG' };
  });

  const switching = r.setActiveLook('item-1', 'right');
  await told;
  expect((await r.out('item-1')).accepted, 'the un-gated OUT must not queue behind the hold').toBe(
    true,
  );

  const outcome = await switching;
  expect(outcome.ok, 'the switch cannot succeed onto a row that left the air').toBe(false);
  expect(outcome.reason).toBe('not-live');
  // What the abort is FOR: the out's teardown stands. Nothing re-seated the layer, and no
  // ledger record came back to claim it.
  expect(r.liveLayers().get('item-1'), 'the ledger must stay torn down').toBeUndefined();
  expect(
    mock?.layerState({ channel: 1, layer })?.producer,
    'the apply must not have re-seated the layer the OUT cleared',
  ).toBe('empty');
  // The page was told the new look and put back on the old one, so the record follows it.
  expect(r.activeLookId('item-1')).toBe('left');
});
