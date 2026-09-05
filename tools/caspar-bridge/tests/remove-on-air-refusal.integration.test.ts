import * as dgram from 'node:dgram';
import { afterEach, expect, it } from 'vitest';
import { createMock, type MockHandle } from '@cg/amcp-mock';
import { CasparRuntime } from '../src/caspar-runtime.js';
import type { ConnectionConfig, TemplateInfo } from '@cg/shared-ipc';
import { HEALTH_MS } from './support/harness.js';

/**
 * 🔴 `R-017` — **THE BRIDGE HALF OF THE REFUSAL, ASSERTED AT THE WIRE.**
 *
 * A UI gate is not a prohibition. Anything that speaks the channel reaches `stack.remove`
 * directly — a stale render, another browser, a script — so the refusal has to live here, and
 * the only assertion that proves it is that the producer was NOT destroyed.
 *
 * ⚠ **`CLEAR` is not the only verb to watch, and that is the trap `B-166` shipped.**
 * `#removeImpl` tears down the row's LIVE PLATES first — an `out` and a `MIXER CLEAR` per
 * seated record, issued before the slot's own `CLEAR` — so a CLEAR-only assertion would pass
 * while every guest plate was destroyed. This file asserts on the mock's own LAYER STATE,
 * which is the whole channel rather than one verb's trace.
 *
 * ⭐ **THE POSITIVE CONTROL IS NOT OPTIONAL.** "Nothing was destroyed" is VOID until the
 * instrument is shown to be live: the second test removes a row through the same call and
 * proves the layer DOES go empty, so a bridge that had stopped removing anything at all could
 * not pass both.
 *
 * ⚠ **LOAD emits ZERO AMCP** (R-021 stage 3 made it list-only), so nothing is on the layer
 * until a TAKE — whose `B-039` pre-roll re-ADD is what puts the producer up. Every test here
 * that needs a lit layer takes the row; a `loaded` row's layer is legitimately empty.
 */

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
    const sock = dgram.createSocket('udp4');
    sock.once('error', reject);
    sock.bind(0, '127.0.0.1', () => {
      const port = sock.address().port;
      sock.close(() => resolve(port));
    });
  });
}

function connectionFor(amcpPort: number, oscPort: number, oscPortB: number): ConnectionConfig {
  return {
    servers: {
      A: { host: '127.0.0.1', amcpPort, oscPort },
      B: { host: '127.0.0.1', amcpPort, oscPort: oscPortB },
    },
    strategy: 'mirror-sync',
    autoFailoverEnabled: true,
  };
}

const LOWER_THIRD: TemplateInfo = {
  templateId: 'lower-third',
  templateType: 'lower-third',
  fields: [],
};
const HTML = '<!doctype html><html><head><meta charset="utf-8"></head><body>سلام</body></html>';
/** DECLARED OPERATOR ROWS (bank 70..73) — the surface R-017 protects. */
const SLOT = { channel: 1, layer: 70 };
const SLOT_B = { channel: 1, layer: 71 };
const BANK = { channel: 1, low: { start: 1, count: 9 }, start: 70, count: 4 };
const FIXED_SLOTS = [SLOT, SLOT_B];

async function boot(): Promise<{ rt: CasparRuntime; mk: MockHandle }> {
  const oscPort = await freeUdpPort();
  mock = await createMock({ amcpPort: 0, oscPort, oscHost: '127.0.0.1', oscHz: 40 });
  // ⚠ The bank is DECLARED AT CONSTRUCTION, like every other bank-using integration test.
  // It has to exist for this subject to be reachable at all: the refusal is scoped to items a
  // ROW shows, and without a bank there are no rows — see `#removeRefusal` and its `B-212`
  // exemption for why that scoping is deliberate rather than incidental.
  runtime = new CasparRuntime(
    connectionFor(mock.amcpPort, oscPort, await freeUdpPort()),
    {},
    { fixedSlots: FIXED_SLOTS, fixedBank: BANK },
  );
  runtime.start();
  await runtime.startServing();
  runtime.templateImport(LOWER_THIRD, HTML);
  await runtime.whenServerHealthy(HEALTH_MS);
  return { rt: runtime, mk: mock };
}

