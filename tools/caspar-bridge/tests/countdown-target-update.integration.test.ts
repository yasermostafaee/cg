import * as dgram from 'node:dgram';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMock, type MockHandle } from '@cg/amcp-mock';
import type { ConnectionConfig, TemplateInfo } from '@cg/shared-ipc';
import { isOnAirStatus } from '@cg/shared-schema';
import { CasparRuntime } from '../src/caspar-runtime.js';
import { awaitChannelModeRead, HEALTH_MS, TEST_LAYER_POLICY } from './support/harness.js';
import { recvLines as readWireLines } from './support/wire-trace.js';

/**
 * 🔴 `DELTA-RUN-NEXT-VERSION-01-C` §2 — **CHANGING A COUNTDOWN'S TARGET IS THE ROW'S VALUE UPDATE AND
 * NOTHING ELSE** (golden rule 10: a configuration verb is never a playout verb).
 *
 * The operator sets a row's countdown target in CG Control (the date and time control stages the
 * field's ISO value); Update sends it through the row's ordinary `stack.update`. Asserted on what
 * reaches the wire — the AMCP mock's trace — never on what a UI shows. Three states, each pinned
 * to its exact lines:
 *
 * 1. **ON AIR** — EXACTLY ONE line, the existing value update carrying the new instant:
 *
 *        CG 1-<layer> UPDATE 0 "{\"targetTime\":\"2026-10-15T21:50:00+03:30\"}"
 *
 *    and no `PLAY`, no `MIXER`, no `CG … ADD`, no `CLEAR`, no `STOP`. The page re-aims its countdown
 *    from the value (`@cg/template-runtime`'s `clock-target` route); there is no re-take.
 *
 * 2. **LOADED, NEVER TAKEN** — a Load pre-rolls the page (`B-039`: `CG ADD … 0 …`, loaded and NOT
 *    playing), so the row holds a resident producer that nobody sees. The change sends that same ONE
 *    `CG UPDATE` line to it and nothing else — no `PLAY`, no `MIXER`, no `ADD`, no `CLEAR`. ⚠ It must:
 *    the next take of a resident producer is a bare `CG 1-<layer> PLAY 0` with no fields, so a
 *    target left unsent here would go to air stale (`B-070`'s rule: `CG UPDATE` needs a producer,
 *    not air). Nothing becomes visible.
 *
 * 3. **OFF AIR WITH NO PRODUCER** (taken, then OUT — the `CLEAR` destroyed the page) — the change
 *    sends NOTHING: the value lands in the bridge's state, and the next take re-ADDs the page with
 *    it in the `CG ADD` payload (`CG 1-<layer> ADD 0 "<page address>" 0 "{…21:50:00+03:30…}"`).
 *
 * Case 1 is also this file's POSITIVE CONTROL: it proves the trace reader is live, so case 3's
 * "nothing" is a measurement and not a blind instrument.
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

function singleServer(amcpPort: number, oscPort: number): ConnectionConfig {
  return {
    servers: { A: { host: '127.0.0.1', amcpPort, oscPort } },
    strategy: 'mirror-sync',
    autoFailoverEnabled: true,
  };
}

/** The first target, and the one the operator changes it to — ISO with an explicit offset. */
const BEFORE = '2026-10-15T21:45:00+03:30';
const AFTER = '2026-10-15T21:50:00+03:30';

/** A countdown template whose one field sets its target (as `countdownTargetFieldsOf` marks it). */
const TEMPLATE: TemplateInfo = {
  templateId: 'countdown',
  templateType: 'custom',
  fields: [
    {
      id: 'targetTime',
      label: 'Target time',
      type: 'text',
      required: false,
      default: BEFORE,
      countdown: { target: 'datetime', afterZero: 'hold' },
    },
  ],
};

/** The one line a target change sends to a producer, spelled out. */
const updateLine = (layer: number): string =>
  `CG 1-${String(layer)} UPDATE 0 "{\\"targetTime\\":\\"2026-10-15T21:50:00+03:30\\"}"`;

async function boot(): Promise<CasparRuntime> {
  const oscPort = await freeUdpPort();
  tracePath = path.join(
    os.tmpdir(),
    `cg-countdown-target-${String(process.pid)}-${String(Date.now())}-${String(Math.round(performance.now() * 1000))}.ndjson`,
  );
  mock = await createMock({ amcpPort: 0, oscPort, oscHost: '127.0.0.1', oscHz: 30, tracePath });
  const r = new CasparRuntime(
    singleServer(mock.amcpPort, oscPort),
    {},
    { layerPolicy: TEST_LAYER_POLICY, sweepMs: 150 },
  );
  r.start();
  await r.startServing();
  r.templateImport(TEMPLATE, '<!doctype html><html></html>');
  await r.whenServerHealthy(HEALTH_MS);
  // A "nothing reached the wire" claim is valid only from a PROVEN-QUIESCENT wire.
  await awaitChannelModeRead(r);
  runtime = r;
  return r;
}

async function lines(): Promise<string[]> {
  if (mock === null || tracePath === null) throw new Error('no trace');
  await mock.traceFlush();
  return readWireLines(tracePath);
}

const item = (r: CasparRuntime, itemId = 'item-1') =>
  r.stackSnapshot().find((i) => i.itemId === itemId);

function layerOf(r: CasparRuntime, itemId = 'item-1'): number {
  const slot = item(r, itemId)?.slot;
  if (slot === undefined) throw new Error(`${itemId} has no slot`);
  expect(slot.channel, 'the test channel').toBe(1);
  return slot.layer;
}

