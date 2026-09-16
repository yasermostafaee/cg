import * as dgram from 'node:dgram';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createMock, type MockHandle } from '@cg/amcp-mock';
import type { ConnectionConfig, TemplateInfo } from '@cg/shared-ipc';
import { readCgControl, TEMPLATE_TIMING_VERSION } from '@cg/shared-schema';
import { CasparRuntime } from '../src/caspar-runtime.js';
import { awaitChannelModeRead, HEALTH_MS, TEST_LAYER_POLICY } from './support/harness.js';

/**
 * 🔴 **`TIMING-WIRE-22` (c) / (d) / (e) — THE PASS TIMING ON THE WIRE.**
 *
 * Every assertion here is on the AMCP TRACE, for this suite's standing reason: every internal
 * structure can be correct while nothing reaches CasparCG. A map that holds the operator's count
 * and never sends it is exactly the failure this feature exists to prevent.
 *
 * ── 🔴 WHAT THESE CANNOT PROVE, SAID UP FRONT ────────────────────────────────
 *
 * **That the PAGE obeys the payload.** The pass loop runs in the template's own JS inside
 * CasparCG's CEF. What is proven here is that the correct `CG UPDATE` is composed and sent, and
 * `packages/template-runtime/tests/update-carries-pass-timing.test.ts` proves a real runtime
 * given that payload changes its loop without restarting. The JOIN of the two — this byte
 * sequence reaching that page through a real CEF — is a PLANT measurement and nothing else.
 *
 * ── §3's TWO HALVES, AND WHY THE SECOND IS THE POINT ─────────────────────────
 *
 * The schema already proves a retained value SURVIVES a restart. What is asserted below is that
 * the template NOW RUNNING obeys it: an ADOPTED row's producer never rebuilt, so its page is
 * still looping on the count it snapshotted at `play()`. A restore that only repopulated the map
 * would leave the row publishing "2 passes" over a picture that loops forever — stored value and
 * live behaviour disagreeing, which is the worst outcome available to this feature.
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

/**
 * A plain template with no live sources — the timing road is orthogonal to plates.
 *
 * 🔴 `PASSES-CYCLE-ONLY-26` — **it now DECLARES `loop-cycle`, and that is not decoration.**
 * Pass timing reaches the wire only for a template whose stated mode is `loop-cycle`
 * (`templateAdmitsPassTiming`), so a fixture with no `playout` at all would exercise the
 * REFUSAL while claiming to exercise the road. Every case below is about a template that
 * genuinely loops; the fixture now says so.
 */
function template(): TemplateInfo {
  return {
    templateId: 'looper',
    templateType: 'looper',
    fields: [],
    playout: { v: TEMPLATE_TIMING_VERSION, mode: 'loop-cycle', holdSource: 'timed', loops: true },
  } satisfies TemplateInfo;
}

/**
 * The plant's news ticker: `auto-out` / `content-driven`, whose only `loop-cycle` scope is a
 * nested blinking dot — so `loops` is true and the graphic itself does not repeat.
 */
function tickerTemplate(): TemplateInfo {
  return {
    templateId: 'ticker',
    templateType: 'ticker',
    fields: [],
    playout: {
      v: TEMPLATE_TIMING_VERSION,
      mode: 'auto-out',
      holdSource: 'content-driven',
      loops: true,
      repeat: 'infinite',
    },
  } satisfies TemplateInfo;
}

