// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { isOnAirStatus, StackItemStatusSchema } from '@cg/shared-schema';
import type { StackItemState } from '@cg/shared-schema';
import { layerRowActions } from '../src/renderer/features/layers/layerRowActions.js';
import { REMOVE_ON_AIR_REASON } from '../src/renderer/features/layers/layerRowActions.js';
import { removeIsRefused } from '../src/renderer/features/layers/removeGate.js';
import { bindingFor, itemWith, rowDeps } from './support/layerRow.js';
import { StrictMode, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, vi } from 'vitest';
import { LayersPanel } from '../src/renderer/features/layers/LayersPanel.js';
import { clearPortals } from './support/dialog.js';
import { connectionsStub } from './support/reachability.js';

let panelContainer: HTMLDivElement | null = null;

afterEach(() => {
  panelContainer?.remove();
  panelContainer = null;
  clearPortals();
  vi.restoreAllMocks();
});

let nextLayer = 10;
function item(itemId: string, status: StackItemState['status']): StackItemState {
  return {
    itemId,
    templateId: 'tpl',
    fields: {},
    status,
    pending: false,
    slot: { channel: 1, layer: nextLayer++, server: 'primary' },
  };
}

/**
 * The real `LayersPanel`, rendered against a stack — the only way to assert what the BULK
 * button actually does. `layersPanel.clearAll.dom.test.ts`'s stub, narrowed to what this file
 * reads: a panel that renders REMOVE ALL needs the link, the declared bank, rehearse and the
 * three layer surfaces to answer, or it never gets past its own readiness guard.
 */
