import * as dgram from 'node:dgram';
import { afterEach, expect, it } from 'vitest';
import { createMock, type MockHandle } from '@cg/amcp-mock';
import type { ConnectionConfig, FixedSlotState } from '@cg/shared-ipc';
import { CasparRuntime } from '../src/caspar-runtime.js';
import { HEALTH_MS } from './support/harness.js';

/**
 * R-021 stage 3 (task 5.3) — the EXACT-SLOT load, end to end against a real
 * AMCP mock.
 *
 * The property under test is the one the whole item rests on: an item created
 * from a fixed row lands on THAT ROW'S LAYER and no other. It is asserted on
 * the WIRE (which layer the `CG ADD` addressed), not on internal bookkeeping —
 * and the fixed slot's exclusion from dynamic allocation is asserted the same
 * way, by showing an ordinary `load()` never touches it.
 *
 * `bindFixed` is the only path that can produce a non-null `binding` on the
 * per-slot state: `reserve()` refuses fixed slots by construction (stage 1's
 * T4) and records no template type, and `#allocate()` can never return one
 * (born-allocated fencing). So a published binding IS the proof that this went
 * through `bindFixed` rather than the dynamic path.
 */

let mock: MockHandle | null = null;
let runtime: CasparRuntime | null = null;

const SWEEP_MS = 150;
const STALE_MS = 800;
const HTML = '<!doctype html><html><body>served</body></html>';
const BANK = { channel: 1, start: 70, count: 4 };
const FIXED_SLOTS = [
  { channel: 1, layer: 70 },
  { channel: 1, layer: 71 },
  { channel: 1, layer: 72 },
  { channel: 1, layer: 73 },
];