async function boot(): Promise<CasparRuntime> {
  const oscPort = await freeUdpPort();
  tracePath = path.join(
    os.tmpdir(),
    `cg-timingwire-${String(process.pid)}-${String(Date.now())}-${String(
      Math.round(performance.now() * 1000),
    )}.ndjson`,
  );
  mock = await createMock({ amcpPort: 0, oscPort, oscHost: '127.0.0.1', oscHz: 30, tracePath });
  const r = new CasparRuntime(singleServer(mock.amcpPort, oscPort), {}, {
    layerPolicy: TEST_LAYER_POLICY,
    sweepMs: 150,
  } as never);
  runtime = r;
  r.start();
  await r.startServing();
  r.templateImport(template(), '<!doctype html><html></html>');
  r.templateImport(tickerTemplate(), '<!doctype html><html></html>');
  await r.whenServerHealthy(HEALTH_MS);
  // A negative observation is only valid from a proven-quiescent wire (flake family 3).
  await awaitChannelModeRead(r);
  return r;
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

const since = async (before: number): Promise<string[]> => (await recvLines()).slice(before);

/** The `__cg` control object of the LAST `CG … UPDATE` in a trace slice, or undefined. */
function lastControl(lines: readonly string[]): Record<string, unknown> | undefined {
  const update = [...lines].reverse().find((l) => /CG \d+-\d+ UPDATE /.test(l));
  if (update === undefined) return undefined;
  const quoted = /UPDATE \d+ "(.*)"\s*$/.exec(update.trim());
  if (quoted === null) return undefined;
  const json = quoted[1]!.replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  try {
    return readCgControl(JSON.parse(json) as unknown) as unknown as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

async function onAir(r: CasparRuntime, itemId = 'item-1'): Promise<void> {
  await r.load(itemId, 'looper', {});
  expect((await r.take(itemId)).accepted).toBe(true);
}

/** The `__cg` control object of the LAST `CG … ADD` in a trace slice, or undefined. */
function lastAddControl(lines: readonly string[]): Record<string, unknown> | undefined {
  const add = [...lines].reverse().find((l) => /CG \d+-\d+ ADD /.test(l));
  if (add === undefined) return undefined;
  const quoted = /"((?:[^"\\]|\\.)*)"\s*$/.exec(add.trim());
  if (quoted?.[1] === undefined) return undefined;
  const json = quoted[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  try {
    return readCgControl(JSON.parse(json) as unknown) as unknown as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

describe('🔴 PASSES-CYCLE-ONLY-26 — no hidden state reaches air', () => {
  /*
    ── THE RULE, AT THE WIRE ─────────────────────────────────────────────────────────────────

    The console now shows the pass controls only under mode `loop-cycle`. That alone does not
    make the rule true of AIR: a count set while the controls WERE visible is still recorded in
    `#passTimings`, and `#sendAdd` attaches whatever is there to every take. So the plant's
    ticker would go on receiving a count for its blinking dot — invisibly, with no surface left
    to explain it.

    ⚠ **Recording is NOT touched — "no silent migration of stored data".** The value stays in
    the record; what changes is that it no longer reaches the page. The distinction matters: if
    the template is ever re-authored as a `loop-cycle` graphic, the operator's number is still
    theirs.
  */
  it('a stored count on the TICKER row sends no __cg.timing on a take', async () => {
    const r = await boot();
    await r.load('tick-1', 'ticker', {});
    expect((await r.take('tick-1')).accepted).toBe(true);
    // Recorded — exactly as a count set while the controls were visible would be.
    expect((await r.setPassTiming('tick-1', { passes: 2 })).ok).toBe(true);

    // A fresh build: out, then take again, so the take re-ADDs and composes a payload.
    expect((await r.out('tick-1')).accepted).toBe(true);
    const before = (await recvLines()).length;
    expect((await r.take('tick-1')).accepted).toBe(true);

    const control = lastAddControl(await since(before));
    expect(control, 'no ADD was sent — nothing below is measured').toBeDefined();
    expect(
      control?.['timing'],
      "the ticker's ADD carried a count for its blinking dot",
    ).toBeUndefined();
    // The token still rides — this gate is about timing only.
    expect(control?.['take'], 'the gate took the take token with it').toBeDefined();
  });

  it('a stored count on the TICKER row sends no CG UPDATE carrying timing', async () => {
    const r = await boot();
    await r.load('tick-1', 'ticker', {});
    expect((await r.take('tick-1')).accepted).toBe(true);
    const before = (await recvLines()).length;

    const res = await r.setPassTiming('tick-1', { passes: 2 });

    // It is RECORDED and not refused — the verb keeps its contract and its audit row.
    expect(res.ok, 'the set was refused rather than simply not sent').toBe(true);
    const control = lastControl(await since(before));
    expect(control?.['timing'], 'the count crossed to the ticker page').toBeUndefined();
  });

  it('the LOOPER row is unaffected — its count still reaches the page', async () => {
    // The positive control. Without it "no timing on the wire" is satisfied by a gate that
    // blocks everything, and the two cases above would pass over a dead feature.
    const r = await boot();
    await onAir(r);
    const before = (await recvLines()).length;

    expect((await r.setPassTiming('item-1', { passes: 2 })).ok).toBe(true);

    expect(lastControl(await since(before))?.['timing']).toEqual({ passes: 2 });
  });
});

it('(c) an on-air set sends a CG UPDATE carrying the count, and records it', async () => {
  const r = await boot();
  await onAir(r);
  const before = (await recvLines()).length;

  const res = await r.setPassTiming('item-1', { passes: 2 });

  expect(res.ok).toBe(true);
  const control = lastControl(await since(before));
  expect(control?.['timing'], 'nothing carrying the count reached the wire').toEqual({ passes: 2 });
  // And it is READ BACK, so the console can show what air is doing (piece (e)).
  const published = r.stackSnapshot().find((i) => i.itemId === 'item-1');
  expect(published?.timingOverride).toEqual({ repeat: 2 });
});

it('(c) a CONFIGURATION verb sends no PLAY and no MIXER — it is not a take', async () => {
  // Golden rule 10: setting a count puts a value in force; only a take puts content on air.
  const r = await boot();
  await onAir(r);
  const before = (await recvLines()).length;

  await r.setPassTiming('item-1', { passes: 3, delayMs: 1500 });

  const slice = await since(before);
  expect(
    slice.filter((l) => /\bPLAY\b/.test(l)),
    'a configuration verb sent a PLAY',
  ).toEqual([]);
  expect(
    slice.filter((l) => /MIXER/.test(l)),
    'a configuration verb touched the mixer',
  ).toEqual([]);
});

it('(c) an OFF-AIR row records the intent and sends nothing', async () => {
  const r = await boot();
  await r.load('item-1', 'looper', {});
  const before = (await recvLines()).length;

  const res = await r.setPassTiming('item-1', { passes: 4 });

  expect(res.ok).toBe(true);
  expect(
    (await since(before)).filter((l) => /CG \d+-\d+ UPDATE /.test(l)),
    'a row that owns no live seats reached the wire',
  ).toEqual([]);
  expect(r.stackSnapshot().find((i) => i.itemId === 'item-1')?.timingOverride).toEqual({
    repeat: 4,
  });
});

it('(c) ZERO is an instruction and crosses as one', async () => {
  const r = await boot();
  await onAir(r);
  const before = (await recvLines()).length;

  await r.setPassTiming('item-1', { passes: 0 });

  expect(lastControl(await since(before))?.['timing']).toEqual({ passes: 0 });
});

it('(c) an unknown item is refused with an EXISTING reason, and records nothing', async () => {
  const r = await boot();
  const res = await r.setPassTiming('nope', { passes: 2 });
  expect(res.ok).toBe(false);
  expect(res.reason, 'no new refusal condition may be invented').toBe('unknown-item');
});

it('🔴 (d) a restore RE-APPLIES the value — both halves, and the second is the point', async () => {
  /*
    §3, stated exactly: this is NOT "the value survives a restart" — the schema already proves
    that. It is that the value is re-applied to the template NOW RUNNING.

    The two halves are asserted separately because they fail separately:

      HALF 1 — the intent comes back. A restore that dropped it would leave the console showing
      the template's authored count for a row the operator had changed.

      HALF 2 — the row PUBLISHES it, which is what every surface reads. A restore that
      repopulated the bridge's map without publishing would leave the console showing one number
      while the bridge held another; that disagreement between stored value and live behaviour
      is the worst outcome available to this feature.
  */
  const r = await boot();

  await r.restore([
    {
      itemId: 'item-1',
      templateId: 'looper',
      fields: {},
      state: 'on-air',
      slot: { channel: 1, layer: 110, server: 'primary' },
      timingOverride: { repeat: 2, delayMs: 1500 },
    },
  ]);

  const published = r.stackSnapshot().find((i) => i.itemId === 'item-1');
  expect(published, 'the row did not come back at all').toBeDefined();
  expect(
    published?.timingOverride,
    'the restored row lost the operator’s count — stored and live now disagree',
  ).toEqual({ repeat: 2, delayMs: 1500 });
});

it('(d) a restore with NO override recorded comes back inheriting, not zeroed', async () => {
  // ABSENT means inheriting, which is a third state. A restore that supplied a default here
  // would silently author a count on every row that predates the field.
  const r = await boot();

  await r.restore([
    {
      itemId: 'item-1',
      templateId: 'looper',
      fields: {},
      state: 'on-air',
      slot: { channel: 1, layer: 110, server: 'primary' },
    },
  ]);

  expect(r.stackSnapshot().find((i) => i.itemId === 'item-1')?.timingOverride).toBeUndefined();
});

it('(d) a FRESH BUILD carries the recorded count into its ADD payload', async () => {
  /*
    The re-ADD half of the restore, reached by the ordinary route rather than by staging a
    reconnect: `#sendAdd` is the ONE chokepoint every build goes through, so proving its payload
    carries the timing proves it for the take, the re-take and the restore's re-ADD alike.

    ⚠ `out` first, deliberately. The pre-roll `CG ADD` happens at LOAD, so a take on an
    already-loaded row sends none — an earlier spelling of this case baselined after the load and
    asserted on an ADD that had already gone, which would have failed for a reason that says
    nothing about the payload. `out` destroys the producer, so the next take must build again.
  */
  const r = await boot();
  await onAir(r);
  await r.setPassTiming('item-1', { passes: 3, delayMs: 800 });
  expect((await r.out('item-1')).accepted).toBe(true);
  const before = (await recvLines()).length;

  await r.load('item-1', 'looper', {});

  const add = (await since(before)).find((l) => /CG \d+-\d+ ADD /.test(l));
  expect(add, 'the fresh build sent no ADD to carry it').toBeDefined();
  expect(add, 'the count did not ride the build').toContain('passes');
  expect(add, 'the gap did not ride the build').toContain('delayMs');
});
