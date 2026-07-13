import * as dgram from 'node:dgram';
import { afterEach, expect, it } from 'vitest';
import { createMock, type MockHandle } from '@cg/amcp-mock';
import type { ConnectionConfig, TemplateInfo } from '@cg/shared-ipc';
import { CasparRuntime } from '../src/caspar-runtime.js';

/**
 * B-070 — `update` gets the PRODUCER-STATE rule it never had.
 *
 * `CG UPDATE` needs a live PRODUCER, not air: real CasparCG `403`s it on a
 * layer whose producer is empty (the mock models this — `handlers.ts`, from a
 * live B-038 log). Pre-B-070 `update()` fired `CG UPDATE` blind at whatever
 * slot the item held, so an item whose producer had been destroyed (a prior
 * `out`, a reconnect that cleared the bookkeeping) was PERMANENTLY
 * un-updatable: the operator's field edit came back "Not accepted".
 *
 * Worse, the refusal POISONED the item — a failed ack moved only
 * `ackedStatus`, leaving `intentStatus` at the transient `updating`, so
 * `pending` never cleared and R-011's `setPosition` (which refuses while
 * `pending`) was blocked forever after. Both are covered here.
 *
 * The existing suite never exercised this: every bridge test does
 * load → take → update, i.e. always ON a live producer.
 */

let mock: MockHandle | null = null;
let runtime: CasparRuntime | null = null;

afterEach(async () => {
  // Always release the AMCP/OSC ports + the template HTTP server, even on a
  // failing assertion — a leaked port poisons the parallel suite.
  await runtime?.stop();
  runtime = null;
  await mock?.stop();
  mock = null;
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

const TEMPLATE: TemplateInfo = {
  templateId: 'lower-third',
  templateType: 'lower-third',
  fields: [],
};
const HTML = '<!doctype html><html><head><meta charset="utf-8"></head><body>سلام</body></html>';
const SLOT = { channel: 1, layer: 10 };

function singleServer(amcpPort: number, oscPort: number): ConnectionConfig {
  return {
    servers: { A: { host: '127.0.0.1', amcpPort, oscPort } },
    strategy: 'mirror-sync',
    autoFailoverEnabled: true,
  };
}

async function boot(): Promise<void> {
  const oscPort = await freeUdpPort();
  mock = await createMock({ amcpPort: 0, oscPort, oscHost: '127.0.0.1', oscHz: 30 });
  runtime = new CasparRuntime(singleServer(mock.amcpPort, oscPort));
  runtime.start();
  await runtime.startServing();
  runtime.templateImport(TEMPLATE, HTML);
  await runtime.whenServerHealthy(6000);
}

function itemOf(itemId: string) {
  return runtime!.stackSnapshot().find((i) => i.itemId === itemId);
}

it('B-070: update on a PRODUCERLESS slot commits the fields, sends NO CG UPDATE, settles the intent — and the next take carries them to air', async () => {
  await boot();

  expect((await runtime!.load('item1', 'lower-third', { headline: 'before' })).accepted).toBe(true);
  // out() exits + CLEARs: the producer is DESTROYED and the bookkeeping says so.
  expect((await runtime!.out('item1')).accepted).toBe(true);
  expect(mock!.lastCgUpdate(SLOT)).toBeUndefined();

  // The operator edits fields on the now-producerless (idle) item and applies.
  const res = await runtime!.update('item1', { headline: 'after' }, 'merge');

  // 1. ACCEPTED — this is the whole bug: pre-B-070 this was { accepted: false }.
  expect(res.accepted).toBe(true);
  // 2. COMMITTED to the authoritative field-set (R-003: Update is the ONLY commit path).
  expect(itemOf('item1')?.fields).toMatchObject({ headline: 'after' });
  // 3. NOTHING on the wire — a CG UPDATE here would have 403'd on the empty layer.
  expect(mock!.lastCgUpdate(SLOT)).toBeUndefined();
  // 4. SETTLED (B-044): the transient `updating` reached a terminal state
  //    in-process. A zombie `pending` is exactly what poisoned the item.
  expect(itemOf('item1')?.pending).toBe(false);

  // 5. The committed fields REACH AIR on the next take, via B-039's re-ADD
  //    (no live producer ⇒ re-issue CG ADD, then CG PLAY) — the data payload
  //    carries the edit the operator made while the item was idle.
  expect((await runtime!.take('item1')).accepted).toBe(true);
  const add = mock!.lastCgAdd(SLOT);
  expect(add?.data).not.toBeNull();
  expect(JSON.parse(add?.data ?? '{}')).toMatchObject({ headline: 'after' });
}, 30000);

it('B-070 regression guard: update on a LIVE producer still emits CG UPDATE (unchanged AMCP — ADR-0006)', async () => {
  await boot();

  expect((await runtime!.load('item1', 'lower-third', { headline: 'before' })).accepted).toBe(true);
  expect((await runtime!.take('item1')).accepted).toBe(true);

  const res = await runtime!.update('item1', { headline: 'live' }, 'merge');

  expect(res.accepted).toBe(true);
  // The producer is live ⇒ the edit rides CG UPDATE, exactly as before B-070.
  const sent = mock!.lastCgUpdate(SLOT);
  expect(sent?.data).not.toBeNull();
  expect(JSON.parse(sent?.data ?? '{}')).toMatchObject({ headline: 'live' });
  expect(itemOf('item1')?.fields).toMatchObject({ headline: 'live' });
}, 30000);

it('B-070: a GENUINE AMCP-error update is refused WITH an errorCode, settles terminally, and no longer poisons R-011 setPosition', async () => {
  await boot();

  // Load first (default handlers): a live producer exists and is bookkept.
  expect((await runtime!.load('item1', 'lower-third', { headline: 'before' })).accepted).toBe(true);

  // Now force CasparCG to error the update. The item IS producer-bearing, so
  // the bridge legitimately sends CG UPDATE — and the server refuses it.
  mock!.setHandler('CG', () => ({
    kind: 'err' as const,
    code: 403,
    verb: 'CG',
    detail: 'CG UPDATE FAILED',
  }));

  const res = await runtime!.update('item1', { headline: 'doomed' }, 'merge');

  // 1. Refused — and it can now EXPLAIN ITSELF (pre-B-070: a bare
  //    { accepted: false }, surfaced as the generic "Not accepted.").
  expect(res.accepted).toBe(false);
  expect(res.errorCode).toBe('amcp-403');

  // 2. The item SETTLES. Pre-B-070 the failed ack left `intentStatus` at
  //    'updating' forever, so `pending` never cleared — a permanent zombie.
  const poisoned = itemOf('item1');
  expect(poisoned?.pending).toBe(false);
  expect(poisoned?.errorCode).toBe('amcp-403');

  // 3. THE CASCADE IS GONE: R-011's setPosition refuses while `item.pending`,
  //    so one refused Update used to make the item permanently un-positionable.
  expect(
    await runtime!.setPosition('item1', { anchor: 'bottom-right', offset: { x: -10, y: -20 } }),
  ).toEqual({ ok: true });
}, 30000);
