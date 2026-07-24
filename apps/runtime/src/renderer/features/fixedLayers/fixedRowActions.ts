import type { FixedSlotState } from '@cg/shared-ipc';
import type { AsyncResult } from '../../ui/asyncButtonController.js';
import type { RowAction } from '../../ui/rowAction.js';

/**
 * R-021 stage 2b — the ONE place a fixed row's verbs are derived (design
 * (f)/(g), the R-013 pattern): one pure function of `(binding, observation)`,
 * rendered as buttons AND context-menu items from the SAME returned list, so
 * gating/handler/wording cannot diverge. Pure and React-free so the verb split
 * is unit-tested directly.
 *
 * Stage 2b's verb surface is deliberately NARROW — the only verb is `CLEAR`,
 * and only on an observed `html` producer with a live link:
 *
 *  - `unknown` / `empty` / non-`html` producer → NO control at all. Today's
 *    bridge refuses `layers.clear` for every one of those cases (R-015: no
 *    fresh observation, or a non-html kind), and an enabled button must never
 *    invite a click that only rejects. The b1 blind-Clear under OSC silence and
 *    the non-html carve-out are task 4.3 (stage 4) — the bridge-side permission
 *    lands there, and the verbs appear here in the same change.
 *  - observed `html` → the layer verb `CLEAR`, confirm-gated (the row attaches
 *    the gate via `withConfirm` — declaration-time, both surfaces). This closes
 *    a real hole: 4.2a removed fixed layers from the orphan banner on the
 *    rationale that the permanent row is their occupancy surface, so until this
 *    row existed an html orphan inside a declared bank was neither visible nor
 *    clearable anywhere.
 *  - a dead SPA↔bridge link masks every row to unknown (D8/B-087), and an
 *    unknown row has no controls — so `linkDown` returns [] for every case
 *    (R-006: no door onto air while the link is down).
 */
export interface FixedRowActionDeps {
  /** True while the SPA↔bridge link is down (`useLink() === 'disconnected'`). */
  linkDown: boolean;
  /** The shared `layers.clear` round-trip for THIS slot's coordinate. */
  clear: () => Promise<AsyncResult>;
  /** Where a refusal goes — the command toast, per the RowAction contract. */
  onError: (message: string) => void;
}

export function fixedRowActions(slot: FixedSlotState, deps: FixedRowActionDeps): RowAction[] {
  if (slot.binding !== null) {
    // Task 5.3 (stage 3): the bound-item verb set (Take / Update / Stop /
    // Clear, C-012 semantics, shared with the stack row's handlers) lands with
    // the import+load chain — the wire cannot produce a non-null binding until
    // then, and no exact-slot handlers exist yet. No speculative verbs for an
    // unreachable branch.
    return [];
  }
  if (deps.linkDown) return [];
  const { observed } = slot;
  if (observed.kind !== 'producer' || observed.producer !== 'html') return [];

  const name = `${String(slot.channel)}-${String(slot.layer)}`;
  return [
    {
      key: 'clear',
      label: 'CLEAR',
      variant: 'caution',
      disabled: false,
      title: `Send CLEAR ${name} — removes whatever is on that layer from the output`,
      run: deps.clear,
      onError: deps.onError,
    },
  ];
}
