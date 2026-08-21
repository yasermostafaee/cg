import { expect, it, vi } from 'vitest';
import { StackSwapLiveSourceChannel, StackUpdateChannel } from '@cg/shared-ipc';
import { MockRuntime } from '../src/platform/MockRuntime.js';
import { createMockBridge } from '../src/platform/createRuntimeBridge.js';

/**
 * 🔴 **SESSION BO §5.4 — THE MOCK SHIM MUST FORWARD EVERY FIELD, DERIVED FROM THE SCHEMA.**
 *
 * `createRuntimeBridge`'s handlers destructure a request explicitly
 * (`mock.update(req.itemId, req.fields, req.mergeMode)`), so every field added to a channel
 * has to be added here BY HAND — and forgetting is silent. It has now happened three times in
 * three sessions, in three different hand-written copy lists:
 *
 *   1. `StackRetentionStore.toRetained` dropped the whole per-look map;
 *   2. this shim dropped Stage 1's `lookId`, so the mock could never express a per-look
 *      binding at all;
 *   3. and `stack.update`'s `lookBindings` would have gone the same way.
 *
 * ⚠ **`mock-bridge-parity.test.ts` cannot catch this and is not meant to.** It compares METHOD
 * TREES — that the mock has a `swapLiveSource` at all — which is a different question from
 * whether that method receives what the caller sent. A shim that forwards three of four
 * arguments passes it perfectly.
 *
 * So this asserts the RULE rather than a list: **every key the request schema declares must
 * reach the runtime.** A fourth field fails here on the day it is added, which is the only
 * moment the omission is cheap. Session BM Stage 1 invented this shape for the retention copy
 * list; this is the same treatment applied to the second copy list of the three.
 */

/** A value the shim cannot invent, so finding it downstream proves it was FORWARDED. */
function sentinel(key: string): string {
  return `__sentinel__${key}`;
}

/**
 * Every key the channel's request declares, from the zod schema itself.
 *
 * Derived, never typed out — a hand-written list here would be a fourth copy list guarding
 * the third, which is how this class reaches five.
 */
function requestKeys(channel: { request: { shape?: Record<string, unknown> } }): string[] {
  const shape = channel.request.shape;
  if (shape === undefined) throw new Error('channel request is not an object schema');
  return Object.keys(shape);
}

/** Did every sentinel reach the runtime, somewhere in its arguments? */
function forwarded(args: readonly unknown[], keys: readonly string[]): string[] {
  const seen = JSON.stringify(args);
  return keys.filter((k) => !seen.includes(sentinel(k)));
}

it('🔴 §5.4 — the mock shim forwards EVERY field of stack.swap-live-source', () => {
  const keys = requestKeys(StackSwapLiveSourceChannel as never);
  // Sanity: the derivation must actually see the field the shim once dropped, or this guard
  // is passing on an empty set and proving nothing.
  expect(keys, 'the schema is the source of truth').toContain('lookId');

  const spy = vi.spyOn(MockRuntime.prototype, 'swapLiveSource').mockReturnValue({ ok: true });
  const cg = createMockBridge();
  void cg.stack.swapLiveSource({
    itemId: sentinel('itemId'),
    plateId: sentinel('plateId'),
    sourceId: sentinel('sourceId'),
    lookId: sentinel('lookId'),
  });

  expect(spy).toHaveBeenCalledTimes(1);
  expect(
    forwarded(spy.mock.calls[0] ?? [], keys),
    'these request fields never reached the runtime',
  ).toEqual([]);
  spy.mockRestore();
});

it('🔴 §5.4 — the mock shim forwards EVERY field of stack.update', () => {
  const keys = requestKeys(StackUpdateChannel as never);
  expect(keys).toContain('lookBindings');

  const spy = vi
    .spyOn(MockRuntime.prototype, 'update')
    .mockReturnValue({ accepted: true } as ReturnType<MockRuntime['update']>);
  const cg = createMockBridge();
  void cg.stack.update({
    itemId: sentinel('itemId'),
    // `fields` and `mergeMode` carry their sentinel as a VALUE rather than a key, because the
    // shim forwards them whole; what is being tested is the forwarding, not the shape.
    fields: { probe: sentinel('fields') },
    mergeMode: sentinel('mergeMode') as 'merge',
    lookBindings: { look: { plate: sentinel('lookBindings') } },
  });

  expect(spy).toHaveBeenCalledTimes(1);
  expect(
    forwarded(spy.mock.calls[0] ?? [], keys),
    'these request fields never reached the runtime',
  ).toEqual([]);
  spy.mockRestore();
});