async function onAir(r: CasparRuntime, want: boolean): Promise<void> {
  await vi.waitFor(
    () => {
      const it = item(r);
      if (it === undefined) throw new Error('item-1 left the stack');
      if (isOnAirStatus(it) !== want) throw new Error(`item-1 still reads ${it.status}`);
    },
    { timeout: 5_000, interval: 25 },
  );
}

/** Is the row on air right now, by the one predicate (`isOnAirStatus`)? */
function airNow(r: CasparRuntime): boolean {
  const it = item(r);
  if (it === undefined) throw new Error('item-1 left the stack');
  return isOnAirStatus(it);
}

/** Every command that can put, move or take a picture on air, or replace the page. */
const AIR_VERBS =
  /^(PLAY |LOADBG |LOAD |MIXER |CLEAR |STOP |CG \S+ (ADD|PLAY|STOP|NEXT|REMOVE|CLEAR)\b)/;

describe('DELTA-RUN-NEXT-VERSION-01-C — a countdown target change is the row’s value update', () => {
  it('🔴 ON AIR: exactly one `CG 1-<layer> UPDATE 0 "{\\"targetTime\\":\\"<new ISO>\\"}"` — no PLAY, MIXER, ADD, CLEAR or STOP', async () => {
    const r = await boot();
    await r.load('item-1', 'countdown', { targetTime: BEFORE });
    expect((await r.take('item-1')).accepted).toBe(true);
    await onAir(r, true);
    const layer = layerOf(r);

    const before = (await lines()).length;
    const res = await r.update('item-1', { targetTime: AFTER }, 'merge');
    expect(res.accepted, 'the value update is accepted').toBe(true);
    const sent = (await lines()).slice(before);

    expect(sent.filter((l) => l.startsWith(`CG 1-${String(layer)} `))).toEqual([updateLine(layer)]);
    expect(sent.filter((l) => AIR_VERBS.test(l))).toEqual([]);
    expect(item(r)?.fields).toMatchObject({ targetTime: AFTER });
    expect(airNow(r), 'still on air — no re-take').toBe(true);
  });

  it('🔴 LOADED, never taken: the one `CG UPDATE` reaches the pre-rolled page, nothing plays — and the take is a bare `CG PLAY 0`', async () => {
    const r = await boot();
    const beforeLoad = (await lines()).length;
    await r.load('item-1', 'countdown', { targetTime: BEFORE });
    const layer = layerOf(r);
    // The pre-roll that makes this row hold a page: ONE `CG ADD` with play-on-load `0` — loaded,
    // NOT playing — carrying the first target. (The page's address names this bridge's own port.)
    const adds = (await lines())
      .slice(beforeLoad)
      .filter((l) => l.startsWith(`CG 1-${String(layer)} ADD`));
    expect(adds).toHaveLength(1);
    expect(adds[0]).toMatch(new RegExp(`^CG 1-${String(layer)} ADD 0 "[^"]+" 0 "`));
    expect(adds[0]).toContain('2026-10-15T21:45:00+03:30');
    expect(airNow(r), 'a loaded row is not on air').toBe(false);

    const before = (await lines()).length;
    expect((await r.update('item-1', { targetTime: AFTER }, 'merge')).accepted).toBe(true);
    const sent = (await lines()).slice(before);
    expect(sent.filter((l) => l.includes(`1-${String(layer)}`))).toEqual([updateLine(layer)]);
    expect(sent.filter((l) => AIR_VERBS.test(l))).toEqual([]);
    expect(airNow(r), 'still not on air').toBe(false);

    // WHY it had to be sent: the take of a resident page carries no fields — no ADD, a bare PLAY.
    const beforeTake = (await lines()).length;
    expect((await r.take('item-1')).accepted).toBe(true);
    const took = (await lines()).slice(beforeTake);
    expect(took.filter((l) => l.startsWith(`CG 1-${String(layer)} ADD`))).toEqual([]);
    expect(took).toContain(`CG 1-${String(layer)} PLAY 0`);
  });

  it('🔴 OFF AIR with no page (taken, then OUT): the change sends NOTHING; the next take re-ADDs with it', async () => {
    const r = await boot();
    await r.load('item-1', 'countdown', { targetTime: BEFORE });
    expect((await r.take('item-1')).accepted).toBe(true);
    await onAir(r, true);
    const layer = layerOf(r);
    // OUT clears the layer: the page is destroyed and the row holds no producer.
    expect((await r.out('item-1')).accepted).toBe(true);
    await onAir(r, false);

    const before = (await lines()).length;
    expect((await r.update('item-1', { targetTime: AFTER }, 'merge')).accepted).toBe(true);
    const sent = (await lines()).slice(before);
    expect(sent.filter((l) => l.includes(`1-${String(layer)}`))).toEqual([]);
    expect(sent.filter((l) => AIR_VERBS.test(l) || l.startsWith('CG '))).toEqual([]);
    expect(item(r)?.fields, 'the value is in force for the next take').toMatchObject({
      targetTime: AFTER,
    });

    // The edit is not lost: the take re-ADDs the page with the new target in its payload.
    const beforeTake = (await lines()).length;
    expect((await r.take('item-1')).accepted).toBe(true);
    const took = (await lines()).slice(beforeTake);
    expect(
      took.some(
        (l) =>
          new RegExp(`^CG 1-${String(layer)} ADD 0 "[^"]+" 0 "`).test(l) &&
          l.includes('2026-10-15T21:50:00+03:30'),
      ),
      'the take carries the target the off-air update set',
    ).toBe(true);
  });
});
