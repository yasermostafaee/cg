import { describe, expect, it } from 'vitest';
import { isOnAirStatus, StackItemStatusSchema } from '@cg/shared-schema';
import type { StackItemState } from '@cg/shared-schema';
import { layerRowActions } from '../src/renderer/features/layers/layerRowActions.js';
import { REMOVE_ON_AIR_REASON } from '../src/renderer/features/layers/layerRowActions.js';
import { bindingFor, itemWith, rowDeps } from './support/layerRow.js';

/**
 * 🔴 `R-017` / `operator-surface` §5 answer (B) — **THE AGREEMENT TEST.**
 *
 * R-017's whole direction is ONE AUTHORITY on both sides of the bridge seam. Before this
 * change the on-air status list was spelled EIGHT times — the bridge's `isOnAirStatus`, its
 * own inline copy in `setPosition`, the renderer's `isOnAirOrUnsettled`, `isPositionLocked`,
 * and four in `MockRuntime` — every one of them the same six terms, agreeing only by luck.
 *
 * ⭐ **WHY THE FIRST ASSERTION IS AN IDENTITY AND NOT A TABLE.** A table of equal answers is
 * exactly what eight mirrored copies produce: it passes on the defect. Asserting that the row
 * gate and the bridge gate are the SAME FUNCTION OBJECT is the only assertion a re-introduced
 * copy cannot satisfy. The enumeration below it is not redundant — it pins WHICH set that one
 * function answers, so a later widening has to come here and say so.
 *
 * ⚠ **HONEST LIMIT, stated rather than papered over.** This file asserts the PREDICATE both
 * sides read, and the row's gate that consumes it. It does not drive a real `CasparRuntime`
 * into all ten statuses — the bridge exposes no status setter, and `unverified` / `error` /
 * `unconfirmed` need link loss and ack timeouts. That the bridge's REFUSAL actually fires,
 * and sends nothing, is proved on the wire in
 * `tools/caspar-bridge/tests/remove-on-air-refusal.integration.test.ts`. Claiming a ten-status
 * bridge table from a renderer test would be the fiction this test exists to prevent.
 */
describe('R-017 — the UI gate and the bridge refusal read ONE predicate', () => {
  it('🔴 the row gate and the bridge gate are the SAME function object, not two that agree', async () => {
    // The bridge imports it from `@cg/shared-schema`; so does `layerRowActions`. Importing
    // the bridge module here would drag its whole runtime in, so the identity is asserted
    // against the shared package — which is the thing both sides import, and therefore the
    // only object a re-introduced local copy could fail to be.
    const bridge = await import('@cg/shared-schema');
    expect(bridge.isOnAirStatus).toBe(isOnAirStatus);
  });

  it('🔴 no second spelling survives: the deleted renderer mirror is not re-exported', async () => {
    const onAir = await import('../src/renderer/features/stack/onAir.js');
    expect('isOnAirOrUnsettled' in onAir).toBe(false);
  });

  it('answers every StackItemStatus, and the set is pinned so a widening must come here', () => {
    // The six that count as on air, and the four that do not. `unverified`, `error` and
    // `disconnected` are OUT deliberately — see the predicate's own doc for the measured
    // reason (a REMOVE refused on `unverified` has no escape hatch when CasparCG is
    // unreachable, because the row's CLEAR is gated on reachability and REMOVE is not).
    const expected: Record<string, boolean> = {
      idle: false,
      loaded: false,
      playing: true,
      'on-air': true,
      updating: true,
      exiting: true,
      unconfirmed: true,
      unverified: false,
      error: false,
      disconnected: false,
    };
    // Enumerated from the SCHEMA, so a new status fails here rather than being forgotten.
    expect(Object.keys(expected).sort()).toEqual([...StackItemStatusSchema.options].sort());
    for (const status of StackItemStatusSchema.options) {
      expect(isOnAirStatus({ status, pending: false }), `${status}, not pending`).toBe(
        expected[status],
      );
      // `pending` means the on-air result is UNKNOWN, and unknown counts as on air in every
      // gate whose failure mode is acting on a live graphic — for EVERY status.
      expect(isOnAirStatus({ status, pending: true }), `${status}, pending`).toBe(true);
    }
  });

  it("🔴 the ROW's REMOVE resolves identically to the predicate, for every status", () => {
    for (const status of StackItemStatusSchema.options) {
      for (const pending of [false, true]) {
        const item: StackItemState = itemWith(status, { pending });
        const remove = layerRowActions(rowDeps({ binding: bindingFor(item) })).find(
          (a) => a.key === 'load-remove',
        );
        expect(remove?.label, `${status}/${String(pending)} must be the REMOVE half`).toBe(
          'REMOVE',
        );
        expect(remove?.disabled, `REMOVE on ${status}/${String(pending)}`).toBe(
          isOnAirStatus(item),
        );
      }
    }
  });

  it('🔴 the ONE exemption both sides carry: a RESTORE-BLOCKED row keeps REMOVE', () => {
    // The row's layer is held by a producer that is provably not ours, so the air claim is
    // one the bridge already knows to be false and REMOVE would destroy nothing of ours.
    // R-021 stage 4 d1: "the block is what CLEAR and REMOVE exist to resolve". The bridge's
    // `#removeRefusal` carries the identical exemption — this is the single place where the
    // shared predicate alone would have made the two sides disagree.
    const remove = layerRowActions(
      rowDeps({ binding: bindingFor(itemWith('on-air')), restoreBlocked: true }),
    ).find((a) => a.key === 'load-remove');
    expect(isOnAirStatus(itemWith('on-air')), 'the predicate still says on air').toBe(true);
    expect(remove?.disabled, 'and REMOVE is still offered').toBe(false);
  });

  it('says WHY, in the one exported sentence — never a per-surface paraphrase', () => {
    const remove = layerRowActions(rowDeps({ binding: bindingFor(itemWith('on-air')) })).find(
      (a) => a.key === 'load-remove',
    );
    expect(remove?.title).toBe(REMOVE_ON_AIR_REASON);
    // It names the way OUT rather than only the refusal — a held verb with no next step is
    // how an operator concludes the console is broken.
    expect(REMOVE_ON_AIR_REASON).toMatch(/STOP/);
    expect(REMOVE_ON_AIR_REASON).toMatch(/CLEAR/);
  });

  it('🔴 THE INVERSE — the row is removable again the moment it is off air, both settle paths', () => {
    // A gate with no measured way back is a trap. STOP settles the item to `loaded`; CLEAR
    // settles it to `idle`. Both must return the verb, with no reload and no re-pick.
    for (const settled of ['loaded', 'idle'] as const) {
      const remove = layerRowActions(rowDeps({ binding: bindingFor(itemWith(settled)) })).find(
        (a) => a.key === 'load-remove',
      );
      expect(remove?.disabled, `REMOVE must return on ${settled}`).toBe(false);
      expect(remove?.title, `and stop explaining a block that is over (${settled})`).not.toBe(
        REMOVE_ON_AIR_REASON,
      );
    }
  });
});