afterEach(async () => {
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

async function boot(): Promise<CasparRuntime> {
  const oscPort = await freeUdpPort();
  mock = await createMock({ amcpPort: 0, oscPort, oscHost: '127.0.0.1', oscHz: 30 });
  runtime = new CasparRuntime(
    singleServer(mock.amcpPort, oscPort),
    {},
    {
      sweepMs: SWEEP_MS,
      occupancyStaleMs: STALE_MS,
      fixedSlots: FIXED_SLOTS,
      fixedBank: BANK,
    },
  );
  runtime.start();
  await runtime.startServing();
  runtime.templateImport({ templateId: 'tpl-clock', templateType: 'clock', fields: [] }, HTML);
  await runtime.whenServerHealthy(HEALTH_MS);
  return runtime;
}

function slotState(r: CasparRuntime, layer: number): FixedSlotState | undefined {
  return r.fixedLayersState().find((s) => s.layer === layer);
}

it('an exact-slot load lands the CG ADD on THAT layer and publishes the binding', async () => {
  const r = await boot();
  const published: FixedSlotState[][] = [];
  r.fixedStateChanged.subscribe((s) => published.push(s));

  const result = await r.loadFixed({ channel: 1, layer: 72 }, 'item-clock', 'tpl-clock', {});
  expect(result).toEqual({ accepted: true });

  // THE assertion: the wire's CG ADD went to 1-72 — the row's own layer.
  expect(mock?.lastCgAdd({ channel: 1, layer: 72 })).toBeDefined();
  for (const layer of [70, 71, 73]) {
    expect(mock?.lastCgAdd({ channel: 1, layer })).toBeUndefined();
  }

  // …and the published binding names the item + the REGISTRY's template type
  // (not the id) — a value only `bindFixed` can put on a fixed slot.
  expect(slotState(r, 72)?.binding).toEqual({ itemId: 'item-clock', templateType: 'clock' });
  expect(r.fixedLayersState().filter((s) => s.binding !== null)).toHaveLength(1);
  // The binding is PUBLISHED, not merely readable — the row learns about it.
  expect(published.some((s) => s.find((x) => x.layer === 72)?.binding !== null)).toBe(true);

  // The item is an ordinary stack item on exactly that coordinate.
  const item = r.stackSnapshot().find((i) => i.itemId === 'item-clock');
  expect(item?.slot).toMatchObject({ channel: 1, layer: 72 });
});

it('the fixed slot stays FENCED from dynamic allocation — before and after it is bound', async () => {
  const r = await boot();

  // A dynamic load of the same template type: it must not land in the bank.
  expect((await r.load('item-dynamic', 'tpl-clock', {})).accepted).toBe(true);
  const dynamic = r.stackSnapshot().find((i) => i.itemId === 'item-dynamic');
  expect(dynamic?.slot).toBeDefined();
  expect(FIXED_SLOTS.some((s) => s.layer === dynamic?.slot?.layer)).toBe(false);

  // Bind one, then dynamically load again: still outside the bank.
  await r.loadFixed({ channel: 1, layer: 70 }, 'item-fixed', 'tpl-clock', {});
  expect((await r.load('item-dynamic-2', 'tpl-clock', {})).accepted).toBe(true);
  const dynamic2 = r.stackSnapshot().find((i) => i.itemId === 'item-dynamic-2');
  expect(FIXED_SLOTS.some((s) => s.layer === dynamic2?.slot?.layer)).toBe(false);
});

it('refuses a coordinate outside the bank, an unregistered template, and an occupied slot', async () => {
  const r = await boot();

  // Not a bank layer — this channel is never a door onto an arbitrary layer.
  expect(await r.loadFixed({ channel: 1, layer: 10 }, 'item-a', 'tpl-clock', {})).toEqual({
    accepted: false,
    errorCode: 'not-fixed',
  });
  // Right layer, WRONG channel: also not a slot of this bank.
  expect(await r.loadFixed({ channel: 2, layer: 72 }, 'item-b', 'tpl-clock', {})).toEqual({
    accepted: false,
    errorCode: 'not-fixed',
  });
  // Never blind-ADD a URL the bridge cannot serve.
  expect(await r.loadFixed({ channel: 1, layer: 72 }, 'item-c', 'tpl-missing', {})).toEqual({
    accepted: false,
    errorCode: 'unknown-template',
  });
  // NOTHING reached the wire for any refusal.
  expect(mock?.lastCgAdd({ channel: 1, layer: 10 })).toBeUndefined();
  expect(mock?.lastCgAdd({ channel: 1, layer: 72 })).toBeUndefined();

  // Rebinding is Remove-then-load — two explicit operator steps, never one (d1).
  expect((await r.loadFixed({ channel: 1, layer: 72 }, 'item-d', 'tpl-clock', {})).accepted).toBe(
    true,
  );
  expect(await r.loadFixed({ channel: 1, layer: 72 }, 'item-e', 'tpl-clock', {})).toEqual({
    accepted: false,
    errorCode: 'slot-bound',
  });
  // The refused second load did NOT disturb the resident item's binding.
  expect(slotState(r, 72)?.binding).toEqual({ itemId: 'item-d', templateType: 'clock' });
});

it('Remove drops the binding but KEEPS the fence — the slot is re-loadable, never allocatable', async () => {
  const r = await boot();
  await r.loadFixed({ channel: 1, layer: 71 }, 'item-first', 'tpl-clock', {});
  expect(slotState(r, 71)?.binding).not.toBeNull();

  await r.remove('item-first');
  // `deallocate()` no-ops on a fixed slot, so this is the `#releaseSlot` path:
  // the binding goes, the fence stays.
  expect(slotState(r, 71)?.binding).toBeNull();

  // Still fenced: a dynamic load cannot take the freed slot…
  expect((await r.load('item-dynamic', 'tpl-clock', {})).accepted).toBe(true);
  expect(r.stackSnapshot().find((i) => i.itemId === 'item-dynamic')?.slot?.layer).not.toBe(71);
  // …and the row can be loaded again, on the same layer.
  expect(
    (await r.loadFixed({ channel: 1, layer: 71 }, 'item-second', 'tpl-clock', {})).accepted,
  ).toBe(true);
  expect(slotState(r, 71)?.binding).toEqual({ itemId: 'item-second', templateType: 'clock' });
});