it('🔴 REFUSED on an on-air row: the producer survives, and so does the row', async () => {
  const { rt, mk } = await boot();
  expect(await rt.loadFixed(SLOT, 'item-1', 'lower-third', {})).toEqual({ accepted: true });
  expect((await rt.take('item-1')).accepted).toBe(true);
  expect(mk.layerState(SLOT)?.onAir).toBe(true);

  const res = await rt.remove('item-1');
  expect(res.accepted, 'the BRIDGE must refuse, not merely the button').toBe(false);
  expect(res.errorCode).toBe('on-air');
  // It names the way out rather than only the refusal — the same requirement the row's
  // tooltip carries, and the reason a held verb does not read as a broken console.
  expect(res.message ?? '').toMatch(/STOP/);

  // THE WIRE: nothing was destroyed. Not "no CLEAR was sent" — the LAYER, which is what a
  // live-plate teardown would also have emptied.
  expect(mk.layerState(SLOT)?.producer).not.toBe('empty');
  expect(mk.layerState(SLOT)?.onAir).toBe(true);

  // "Refused" means CHANGED NOTHING. A decline that has already dropped the row from the
  // stack is not a decline, and a wire-only assertion would miss it.
  expect(rt.stackSnapshot().map((i) => i.itemId)).toContain('item-1');
});

it('THE POSITIVE CONTROL: the same call empties the layer on a row that is not on air', async () => {
  const { rt, mk } = await boot();
  expect(await rt.loadFixed(SLOT, 'item-2', 'lower-third', {})).toEqual({ accepted: true });
  expect((await rt.take('item-2')).accepted).toBe(true);
  expect(mk.layerState(SLOT)?.producer).not.toBe('empty');

  // Off air first — the remedy the refusal names — and then the very same `remove` lands.
  await rt.out('item-2');
  expect((await rt.remove('item-2')).accepted).toBe(true);
  expect(mk.layerState(SLOT)?.producer).toBe('empty');
  expect(rt.stackSnapshot().map((i) => i.itemId)).not.toContain('item-2');
});

it('🔴 THE INVERSE — taking it off air returns the verb, with no reload', async () => {
  const { rt } = await boot();
  expect(await rt.loadFixed(SLOT, 'item-3', 'lower-third', {})).toEqual({ accepted: true });
  await rt.take('item-3');
  expect((await rt.remove('item-3')).accepted).toBe(false);

  await rt.out('item-3');
  expect((await rt.remove('item-3')).accepted, 'a gate with no measured way back is a trap').toBe(
    true,
  );
});

it('remove-all is refused ALL-OR-NOTHING — the idle row is still there afterwards', async () => {
  const { rt } = await boot();
  // TWO rows on two declared slots: one never taken, one on air. The mixed case is the whole
  // subject — the bulk verb waits while the per-row one does not.
  expect(await rt.loadFixed(SLOT, 'item-a', 'lower-third', {})).toEqual({ accepted: true });
  expect(await rt.loadFixed(SLOT_B, 'item-b', 'lower-third', {})).toEqual({ accepted: true });
  await rt.take('item-b');

  expect(await rt.removeAll()).toMatchObject({ ok: false, removed: 0, errorCode: 'on-air' });
  // The half that matters: a loop refusing as it went would have dropped `item-a` first and
  // then reported that nothing happened.
  expect(
    rt
      .stackSnapshot()
      .map((i) => i.itemId)
      .sort(),
  ).toEqual(['item-a', 'item-b']);
});

it('…and the per-row verb is not withheld with it — only the BULK action waits', async () => {
  const { rt } = await boot();
  expect(await rt.loadFixed(SLOT, 'item-a', 'lower-third', {})).toEqual({ accepted: true });
  expect(await rt.loadFixed(SLOT_B, 'item-b', 'lower-third', {})).toEqual({ accepted: true });
  await rt.take('item-b');

  expect((await rt.remove('item-a')).accepted, 'four idle rows of five stay removable').toBe(true);
  expect((await rt.remove('item-b')).accepted).toBe(false);
});
