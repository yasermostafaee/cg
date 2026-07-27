import type { FixedSlotState } from '@cg/shared-ipc';
import type { AsyncResult } from '../../ui/asyncButtonController.js';
import type { RowAction } from '../../ui/rowAction.js';

/**
 * R-021 — the ONE place a fixed row's verbs are derived (design (f)/(g), the
 * R-013 pattern): one pure function of `(binding, observation)`, rendered as
 * buttons AND context-menu items from the SAME returned list, so
 * gating/handler/wording cannot diverge. Pure and React-free so the verb split
 * is unit-tested directly.
 *
 * The split, and what each case is waiting on:
 *
 *  - **bound slot** (`binding !== null`) → NO verbs here. The item is an
 *    ORDINARY stack item, and its C-012 verb set (Take / Update / Stop / Clear)
 *    lives on its stack row, declared there. Design (f) wants those mirrored
 *    onto the fixed row from the SAME declarations — which means extracting the
 *    stack row's declaration point first, and that is a change to the DYNAMIC
 *    row's surface, outside task 5.3's "import → bind → load" scope. Until it
 *    lands the row still does its stage-3 job: it NAMES the bound item, so
 *    "layer 72 is the clock" is visible. What it must never do is grow a
 *    private copy of those verbs — a second declaration is exactly the drift
 *    this module exists to prevent.
 *  - **`empty`** → the stage-3 chain: import+load, and Load-from-library. Only
 *    on an OBSERVED-empty slot, deliberately: `load` adopts the layer with a
 *    `CLEAR` before its first `CG ADD`, and on real CasparCG a `CG ADD` would
 *    replace a resident producer anyway — so offering the chain on `unknown` or
 *    over a foreign producer would hide a destructive step behind a
 *    constructive label (the d1 rule, and B-100 one layer up). Observed-empty
 *    is the one case where that adopt has nothing to destroy. Clearing a
 *    non-empty fixed slot first is the operator's own explicit step (task 4.3).
 *  - **`unknown`** → NO control. Same reason, plus today's bridge refuses
 *    `layers.clear` without a fresh observation (R-015); the b1 blind-Clear
 *    under OSC silence is task 4.3 (stage 4).
 *  - **observed `html` producer** → the layer verb `CLEAR`, confirm-gated (the
 *    row attaches the gate via `withConfirm` — declaration-time, both
 *    surfaces). This closes a real hole: 4.2a removed fixed layers from the
 *    orphan banner on the rationale that the permanent row is their occupancy
 *    surface, so until this row existed an html orphan inside a declared bank
 *    was neither visible nor clearable anywhere.
 *  - **non-`html` producer** → NO control until task 4.3's carve-out.
 *  - a dead SPA↔bridge link masks every row to unknown (D8/B-087), and an
 *    unknown row has no controls — so `linkDown` returns [] for every case
 *    (R-006: no door onto air while the link is down). It covers the stage-3
 *    chain too: the load is bridge-owned and would only be refused.
 */
export interface FixedRowActionDeps {
  /** True while the SPA↔bridge link is down (`useLink() === 'disconnected'`). */
  linkDown: boolean;
  /** The shared `layers.clear` round-trip for THIS slot's coordinate. */
  clear: () => Promise<AsyncResult>;
  /**
   * The stage-3 one-action chain: pick a `.vcg` → import it into the shared
   * library → create an item bound to THIS slot → Load.
   */
  importAndLoad: () => Promise<AsyncResult>;
  /** Same binding, starting from a template already in the library. */
  loadFromLibrary: () => Promise<AsyncResult>;
  /** Where a refusal goes — the command toast, per the RowAction contract. */
  onError: (message: string) => void;
}

export function fixedRowActions(slot: FixedSlotState, deps: FixedRowActionDeps): RowAction[] {
  if (slot.binding !== null) return [];
  if (deps.linkDown) return [];

  const name = `${String(slot.channel)}-${String(slot.layer)}`;
  const { observed } = slot;

  if (observed.kind === 'empty') {
    return [
      {
        key: 'import-load',
        label: 'IMPORT + LOAD',
        // The neutral staging accent, like the Library's own Load: `CG ADD`
        // pre-rolls the producer, it does NOT put anything on air (B-039 — the
        // operator's take issues the `CG PLAY`).
        variant: 'secondary',
        disabled: false,
        title: `Import a .vcg and load it onto layer ${name} — the template stays in the library for reuse`,
        run: deps.importAndLoad,
        onError: deps.onError,
      },
      {
        key: 'load-library',
        label: 'LOAD…',
        variant: 'secondary',
        disabled: false,
        title: `Load a template from the library onto layer ${name}`,
        run: deps.loadFromLibrary,
        onError: deps.onError,
      },
    ];
  }

  if (observed.kind !== 'producer' || observed.producer !== 'html') return [];

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