async function renderPanelWith(stack: StackItemState[]): Promise<HTMLDivElement> {
  const stub = {
    link: {
      status: () => 'live',
      onStatusChanged: () => () => undefined,
      resyncing: () => false,
      onResyncingChanged: () => () => undefined,
    },
    templates: { list: () => Promise.resolve([]), onChanged: () => () => undefined },
    fixedLayers: {
      config: () => Promise.resolve(null),
      state: () => Promise.resolve([]),
      onConfigChanged: () => () => undefined,
      onStateChanged: () => () => undefined,
    },
    connections: connectionsStub('both-up'),
    rehearse: { state: () => Promise.resolve([]), onStateChanged: () => () => undefined },
    playoutLayers: {
      state: () => Promise.resolve([]),
      clear: () => Promise.resolve({ ok: true }),
      onStateChanged: () => () => undefined,
    },
    liveLayers: { state: () => Promise.resolve([]), onStateChanged: () => () => undefined },
    stack: {
      snapshot: () => Promise.resolve(stack),
      onStateChanged: () => () => undefined,
      clearAll: () => Promise.resolve({ ok: true, cleared: 0, attempted: 0, refused: [] }),
      removeAll: () => Promise.resolve({ ok: true, removed: stack.length }),
      take: () => Promise.resolve({ accepted: true }),
      update: () => Promise.resolve({ accepted: true }),
      out: () => Promise.resolve({ accepted: true }),
      remove: () => Promise.resolve({ accepted: true }),
      onRestoreSkips: () => () => undefined,
      onRestoreMigrations: () => () => undefined,
    },
  };
  (window as unknown as { cg: typeof stub }).cg = stub;

  panelContainer?.remove();
  panelContainer = document.createElement('div');
  document.body.appendChild(panelContainer);
  const root = createRoot(panelContainer);
  await act(async () => {
    root.render(
      createElement(
        StrictMode,
        null,
        createElement(LayersPanel, {
          onSelectionChange: () => undefined,
          selectedId: null,
          layout: {
            inspectorPx: 320,
            focus: 'none' as const,
            narrow: false,
            monitorPx: 220,
            setInspectorPx: () => undefined,
            setMonitorPx: () => undefined,
            setFocus: () => undefined,
            reset: () => undefined,
            customized: false,
            monitorsShown: true,
            setMonitorsShown: () => undefined,
          },
          inspectorOpen: false,
          onUpdate: () => Promise.resolve({ accepted: true }),
          onToggleInspector: () => undefined,
        }),
      ),
    );
  });
  return panelContainer;
}

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

  it('🔴 a RESTORE-BLOCKED row keeps REMOVE — through the PUBLISHED exemption, not the binding', () => {
    /*
      The row's layer is held by a producer that is provably not ours, so the air claim is one
      the bridge already knows to be false and REMOVE would destroy nothing of ours. R-021
      stage 4 d1: "the block is what CLEAR and REMOVE exist to resolve".

      ⭐ **`B-228` MOVED THE INPUT, and this test's old shape is why that matters.** It used to
      pass `restoreBlocked: true` through `rowDeps` — the SLOT BINDING — and asserted the row
      honoured it. That was the row reading one of the bridge's two exemptions off a different
      channel and recomputing the rule, and it is exactly why the BULK could not join in: the
      second exemption (`#declaredLayerClass`) never crosses the seam at all, and the panel
      does not have per-row bindings to hand anyway. The exemption is now the bridge's own
      published answer on the ITEM, so both surfaces read one value.

      ⚠ The binding's `restoreBlocked` is NOT gone and is still correct for the other verbs —
      it answers "this layer is not ours to command", which is a different question.
    */
    const blocked: StackItemState = { ...itemWith('on-air'), removeExempt: true };
    const remove = layerRowActions(rowDeps({ binding: bindingFor(blocked) })).find(
      (a) => a.key === 'load-remove',
    );
    expect(isOnAirStatus(blocked), 'the predicate still says on air').toBe(true);
    expect(remove?.disabled, 'and REMOVE is still offered').toBe(false);

    // The two facts travel on DIFFERENT channels (stack push vs fixed-state push), so they can
    // momentarily disagree. Pin the fail-safe direction: the binding alone does not exempt.
    const bindingOnly = layerRowActions(
      rowDeps({ binding: bindingFor(itemWith('on-air')), restoreBlocked: true }),
    ).find((a) => a.key === 'load-remove');
    expect(bindingOnly?.disabled, 'without the published fact, REMOVE stays refused').toBe(true);
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

  it('🔴 `B-228` — the ROW honours BOTH exemptions, not just the one it could see', () => {
    /*
      The old spelling read `deps.restoreBlocked` — the binding fact — so it carried exemption
      1 and could not carry exemption 2 at all (`#declaredLayerClass` is bridge knowledge). It
      now reads the PUBLISHED `removeExempt`, which is the bridge's own answer to both.
    */
    const exempt = { ...itemWith('on-air'), removeExempt: true };
    const remove = layerRowActions(rowDeps({ binding: bindingFor(exempt) })).find(
      (a) => a.key === 'load-remove',
    );
    expect(isOnAirStatus(exempt), 'the predicate still says on air').toBe(true);
    expect(remove?.disabled, 'and REMOVE is still offered').toBe(false);
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

/**
 * 🔴 **`B-228` — THE AGREEMENT IS OVER THE DECISION, NOT THE PREDICATE.**
 *
 * ── WHY THE BLOCK ABOVE WAS NOT ENOUGH, WHICH IS THE WHOLE LESSON ───────────
 *
 * Everything above asserts that both sides read one PREDICATE, and it is all true — and
 * `B-228` shipped underneath it anyway. The bridge's answer was never the predicate: it is
 * `isOnAirStatus` **plus two exemptions** (`#removeRefusal`), and only the ROW carried one of
 * them. REMOVE ALL read the predicate alone and sat disabled for a press the bridge would have
 * accepted — the exact UI↔wire disagreement `#removeRefusal`'s own header forbids, arrived at
 * through a test suite that was watching the wrong noun.
 *
 * ⭐ **A ten-status enumeration of `isOnAirStatus` cannot catch that, and could not have.**
 * Every row of it passes on the defect, because the defect is not in the predicate — it is in
 * what each surface does with it. So these assertions are over the OUTCOME (`is REMOVE
 * refused for this row, right now?`) at each surface, with the exemption set as an input.
 *
 * ⚠ **STATED PLAINLY — WHAT THIS EXTENDED TEST STILL WOULD NOT CATCH.** It pins the two
 * RENDERER surfaces against the published fact. It does NOT prove the bridge computes
 * `removeExempt` correctly — that its `#removeExempt` really is the same condition its
 * `#removeRefusal` uses, and that the value reaches the wire. A bridge that published
 * `removeExempt: false` for a genuinely blocked row would leave both surfaces agreeing with
 * each other and both wrong, and every assertion here would still be green. That half is
 * proved where it can be, against a real runtime and a real wire, in
 * `tools/caspar-bridge/tests/remove-on-air-refusal.integration.test.ts`. Neither file is
 * sufficient alone, and this note exists so the next reader does not mistake this one for the
 * whole guard — the mistake this very item is made of.
 */
describe('B-228 — the ROW and the BULK refuse the same set, exemptions included', () => {
  /** The panel's REMOVE ALL, rendered for real, for a given stack. */
  async function removeAllDisabled(stack: StackItemState[]): Promise<boolean> {
    const el = await renderPanelWith(stack);
    const btn = el.querySelector<HTMLButtonElement>('button[aria-label="Remove all items"]');
    expect(btn, 'REMOVE ALL must be rendered even while withheld').not.toBeNull();
    return btn?.disabled === true;
  }

  /** The row's REMOVE, for the same item. */
  function rowRemoveDisabled(item: StackItemState): boolean {
    return (
      layerRowActions(rowDeps({ binding: bindingFor(item) })).find((a) => a.key === 'load-remove')
        ?.disabled === true
    );
  }

  it('🔴 an EXEMPT on-air row blocks NEITHER surface — this is the defect, at both ends', async () => {
    /*
      The stack the E2E fixture actually seeds: one row, on air, and exempt because its layer
      is held by a producer provably not ours. The bridge accepts REMOVE ALL here.

      RED before the fix: `rowRemoveDisabled` was already false (the row read the binding),
      while `removeAllDisabled` was TRUE (the bulk read the bare predicate). That single
      disagreement is `B-228`, and it is what held `dev`'s Linux `e2e` red.
    */
    const exempt: StackItemState = { ...item('item-1', 'on-air'), removeExempt: true };
    expect(rowRemoveDisabled(exempt), 'the ROW offers REMOVE').toBe(false);
    expect(await removeAllDisabled([exempt]), 'and so must REMOVE ALL').toBe(false);
  });

  it('🔴 a NON-exempt on-air row blocks BOTH — the fix must not turn into an ungating', async () => {
    // The inverse, and the one that matters more: `B-228`'s cheapest wrong fix is to drop the
    // bulk gate entirely, which would go green on the test above and hand back R-017.
    const live = item('item-1', 'on-air');
    expect(rowRemoveDisabled(live), 'the ROW withholds REMOVE').toBe(true);
    expect(await removeAllDisabled([live]), 'and so must REMOVE ALL').toBe(true);
  });

  it('the bulk is the OR of the rows: one non-exempt live row among exempt ones still withholds it', async () => {
    // REMOVE ALL is all-or-nothing on the bridge (`removeAll` refuses if ANY item refuses), so
    // the button must withhold on the same condition rather than on a majority or a count.
    const exempt: StackItemState = { ...item('item-1', 'on-air'), removeExempt: true };
    const live = item('item-2', 'on-air');
    const idle = item('item-3', 'idle');
    expect(await removeAllDisabled([exempt, idle]), 'nothing refusing').toBe(false);
    expect(await removeAllDisabled([exempt, idle, live]), 'one refusing').toBe(true);
  });

  it('🔴 both surfaces resolve through ONE function, for every status × pending × exemption', () => {
    /*
      The identity assertion the block above makes for the predicate, made here for the
      DECISION: the row's outcome is `removeIsRefused` for every cell of the matrix. The bulk
      consumes the same export (the DOM assertions above are what prove it actually does), so
      a third spelling has nowhere to hide.
    */
    for (const status of StackItemStatusSchema.options) {
      for (const pending of [false, true]) {
        for (const removeExempt of [undefined, false, true] as const) {
          const built: StackItemState = {
            ...itemWith(status, { pending }),
            ...(removeExempt === undefined ? {} : { removeExempt }),
          };
          const label = `${status}/${String(pending)}/exempt=${String(removeExempt)}`;
          expect(removeIsRefused(built), `the decision for ${label}`).toBe(
            isOnAirStatus(built) && removeExempt !== true,
          );
          expect(rowRemoveDisabled(built), `the ROW for ${label}`).toBe(removeIsRefused(built));
        }
      }
    }
  });

  it('ABSENT means NOT EXEMPT — the fail-safe direction, pinned so it can never be inverted', () => {
    // A publisher that forgets the field must leave REMOVE refused on a live row, never
    // enable it. This is the one asymmetry in the whole fix and it is the one worth a test.
    const noField = itemWith('on-air');
    expect('removeExempt' in noField).toBe(false);
    expect(removeIsRefused(noField)).toBe(true);
  });
});
