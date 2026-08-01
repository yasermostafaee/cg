import * as dgram from 'node:dgram';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { createMock, type MockHandle } from '@cg/amcp-mock';
import { FixedLayersClearLayerChannel, type ConnectionConfig } from '@cg/shared-ipc';
import { createBridge, type BridgeHandle } from '../src/bridge.js';
import { HEALTH_MS } from './support/harness.js';

/**
 * THE BANK-SCOPED CLEAR AND ITS GUARD.
 *
 * The command asserts something strong — *"I may clear this layer without knowing what
 * is on it"* — and the two-part structural guard is the only thing between that and
 * clearing the company's playout output. So these tests attack the GUARD, not the happy
 * path: every way a layer outside the bank, or inside the reservation, might reach it.
 *
 * The two facts that license a clear, both required, both CONFIG-derived so that no UI
 * state, no stale bookkeeping and no silent OSC port can bypass them:
 *
 *   1. the layer is inside the DECLARED bank, and
 *   2. the layer is NOT inside the reserved playout range.
 *
 * The requirement being proved, and the reason the feature exists: an `unknown`
 * occupancy must NOT block the clear. That is asserted directly — it is the whole point,
 * because occupancy is exactly what may be wrong when an operator reaches for this.
 */

let mock: MockHandle | null = null;
let bridge: BridgeHandle | null = null;
let tracePath: string | null = null;

/** Bank 70–79 on channel 1; reservation 50–59. Deliberately DISJOINT and NOT adjacent,
 *  so "one below the floor" (69) is neither reserved nor in the bank — it isolates the
 *  membership half of the guard from the reservation half. */
const BANK_START = 70;
const BANK_COUNT = 10;
const RESERVED = { ranges: [{ from: 50, to: 59 }] };

afterEach(async () => {
  await bridge?.close();
  bridge = null;
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

/** The mock's NDJSON wire trace: recv'd AMCP lines, in arrival order. */
async function recvLines(m: MockHandle, file: string): Promise<string[]> {
  await m.traceFlush();
  if (!fs.existsSync(file)) return [];
  return fs
    .readFileSync(file, 'utf-8')
    .split('\n')
    .filter((l) => l.length > 0)
    .map((l) => JSON.parse(l) as { dir: string; line: string })
    .filter((e) => e.dir === 'recv')
    .map((e) => e.line);
}

/** Boot a bridge with the bank + reservation above. `visibility` models ticked rows. */
async function boot(
  over: { visibility?: Record<string, boolean>; noBank?: boolean } = {},
): Promise<BridgeHandle> {
  const oscPort = await freeUdpPort();
  tracePath = path.join(
    fs.mkdtempSync(path.join(os.tmpdir(), 'cg-clear-bank-')),
    'amcp-trace.ndjson',
  );
  mock = await createMock({ amcpPort: 0, oscPort, oscHost: '127.0.0.1', oscHz: 30, tracePath });
  bridge = await createBridge({
    port: 0,
    connection: singleServer(mock.amcpPort, oscPort),
    reservedLayers: RESERVED,
    ...(over.noBank === true
      ? {}
      : {
          fixedLayers: {
            channel: 1,
            start: BANK_START,
            count: BANK_COUNT,
            ...(over.visibility !== undefined ? { visibility: over.visibility } : {}),
          },
        }),
    runtimeTuning: { sweepMs: 150, occupancyStaleMs: 800 },
  });
  await bridge.runtime.whenServerHealthy(HEALTH_MS);
  return bridge;
}

it('clears an IN-BANK layer and actually sends the CLEAR', async () => {
  const b = await boot();
  if (mock === null || tracePath === null) throw new Error('mock not booted');

  expect(await b.runtime.clearBankLayer(1, 75)).toEqual({ ok: true });
  const lines = await recvLines(mock, tracePath);
  expect(lines.some((l) => l.startsWith('CLEAR 1-75'))).toBe(true);
});

it('THE REQUIREMENT — an UNKNOWN occupancy does NOT block the clear', async () => {
  const b = await boot();
  if (mock === null || tracePath === null) throw new Error('mock not booted');

  // Layer 77 has never had a producer on it, so the occupancy tap has no observation
  // of it at all — the `unknown` case, and precisely the case `layers.clear` refuses
  // (`foreign`: no fresh html observation) and `stack.out` cannot address (no item).
  // This path must clear it anyway: the guard is structural, and what we believe is on
  // the layer is exactly what may be wrong.
  expect(await b.runtime.clearBankLayer(1, 77)).toEqual({ ok: true });
  const lines = await recvLines(mock, tracePath);
  expect(lines.some((l) => l.startsWith('CLEAR 1-77'))).toBe(true);
});

it('refuses a layer ONE BELOW the bank floor and ONE ABOVE its ceiling — and sends nothing', async () => {
  const b = await boot();
  if (mock === null || tracePath === null) throw new Error('mock not booted');

  const below = await b.runtime.clearBankLayer(1, BANK_START - 1); // 69
  const above = await b.runtime.clearBankLayer(1, BANK_START + BANK_COUNT); // 80
  expect(below.ok).toBe(false);
  expect(below.reason).toBe('not-in-bank');
  expect(above.ok).toBe(false);
  expect(above.reason).toBe('not-in-bank');

  // A refusal must be silent on the wire: a "refused" that still sent the command
  // would be the worst of both worlds.
  const lines = await recvLines(mock, tracePath);
  expect(lines.some((l) => l.startsWith('CLEAR 1-69'))).toBe(false);
  expect(lines.some((l) => l.startsWith('CLEAR 1-80'))).toBe(false);
});

it('refuses the SAME layer number on a DIFFERENT channel — membership is channel-aware', async () => {
  const b = await boot();
  if (mock === null || tracePath === null) throw new Error('mock not booted');

  // 75 is in the bank on channel 1. The bank declares ONE channel, so 2-75 is not a
  // bank layer at all — and on a multi-channel server it could be anybody's output.
  const res = await b.runtime.clearBankLayer(2, 75);
  expect(res.ok).toBe(false);
  expect(res.reason).toBe('not-in-bank');
  const lines = await recvLines(mock, tracePath);
  expect(lines.some((l) => l.startsWith('CLEAR 2-75'))).toBe(false);
});

it('refuses a RESERVED layer, and reports `reserved` rather than `not-in-bank` — the guard order', async () => {
  const b = await boot();
  if (mock === null || tracePath === null) throw new Error('mock not booted');

  // 55 is reserved AND outside the bank, so BOTH halves of the guard would refuse it.
  // The reason proves which one ran FIRST. That ordering is the property that keeps a
  // reserved layer refused even if a bank were ever to overlap the reservation: the
  // reservation wins rather than being shadowed by a membership that happens to hold.
  const res = await b.runtime.clearBankLayer(1, 55);
  expect(res.ok).toBe(false);
  expect(res.reason).toBe('reserved');
  expect(res.message).toContain('reserved playout range');

  const lines = await recvLines(mock, tracePath);
  expect(lines.some((l) => l.startsWith('CLEAR 1-55'))).toBe(false);
});

it('an UNTICKED in-bank layer is STILL clearable — a tick is a display concern, not membership', async () => {
  // The owner's explicit constraint: "the declared bank, not the rows currently shown".
  // Computing membership from visible rows would mean unticking a row silently removed
  // it from the guard's world — and a hidden layer is one an operator especially needs
  // to be able to clear, because he cannot see what it is doing.
  const b = await boot({ visibility: { '73': false } });
  if (mock === null || tracePath === null) throw new Error('mock not booted');

  expect(await b.runtime.clearBankLayer(1, 73)).toEqual({ ok: true });
  const lines = await recvLines(mock, tracePath);
  expect(lines.some((l) => l.startsWith('CLEAR 1-73'))).toBe(true);
});

it('with NO bank declared, every layer is refused — there is no bank to be in', async () => {
  const b = await boot({ noBank: true });
  if (mock === null || tracePath === null) throw new Error('mock not booted');

  for (const layer of [1, 55, 70, 75, 80]) {
    const res = await b.runtime.clearBankLayer(1, layer);
    expect(res.ok, `layer ${String(layer)}`).toBe(false);
    expect(res.reason, `layer ${String(layer)}`).toBe(
      layer >= 50 && layer <= 59 ? 'reserved' : 'not-in-bank',
    );
  }
  const lines = await recvLines(mock, tracePath);
  expect(lines.some((l) => /^CLEAR 1-\d+/.test(l))).toBe(false);
});

it('a COERCED coordinate cannot slip past the reservation — the guard validates its own inputs', async () => {
  const b = await boot();
  if (mock === null || tracePath === null) throw new Error('mock not booted');

  // THE ATTACK. The two halves of the guard mis-answer on a non-number in OPPOSITE
  // directions, which is what makes this worth a test rather than a comment:
  //
  //   - `#reservedSet` is a `Set<number>`, so `.has('55')` is FALSE — a string layer is
  //     invisible to the reservation;
  //   - `isFixed` keys on `` `${String(channel)}:${String(layer)}` ``, so a string pair
  //     produces the SAME key as the real slot and MATCHES.
  //
  // Uncaught, a string-typed coordinate would therefore read as in-bank while the
  // reservation never saw it. Both are refused up front instead.
  const coerced: [unknown, unknown][] = [
    ['1', '55'], // reserved, as strings — the dangerous one
    ['1', '75'], // a real bank layer, as strings
    [1, '75'],
    [1, 75.5],
    [1, Number.NaN],
    [Number.POSITIVE_INFINITY, 75],
  ];
  for (const [ch, layer] of coerced) {
    const res = await b.runtime.clearBankLayer(ch as number, layer as number);
    expect(res.ok, `${String(ch)}-${String(layer)}`).toBe(false);
    expect(res.reason, `${String(ch)}-${String(layer)}`).toBe('not-in-bank');
  }

  // Nothing reached CasparCG for any of them — in particular no `CLEAR 1-55`.
  const lines = await recvLines(mock, tracePath);
  expect(lines.some((l) => l.startsWith('CLEAR 1-55'))).toBe(false);
  expect(lines.some((l) => /^CLEAR 1-75/.test(l))).toBe(false);
});

it('the WIRE boundary also rejects a malformed coordinate, so the handler only sees integers', async () => {
  // The guard defends itself (above), and the schema is the OUTER layer — keep both.
  // This pins the outer one so a future `z.coerce.number()` "convenience" cannot
  // silently start feeding strings through to a guard that would then be relying
  // entirely on its own check.
  const req = FixedLayersClearLayerChannel.request;
  expect(req.safeParse({ channel: 1, layer: 70 }).success).toBe(true);
  for (const payload of [
    { channel: '1', layer: '70' },
    { channel: '1', layer: '55' },
    { channel: 1, layer: 70.5 },
    { channel: 1, layer: -1 },
    { channel: 0, layer: 70 },
    { channel: 1 },
    { channel: 1, layer: null },
  ]) {
    expect(req.safeParse(payload).success, JSON.stringify(payload)).toBe(false);
  }
});

it('a bank OVERLAPPING the reservation cannot boot at all — the two sets can never intersect', async () => {
  // This is why the "reserved layer numerically inside the bank" case cannot be
  // constructed against a RUNNING bridge, and it is asserted here so the clear path's
  // reasoning is anchored to a fact rather than to an assumption about another module.
  // The guard still re-checks the reservation itself, first: defence in depth, because
  // this refusal living in another file is exactly the kind of thing a refactor moves.
  const oscPort = await freeUdpPort();
  mock = await createMock({ amcpPort: 0, oscPort, oscHost: '127.0.0.1', oscHz: 30 });
  await expect(
    createBridge({
      port: 0,
      connection: singleServer(mock.amcpPort, oscPort),
      // A reservation that straddles the bank's own range, rather than a bank moved
      // onto the reservation: 55–64 would have tripped the DYNAMIC-POLICY overlap
      // first and proved a different refusal. This isolates `overlaps-reserved`.
      reservedLayers: { ranges: [{ from: 75, to: 84 }] },
      fixedLayers: { channel: 1, start: BANK_START, count: BANK_COUNT },
      runtimeTuning: { sweepMs: 150, occupancyStaleMs: 800 },
    }),
  ).rejects.toThrow(/reserved/i);
});
