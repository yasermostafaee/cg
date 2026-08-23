// @vitest-environment jsdom
import { StrictMode, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LiveLayerState } from '@cg/shared-ipc';
import type { StackItemState } from '@cg/shared-schema';
import { LiveSourcesPanel } from '../src/renderer/features/layers/LiveSourcesPanel.js';
import {
  hasStrandedLiveLayer,
  liveLayerBlindness,
  liveLayerEmptyView,
  liveLayerRows,
  ownerLabelFor,
  releaseScopeOf,
} from '../src/renderer/features/layers/liveLayerRows.js';
import { clearPortals, clickDialogButton, openDialog } from './support/dialog.js';
import {
  onCommandError,
  onCommandSuccess,
} from '../src/renderer/features/status/commandFeedback.js';
import { connectionsStub, type Reachability } from './support/reachability.js';

/**
 * 🔴 **`B-145` acceptance 1, DISPLAY half (`multibox-layout-switch` `tasks.md` 2.8) —
 * the LIVE SOURCES tab.**
 *
 * `B-145`'s persistence half worked and its display half did not exist: a live plate
 * was CONTROLLABLE but INVISIBLE, so a guest's face could be composited on air with
 * nothing on any screen naming the layer carrying it. These tests pin the surface that
 * closes it — and, more importantly, pin WHERE IT REFUSES TO ACT.
 *
 * The gate here is the mirror image of the station tab's, and the asymmetry is the
 * design rather than an accident:
 *
 *   - a layer whose ROW EXISTS gets NO destructive control. Its verbs are the row's
 *     (repoint, audio, off-air), and `layers.clear` refuses a live-source coordinate
 *     by name after explicitly rejecting an exemption. A clear here would re-open that
 *     door from a second surface.
 *   - a STRANDED layer — one whose owning item the stack no longer carries — gets the
 *     ONE control, because nothing else in the product can reach it. That is `B-145`'s
 *     opening sentence, and the release it offers is the EXISTING `stack.remove`, whose
 *     teardown is documented as unconditional on the slot for exactly this case.
 */

let container: HTMLDivElement | null = null;
let root: Root | null = null;

afterEach(async () => {
  if (root !== null) {
    const r = root;
    await act(async () => {
      r.unmount();
    });
  }
  root = null;
  container?.remove();
  container = null;
  clearPortals();
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

const layer = (over: Partial<LiveLayerState> = {}): LiveLayerState => ({
  channel: 1,
  layer: 10,
  itemId: 'item-a',
  sourceId: 'guest-1',
  role: 'fill',
  producer: 'route://1-1',
  held: false,
  unverified: false,
  ...over,
});

const item = (itemId: string): StackItemState =>
  ({
    itemId,
    templateId: 'tpl-news',
    fields: {},
    status: 'on-air',
    pending: false,
  }) as StackItemState;

/** The stack carries `item-a`, and its template is named — the ordinary case. */
const OWNED = ownerLabelFor([item('item-a')], () => 'IRIB News');
/** The stack carries nothing — every layer is stranded. */
const STRANDED = ownerLabelFor([], () => 'IRIB News');

function stubBridge(
  link: 'live' | 'disconnected',
  removeResult: unknown = { accepted: true },
  reach: Reachability = 'both-up',
): { remove: ReturnType<typeof vi.fn> } {
  const remove = vi.fn(() => Promise.resolve(removeResult));
  const stub = {
    link: {
      status: () => link,
      onStatusChanged: () => () => undefined,
      resyncing: () => false,
      onResyncingChanged: () => () => undefined,
    },
    connections: connectionsStub(reach),
    stack: { remove },
    liveLayers: {
      state: () => Promise.resolve([]),
      onStateChanged: () => () => undefined,
    },
  };
  (window as unknown as { cg: typeof stub }).cg = stub;
  return { remove };
}

async function render(
  layers: LiveLayerState[],
  labelFor: (itemId: string) => string | null = OWNED,
  link: 'live' | 'disconnected' = 'live',
  removeResult: unknown = { accepted: true },
  reach: Reachability = 'both-up',
  stackReady = true,
  stackHasRows = true,
  ledgerReady = true,
  deliveryPending = false,
  /**
   * `add-multibox-audio` — the plate intents. The CALLER's answer in production too (only
   * `LayersPanel` can see the stack), so injecting it here is the same seam.
   */
  volumeOf: (itemId: string, plateId: string) => number | undefined = () => undefined,
  /**
   * 🔴 What the BRIDGE reports PANIC did — not a scope handed DOWN.
   *
   * `PATCH-BX-01` B: PANIC used to take a scope from the panel, resolved from the on-air rows.
   * The door now takes no arguments at all, so the only thing a test can inject is the ANSWER.
   * That is the shape of the fix, and this signature is where it shows.
   */
  panicReport: {
    ok: boolean;
    silenced: number;
    recorded: number;
    rows: { itemId: string; plates: number }[];
    failed: { itemId: string; plateId: string; reason: string }[];
  } = { ok: false, silenced: 0, recorded: 0, rows: [], failed: [] },
): Promise<{
  el: HTMLDivElement;
  remove: ReturnType<typeof vi.fn>;
  onSelectOwner: ReturnType<typeof vi.fn>;
  applied: { itemId: string; volumes: Record<string, number> }[];
  panics: number;
}> {
  const { remove } = stubBridge(link, removeResult, reach);
  const onSelectOwner = vi.fn();
  const applied: { itemId: string; volumes: Record<string, number> }[] = [];
  const counter = { panics: 0 };
  const blind = liveLayerBlindness(
    link === 'disconnected',
    stackReady,
    stackHasRows,
    deliveryPending,
  );
  const rows = liveLayerRows(layers, labelFor, blind, volumeOf);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  const r = root;
  await act(async () => {
    r.render(
      createElement(
        StrictMode,
        null,
        createElement(LiveSourcesPanel, {
          rows,
          ledgerReady,
          blind,
          onSelectOwner,
          onPanic: () => {
            counter.panics += 1;
            return Promise.resolve(panicReport);
          },
          onApplyVolumes: (itemId, volumes) => {
            applied.push({ itemId, volumes });
            return Promise.resolve({ ok: true, refused: [] });
          },
        }),
      ),
    );
  });
  return {
    el: container,
    remove,
    onSelectOwner,
    applied,
    get panics() {
      return counter.panics;
    },
  };
}

const rowFor = (el: HTMLElement, coordinate: string): HTMLElement | null =>
  el.querySelector(`[data-live-layer="${coordinate}"]`);

const buttonIn = (row: Element | null, label: string): HTMLButtonElement | undefined =>
  [...(row?.querySelectorAll('button') ?? [])].find((b) => b.textContent === label);

// ── 4.1 — the layers appear at all ─────────────────────────────────────────────

describe('4.1 — seated live layers appear in the list', () => {
  it('🔴 a seated layer is LISTED, with its coordinate, plate and producer', async () => {
    // The whole defect in one assertion: before this surface existed, a lit band layer
    // produced nothing anywhere in the product.
    const { el } = await render([layer()]);

    const row = rowFor(el, '1-10');
    expect(row, 'the seated layer has a row at all').not.toBeNull();
    expect(row?.textContent).toContain('guest-1');
    expect(row?.textContent).toContain('route://1-1');
    expect(row?.textContent).toContain('On screen');
  });

  it('every seated layer gets its own row, in the order the bridge sent them', async () => {
    const { el } = await render([
      layer({ layer: 10, sourceId: 'guest-1' }),
      layer({ layer: 11, sourceId: 'guest-2' }),
      layer({ layer: 12, sourceId: 'guest-3' }),
    ]);

    expect(
      [...el.querySelectorAll('[data-live-layer]')].map((r) => r.getAttribute('data-live-layer')),
    ).toEqual(['1-10', '1-11', '1-12']);
  });

  it('an EMPTY band shows nothing — and says so, rather than rendering a bare list', async () => {
    const { el } = await render([]);

    expect(el.querySelector('[data-live-layer]')).toBeNull();
    expect(el.textContent).toContain('no live sources seated');
  });

  it('a HELD plate reads as held rather than as on screen', async () => {
    // §12.4: seated, muted, idle, with no hole in front of it. A list that showed this
    // as "on screen" would tell the operator a guest is visible who is not.
    const { el } = await render([layer({ held: true })]);

    expect(rowFor(el, '1-10')?.textContent).toContain('Held');
    expect(rowFor(el, '1-10')?.textContent).not.toContain('On screen');
  });
});

// ── The gate: who may act, and from where ──────────────────────────────────────

describe('🔴 the gate — a row that HAS an owner is shown, never cleared from here', () => {
  it('offers NO release for a layer whose row is on the stack', async () => {
    /*
      Not a disabled button, and not an oversight: the verbs for a seated plate belong
      to its row, and `layers.clear` refuses a live-source coordinate BY NAME having
      weighed and rejected an exemption. Offering one here would be that refusal being
      re-opened from a second surface.
    */
    const { el } = await render([layer()]);

    expect(buttonIn(rowFor(el, '1-10'), 'RELEASE')).toBeUndefined();
    expect(rowFor(el, '1-10')?.getAttribute('data-live-layer-stranded')).toBe('false');
  });

  it('names the owning row and offers a way TO it — the control is the row, so point there', async () => {
    const { el, onSelectOwner } = await render([layer()]);

    expect(rowFor(el, '1-10')?.textContent).toContain('IRIB News');
    const open = buttonIn(rowFor(el, '1-10'), 'OPEN ROW');
    expect(open, 'the operator can reach the verbs from here').toBeDefined();
    await act(async () => {
      open?.click();
      await Promise.resolve();
    });
    expect(onSelectOwner).toHaveBeenCalledWith('item-a');
  });
});

describe('🔴 the gate — a STRANDED layer is the one that gets a control', () => {
  it('reads as stranded and offers RELEASE', async () => {
    /*
      The ledger is adopted from disk while the browser re-delivers its own stack intent
      (B-092), and the two can legitimately disagree — the row was removed while the
      bridge was down, or a second console connects carrying a different stack. The
      result is B-145's opening sentence: a producer lit on air that nothing can name.
    */
    const { el } = await render([layer()], STRANDED);

    const row = rowFor(el, '1-10');
    expect(row?.textContent).toContain('Stranded');
    expect(row?.getAttribute('data-live-layer-stranded')).toBe('true');
    expect(buttonIn(row, 'RELEASE')).toBeDefined();
    expect(buttonIn(row, 'OPEN ROW'), 'there is no row to open').toBeUndefined();
  });

  it('CONFIRMS before releasing, and names what is on the layer', async () => {
    // The most dangerous control on this surface: it takes a live source off air with no
    // outro, and the operator is told exactly what they are cutting.
    const { el, remove } = await render([layer()], STRANDED);

    await act(async () => {
      buttonIn(rowFor(el, '1-10'), 'RELEASE')?.click();
      await Promise.resolve();
    });

    const dialog = openDialog();
    expect(dialog, 'a confirm gate stands between the click and the wire').not.toBeNull();
    expect(dialog?.textContent).toContain('guest-1');
    expect(dialog?.textContent).toContain('route://1-1');
    expect(remove, 'nothing is sent before the operator confirms').not.toHaveBeenCalled();
  });

  it('a CANCELLED confirm sends nothing', async () => {
    const { el, remove } = await render([layer()], STRANDED);

    await act(async () => {
      buttonIn(rowFor(el, '1-10'), 'RELEASE')?.click();
      await Promise.resolve();
    });
    await act(async () => {
      clickDialogButton('Cancel');
      await Promise.resolve();
    });

    expect(remove).not.toHaveBeenCalled();
  });

  it('🔴 confirming releases through the EXISTING `stack.remove`, by itemId', async () => {
    /*
      NOT a new coordinate-addressed clear. `remove(itemId)` calls
      `teardownLiveLayers(itemId)` unconditionally on `slot`, and its own comment says
      why that matters: *"an item whose slot was already released can still own live
      layers, and those are precisely the ones nothing else would ever reach."* The door
      already worked; what was missing was a surface that knew the itemId to hand it.
    */
    const { el, remove } = await render([layer()], STRANDED);

    await act(async () => {
      buttonIn(rowFor(el, '1-10'), 'RELEASE')?.click();
      await Promise.resolve();
    });
    await act(async () => {
      clickDialogButton('Release 1-10');
      await Promise.resolve();
    });

    expect(remove).toHaveBeenCalledWith({ itemId: 'item-a' });
  });
});

describe('🔴 UNVERIFIED — the surface must not state a file claim in the present tense', () => {
  /*
    After a bridge restart EVERY row is a file claim: `bridge.ts` adopts with occupancy
    hard-coded to `unknown`, so `reconcileLiveLayers` drops nothing and marks the lot.
    CasparCG may be black. "On screen" is a present-tense assertion about air and would
    be the console lying on the one surface built to stop it — the B-086 demotion rule,
    which `StackItemStatus` already carries an `unverified` member for.
  */

  it('🔴 an unverified row does NOT read "On screen"', async () => {
    const { el } = await render([layer({ unverified: true })]);

    const row = rowFor(el, '1-10');
    expect(row?.textContent).toContain('Adopted — not confirmed');
    expect(row?.textContent).not.toContain('On screen');
  });

  it('an unverified HELD row is not asserted as held-and-lit either', async () => {
    const { el } = await render([layer({ unverified: true, held: true })]);

    const row = rowFor(el, '1-10');
    expect(row?.textContent).toContain('Adopted — not confirmed');
    expect(
      row?.textContent,
      'the look state is still mentioned, just not asserted as air',
    ).toContain('the current look does not show it');
  });

  it('it still names the owner, and still points at the row', async () => {
    // Unconfirmed is a knowledge gap, not a loss of the handle: the row that owns it is
    // exactly what re-takes and so CONFIRMS it.
    const { el } = await render([layer({ unverified: true })]);

    expect(rowFor(el, '1-10')?.textContent).toContain('IRIB News');
    expect(buttonIn(rowFor(el, '1-10'), 'OPEN ROW')).toBeDefined();
  });

  it('it is NOT coloured and does NOT raise the tab dot', () => {
    // A gap in knowledge is not something wrong, and this palette reserves colour for
    // attention. The word carries it instead.
    const [row] = liveLayerRows([layer({ unverified: true })], OWNED, null);
    expect(row?.needsAttention).toBe(false);
    expect(hasStrandedLiveLayer(liveLayerRows([layer({ unverified: true })], OWNED, null))).toBe(
      false,
    );
  });

  it('an unverified STRANDED row says the layer may already be empty', async () => {
    /*
      The two facts compose, and the wording has to carry both: nothing can reach it AND
      nothing has confirmed it is there. Telling the operator only the first would have
      them cutting a layer that may have been black since the reboot — harmless, but the
      confidence would be unearned.
    */
    const { el } = await render([layer({ unverified: true })], STRANDED);

    const row = rowFor(el, '1-10');
    expect(row?.textContent).toContain('Stranded');
    expect(row?.textContent).toContain('may already be empty');
    expect(
      buttonIn(row, 'RELEASE'),
      'and it is still releasable — that is the remedy',
    ).toBeDefined();
  });
});

describe('🔴 THE STACK HAS NOT ARRIVED — the absence that is not an absence', () => {
  /*
    ── THE DEFECT THIS BLOCK EXISTS FOR, FOUND IN REVIEW OF THIS VERY CHANGE ──────

    STRANDED is decided by an item being ABSENT from the stack. The ledger and the
    stack are TWO INDEPENDENT SNAPSHOTS that land separately, and the ledger can
    arrive first — at mount, and again on every reconnect.

    The first cut of this surface read `items` without its `ready` flag. In that
    window the stack is `[]` because nothing has been delivered, every seated layer
    finds no owner, and the list would have shown EVERY live plate as *"Stranded — no
    row owns this"* with a RELEASE button beside it. An operator acting on that would
    cut a guest who is perfectly well owned by a row that simply had not arrived.

    This renderer has paid for that mistake three times already — `useBridgeSnapshot`
    names the b2 density bug, PVW's white page, and `pruneDrafts` deleting every
    staged edit on remount — and states the rule: *"any consumer that ACTS on the
    absence of an item must read this form and do nothing while `ready` is false."*
    This surface acts on that absence, and the act is taking a live source off air.
  */

  it('🔴 an unarrived stack reads UNKNOWN, never STRANDED', async () => {
    const { el } = await render([layer()], STRANDED, 'live', { accepted: true }, 'both-up', false);

    const row = rowFor(el, '1-10');
    expect(row?.textContent).toContain('Unknown');
    expect(
      row?.textContent,
      'the alarm must not fire on an absence that has not landed',
    ).not.toContain('Stranded');
  });

  it('🔴 …and offers NO release, so the guest cannot be cut on a guess', async () => {
    const { el } = await render([layer()], STRANDED, 'live', { accepted: true }, 'both-up', false);

    expect(buttonIn(rowFor(el, '1-10'), 'RELEASE')).toBeUndefined();
    expect(rowFor(el, '1-10')?.getAttribute('data-live-layer-stranded')).toBe('false');
  });

  it('the two blind states say DIFFERENT things — the console never claims it looked', () => {
    // "I am not connected" and "the list has not come yet" are different facts about
    // our knowledge, and telling the operator the wrong one is the B-094 honesty class.
    const [down] = liveLayerRows([layer()], STRANDED, 'link-down');
    const [waiting] = liveLayerRows([layer()], STRANDED, 'stack-not-arrived');

    expect(down?.detail).toContain('Not connected');
    expect(waiting?.detail).toContain('stack has not arrived');
    expect(down?.releasable).toBe(false);
    expect(waiting?.releasable).toBe(false);
    expect(waiting?.needsAttention, 'not knowing is not a claim that anything is wrong').toBe(
      false,
    );
  });

  it('🔴 the precedence lives in ONE place, and link-down outranks', () => {
    /*
      With the link down the ledger itself is frozen, so the stack's readiness is
      beside the point. Callers pass the two facts and never order them: a second
      caller ordering them differently is how one surface comes to offer a control
      another refuses.
    */
    expect(liveLayerBlindness(true, true, true, false)).toBe('link-down');
    expect(liveLayerBlindness(true, false, true, false)).toBe('link-down');
    expect(liveLayerBlindness(false, false, true, false)).toBe('stack-not-arrived');
    expect(liveLayerBlindness(false, true, true, false)).toBeNull();
  });

  it('once the stack HAS arrived, a genuinely stranded layer is still caught', () => {
    // The guard must not be a blanket suppression: the alarm this surface exists to
    // raise has to survive it.
    const [row] = liveLayerRows([layer()], STRANDED, liveLayerBlindness(false, true, true, false));
    expect(row?.releasable).toBe(true);
    expect(row?.needsAttention).toBe(true);
  });
});

describe('🔴 THE RECONNECT WINDOW — an empty stack is an answer ONLY when delivery has settled', () => {
  /*
    ── SUPERSEDES THE FIRST RULE, ON THE OWNER'S DECISION (2026-08-20) ────────────

    STRANDED is decided by an item's ABSENCE from the stack. Session BG found that
    reading `stackReady` was not enough — it *"latches on the FIRST arrival and never
    clears"*, so after a reconnect it stays true while the stack is `[]` and a restarted
    bridge is already serving its FULL adopted ledger. Every seated layer would have read
    STRANDED with RELEASE armed, in exactly the bridge-restart case B-145 exists for.

    BG's fix suppressed the alarm for EVERY empty stack. That was safe and it cost a true
    positive: an operator who removed every row and stranded a producer got no warning.
    The owner asked for the sharper line, and it turned out to be a FACT rather than an
    inference — `WebSocketRuntime` has always tracked `#resyncing`, it simply never left
    that class. It is now `link.resyncing()` on the bridge contract.

    So: empty + delivery pending → blind. Empty + settled → that IS the answer, and a
    seated layer whose owner is absent from it is genuinely stranded.

    ⚠ The residual, tested nowhere because it is undecidable here: one bridge serves many
    browsers, and this browser cannot know another is about to restore the rows. See the
    `LiveLayerBlindness` doc.
  */

  it('🔴 empty AND still delivering: no strand, no control', async () => {
    const { el } = await render(
      [layer()],
      STRANDED,
      'live',
      { accepted: true },
      'both-up',
      true,
      false,
      true,
      true,
    );

    const row = rowFor(el, '1-10');
    expect(row?.textContent).toContain('Unknown');
    expect(row?.textContent, 'the reconnect window must not read as an emergency').not.toContain(
      'Stranded',
    );
    expect(buttonIn(row, 'RELEASE')).toBeUndefined();
  });

  it('🔴 empty AND settled: the alarm is BACK — this is what the owner asked for', async () => {
    const { el } = await render(
      [layer()],
      STRANDED,
      'live',
      { accepted: true },
      'both-up',
      true,
      false,
      true,
      false,
    );

    const row = rowFor(el, '1-10');
    expect(row?.textContent).toContain('Stranded');
    expect(buttonIn(row, 'RELEASE'), 'and it is actionable again').toBeDefined();
  });

  it('the precedence covers all four facts, in one place', () => {
    // link-down outranks everything: with the link down the ledger itself is stale, so the
    // stack's state is beside the point.
    expect(liveLayerBlindness(true, true, true, false)).toBe('link-down');
    expect(liveLayerBlindness(true, false, false, true)).toBe('link-down');
    expect(liveLayerBlindness(false, false, true, false)).toBe('stack-not-arrived');
    expect(liveLayerBlindness(false, true, false, true)).toBe('stack-delivery-pending');
    // …and the two that are NOT blindness.
    expect(liveLayerBlindness(false, true, false, false), 'settled-empty is an answer').toBeNull();
    expect(liveLayerBlindness(false, true, true, false)).toBeNull();
  });

  it('🔴 a pending delivery does NOT mask a stack that has rows', () => {
    /*
      The guard is scoped to the EMPTY case on purpose. A stack that already carries rows
      can bear witness that a particular itemId is not among them, whether or not more are
      still arriving — and suppressing the alarm through every resync would be BG's
      over-suppression back again under a new name.
    */
    const oneOtherRow = ownerLabelFor([item('item-other')], () => 'Something Else');
    const [row] = liveLayerRows(
      [layer()],
      oneOtherRow,
      liveLayerBlindness(false, true, true, true),
    );

    expect(row?.releasable).toBe(true);
    expect(row?.needsAttention).toBe(true);
  });

  it('…and the three blind states say DIFFERENT things, so the console never implies it looked', () => {
    const detail = (b: 'link-down' | 'stack-not-arrived' | 'stack-delivery-pending'): string =>
      liveLayerRows([layer()], STRANDED, b)[0]?.detail ?? '';

    expect(detail('link-down')).toContain('Not connected');
    expect(detail('stack-not-arrived')).toContain('has not arrived');
    expect(detail('stack-delivery-pending')).toContain('still receiving');
    // None is an alarm: not knowing is not a claim that anything is wrong.
    for (const b of ['link-down', 'stack-not-arrived', 'stack-delivery-pending'] as const) {
      expect(liveLayerRows([layer()], STRANDED, b)[0]?.needsAttention).toBe(false);
    }
  });
});

describe('🔴 THE EMPTY LIST — "I have not looked" is not "nothing is there" (B-094)', () => {
  /*
    The per-row masking rides on ROWS, and an empty ledger produces no rows to carry
    it. So the one branch that speaks for the WHOLE list was the one branch that
    guessed. With the link down `useLiveLayers` never pulls — it keeps the default
    `pullWhileDisconnected: false` — so the value sits at the module-level EMPTY, and
    the panel would have told an operator with a dead bridge, definitely, that no guest
    is composited. That is the exact lie this whole tab exists to end.
  */

  it('🔴 with the link DOWN it refuses to claim nothing is seated', async () => {
    const { el } = await render([], STRANDED, 'disconnected');

    expect(el.textContent).toContain('Not connected');
    expect(el.textContent).not.toContain('has no live sources seated');
    expect(el.querySelector('[data-live-layers-known="false"]')).not.toBeNull();
  });

  it('🔴 before the ledger ARRIVES it says so, rather than showing an empty list', async () => {
    const { el } = await render(
      [],
      OWNED,
      'live',
      { accepted: true },
      'both-up',
      true,
      true,
      false,
    );

    expect(el.textContent).toContain('has not arrived');
    expect(el.textContent).not.toContain('has no live sources seated');
    expect(el.querySelector('[data-live-layers-known="false"]')).not.toBeNull();
  });

  it('an ARRIVED and genuinely empty ledger DOES report nothing seated', async () => {
    // The guard must not swallow the real answer — otherwise the tab could never say
    // the true and useful thing.
    const { el } = await render([]);

    expect(el.textContent).toContain('no live sources seated');
    expect(el.querySelector('[data-live-layers-known="true"]')).not.toBeNull();
  });

  it('the empty view is decided by the LEDGER’s readiness, not the stack’s', () => {
    expect(liveLayerEmptyView(null, true).known).toBe(true);
    expect(liveLayerEmptyView(null, false).known).toBe(false);
    expect(liveLayerEmptyView('link-down', true).known).toBe(false);
    // A blind STACK says nothing about whether the ledger is empty.
    expect(liveLayerEmptyView('stack-not-arrived', true).known).toBe(true);
  });
});

describe('🔴 RELEASE IS ITEM-SCOPED — the wording must not name one layer and cut two', () => {
  /*
    `stack.remove(itemId)` reaches `teardownLiveLayers`, which loops over EVERY record
    the item owns, sending `out` + `mixerClear` for each. So releasing 1-10 also clears
    1-11 when both belong to the same stranded item. A confirm naming one coordinate
    while cutting two is the product lying about the scope of its most destructive
    control — a second guest goes to black with no warning.
  */
  const twoLayers = [
    layer({ layer: 10, sourceId: 'guest-1' }),
    layer({ layer: 11, sourceId: 'guest-2' }),
  ];

  it('releaseScopeOf returns every layer the item owns', () => {
    const rows = liveLayerRows(twoLayers, STRANDED, null);
    expect(releaseScopeOf(rows, 'item-a').map((r) => r.coordinate)).toEqual(['1-10', '1-11']);
  });

  it('🔴 the confirm names BOTH coordinates and both plates', async () => {
    const { el } = await render(twoLayers, STRANDED);

    await act(async () => {
      buttonIn(rowFor(el, '1-10'), 'RELEASE')?.click();
      await Promise.resolve();
    });

    const dialog = openDialog();
    expect(dialog?.textContent).toContain('1-10');
    expect(dialog?.textContent).toContain('1-11');
    expect(dialog?.textContent).toContain('guest-1');
    expect(dialog?.textContent).toContain('guest-2');
    expect(dialog?.textContent, 'and says plainly that one release takes both').toContain(
      'releasing one releases them all',
    );
  });

  it('the accessible name states the same scope the confirm will', async () => {
    const { el } = await render(twoLayers, STRANDED);
    const btn = buttonIn(rowFor(el, '1-10'), 'RELEASE');
    expect(btn?.getAttribute('aria-label')).toContain('1-10, 1-11');
  });

  it('a single-layer item keeps the singular wording', async () => {
    const { el } = await render([layer()], STRANDED);
    const btn = buttonIn(rowFor(el, '1-10'), 'RELEASE');
    expect(btn?.getAttribute('aria-label')).toBe('Release stranded live layer 1-10');
  });
});

describe('the link is down — a frozen ledger is not evidence', () => {
  it('🔴 every row reads UNKNOWN and NOTHING is offered', async () => {
    /*
      With the SPA↔bridge link down this is the last ledger the bridge sent, and the
      stack beside it is equally frozen (B-087). A stranded verdict computed from two
      stale facts would be a guess presented as an alarm — and the release it unlocks
      could not leave the browser anyway.
    */
    const { el } = await render([layer()], STRANDED, 'disconnected');

    const row = rowFor(el, '1-10');
    expect(row?.textContent).toContain('Unknown');
    expect(row?.textContent).not.toContain('Stranded');
    expect(buttonIn(row, 'RELEASE')).toBeUndefined();
    expect(buttonIn(row, 'OPEN ROW')).toBeUndefined();
  });
});

// ── The pure gate, without a DOM ───────────────────────────────────────────────

describe('liveLayerRows — the gate as pure functions', () => {
  it('an owner on the stack is never releasable and never raises attention', () => {
    const [row] = liveLayerRows([layer()], OWNED, null);
    expect(row?.releasable).toBe(false);
    expect(row?.needsAttention).toBe(false);
    expect(row?.ownerLabel).toBe('IRIB News');
  });

  it('an owner the stack does not carry is releasable AND raises attention', () => {
    const [row] = liveLayerRows([layer()], STRANDED, null);
    expect(row?.releasable).toBe(true);
    expect(row?.needsAttention).toBe(true);
    expect(row?.ownerLabel).toBeNull();
  });

  it('🔴 linkDown is checked FIRST — it masks the stranded verdict, not the other way round', () => {
    const [row] = liveLayerRows([layer()], STRANDED, 'link-down');
    expect(row?.headline).toBe('Unknown');
    expect(row?.releasable).toBe(false);
    expect(row?.needsAttention).toBe(false);
  });

  it('a HELD plate keeps its owner and stays non-actionable', () => {
    const [row] = liveLayerRows([layer({ held: true })], OWNED, null);
    expect(row?.headline).toContain('Held');
    expect(row?.releasable).toBe(false);
    expect(row?.needsAttention).toBe(false);
  });

  it('🔴 the tab dot reads the SAME rows the list renders', () => {
    /*
      Not a second `.some()` over the payload. This dot's claim is "a live producer is on
      air with no handle", and a dot derived independently would be free to disagree with
      every row beneath it — raised over a list that shows nothing wrong, or dark over one
      that does.
    */
    expect(hasStrandedLiveLayer(liveLayerRows([layer()], OWNED, null))).toBe(false);
    expect(hasStrandedLiveLayer(liveLayerRows([layer()], STRANDED, null))).toBe(true);
    // …and it goes dark with the link, because every row does.
    expect(hasStrandedLiveLayer(liveLayerRows([layer()], STRANDED, 'link-down'))).toBe(false);
  });

  it('ownerLabelFor answers null for an item the stack has dropped — the only stranded test', () => {
    const labelFor = ownerLabelFor([item('item-a')], () => 'IRIB News');
    expect(labelFor('item-a')).toBe('IRIB News');
    expect(labelFor('item-gone')).toBeNull();
  });

  it('an item whose template is unknown falls back to its ID, never to "unknown template"', () => {
    /*
      An id is ugly, but it is the HANDLE — and a row labelled "Unknown template" would be
      indistinguishable at a glance from the stranded state, which is the one thing on this
      surface that means an emergency.
    */
    const labelFor = ownerLabelFor([item('item-a')], () => undefined);
    expect(labelFor('item-a')).toBe('item-a');
  });
});

// ── `add-multibox-audio` — the always-visible per-plate audio ──────────────────

const stripIn = (el: HTMLElement, plate: string): HTMLElement | null =>
  el.querySelector(`[data-plate-audio="${plate}"]`);

const stateOf = (el: HTMLElement, plate: string): string | null =>
  stripIn(el, plate)
    ?.querySelector('[data-plate-audio-state]')
    ?.getAttribute('data-plate-audio-state') ?? null;

const raised =
  (map: Record<string, Record<string, number>>) =>
  (itemId: string, plateId: string): number | undefined =>
    map[itemId]?.[plateId];

describe('add-multibox-audio — audio is visible without opening anything', () => {
  it('🔴 every seated plate carries a strip, with a state pill and a % readout', async () => {
    // The defect this closes: `plateVolumes` was on the wire and no surface outside a
    // dialog read it, so the console's answer to "is this guest audible?" was "open a
    // dialog and look" — for every row, one at a time.
    const { el } = await render(
      [layer({ layer: 10, sourceId: 'guest-1' }), layer({ layer: 11, sourceId: 'guest-2' })],
      OWNED,
      'live',
      { accepted: true },
      'both-up',
      true,
      true,
      true,
      false,
      raised({ 'item-a': { 'guest-1': 1 } }),
    );

    expect(stateOf(el, 'guest-1')).toBe('audible');
    expect(stripIn(el, 'guest-1')?.textContent).toContain('100%');
    expect(stateOf(el, 'guest-2')).toBe('silent');
    expect(stripIn(el, 'guest-2')?.textContent).toContain('0%');
  });

  it('🔴 a chosen 0 and an untouched plate BOTH read silent — and neither reads raised', async () => {
    // They are different states and only one was CHOSEN; what must never happen is
    // either of them reading as raised because a truthiness test folded them.
    const { el } = await render(
      [layer({ layer: 10, sourceId: 'guest-1' }), layer({ layer: 11, sourceId: 'guest-2' })],
      OWNED,
      'live',
      { accepted: true },
      'both-up',
      true,
      true,
      true,
      false,
      raised({ 'item-a': { 'guest-1': 0 } }),
    );

    expect(stateOf(el, 'guest-1')).toBe('silent');
    expect(stateOf(el, 'guest-2')).toBe('silent');
  });

  it('🔴 a HELD plate reads ARMED-not-audible and its controls stay LIVE', async () => {
    // Grey reads as disabled. The control stays live because arming a held plate's audio
    // before switching to the look that shows it is the affordance the mute rule exists to
    // preserve — and the wording must say WHY it is silent, or the operator goes looking
    // for a fault in the input.
    const { el } = await render(
      [layer({ layer: 10, sourceId: 'guest-1', held: true })],
      OWNED,
      'live',
      { accepted: true },
      'both-up',
      true,
      true,
      true,
      false,
      raised({ 'item-a': { 'guest-1': 1 } }),
    );

    const strip = stripIn(el, 'guest-1');
    expect(strip?.textContent).toMatch(/HIDDEN BY THIS LOOK/i);
    expect(strip?.textContent).toMatch(/ARMED/i);
    expect(strip?.querySelector('input[type="range"]')?.hasAttribute('disabled')).toBe(false);
    expect(buttonIn(strip, 'ON')?.disabled).toBe(false);
    expect(buttonIn(strip, 'SOLO')).toBeDefined();
  });

  it('🔴 nothing on this surface is drawn as a METER', async () => {
    // There is no per-input level to draw until the plant walk answers W7/W8: CasparCG's
    // programme channel reports ONE peak pair for the whole channel. A bar here would claim
    // "sound is present" from data that only says "we asked for it".
    const { el } = await render(
      [layer()],
      OWNED,
      'live',
      { accepted: true },
      'both-up',
      true,
      true,
      true,
      false,
      raised({ 'item-a': { 'guest-1': 1 } }),
    );

    expect(el.querySelector('meter')).toBeNull();
    expect(el.querySelector('progress')).toBeNull();
    expect(el.querySelector('[role="meter"]')).toBeNull();
    expect(el.querySelector('[role="progressbar"]')).toBeNull();
  });

  it('🔴 the state ATTRIBUTE and the PILL answer from ONE predicate, on the PUBLISHED value', async () => {
    /*
      Golden rule 6, and the two spellings had already come apart. The attribute was derived
      by a local ternary over the OPTIMISTIC drag value while the pill beside it read the
      PUBLISHED one — so mid-drag the row reported `audible` under a pill that said SILENT.
      Both now call `plateAudioState`, on the value the bridge has actually accepted.

      Dragging WITHOUT releasing is the whole point: that is the only window in which the two
      values differ at all, which is exactly why the drift was invisible.
    */
    const { el } = await render([layer()]);
    const slider = stripIn(el, 'guest-1')?.querySelector<HTMLInputElement>('input[type="range"]');

    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      setter?.call(slider, '60');
      slider?.dispatchEvent(new Event('input', { bubbles: true }));
      await Promise.resolve();
    });

    // The fader has MOVED — the operator sees their own drag…
    expect(slider?.value).toBe('60');
    expect(stripIn(el, 'guest-1')?.textContent).toContain('60%');
    // …and the STATE has not, because nothing has been committed. The pill and the attribute
    // say the same thing, which is the property that broke.
    expect(stateOf(el, 'guest-1')).toBe('silent');
    expect(stripIn(el, 'guest-1')?.textContent).toContain('SILENT');
  });

  it('🔴 SOLO sends ONE map — 1 for the plate, 0 for every sibling of the same item', async () => {
    const { el, applied } = await render([
      layer({ layer: 10, sourceId: 'guest-1' }),
      layer({ layer: 11, sourceId: 'guest-2' }),
      layer({ layer: 12, sourceId: 'guest-3' }),
    ]);

    await act(async () => {
      buttonIn(stripIn(el, 'guest-2'), 'SOLO')?.click();
      await Promise.resolve();
    });

    expect(applied).toHaveLength(1);
    expect(applied[0]).toEqual({
      itemId: 'item-a',
      volumes: { 'guest-2': 1, 'guest-1': 0, 'guest-3': 0 },
    });
  });

  it('SOLO does not reach a DIFFERENT item’s plates', async () => {
    // The scope is the ROW's item, not the channel. Soloing one row's guest must not
    // silence another row's — two rows can be on air at once and they are separate graphics.
    const both = ownerLabelFor([item('item-a'), item('item-b')], () => 'IRIB News');
    const { el, applied } = await render(
      [
        layer({ layer: 10, itemId: 'item-a', sourceId: 'guest-1' }),
        layer({ layer: 11, itemId: 'item-a', sourceId: 'guest-2' }),
        layer({ layer: 20, itemId: 'item-b', sourceId: 'guest-9' }),
      ],
      both,
    );

    await act(async () => {
      buttonIn(stripIn(el, 'guest-1'), 'SOLO')?.click();
      await Promise.resolve();
    });

    expect(applied).toEqual([{ itemId: 'item-a', volumes: { 'guest-1': 1, 'guest-2': 0 } }]);
    expect(Object.keys(applied[0]?.volumes ?? {})).not.toContain('guest-9');
  });

  it('SOLO is disabled on a row that owns ONE plate — there is nothing to solo against', async () => {
    const { el } = await render([layer()]);
    expect(buttonIn(stripIn(el, 'guest-1'), 'SOLO')?.disabled).toBe(true);
  });

  it('🔴 ON writes 1 and OFF writes 0 — through the same MAP door', async () => {
    const { el, applied } = await render([layer()]);

    await act(async () => {
      buttonIn(stripIn(el, 'guest-1'), 'ON')?.click();
      await Promise.resolve();
    });
    await act(async () => {
      buttonIn(stripIn(el, 'guest-1'), 'OFF')?.click();
      await Promise.resolve();
    });

    expect(applied.map((a) => a.volumes)).toEqual([{ 'guest-1': 1 }, { 'guest-1': 0 }]);
  });

  it('ON says, on the control itself, that it is FULL volume and not the previous level', async () => {
    const { el } = await render([layer()]);
    const on = buttonIn(stripIn(el, 'guest-1'), 'ON');
    expect(on?.getAttribute('aria-label')).toMatch(/not the previous level/i);
    expect(on?.getAttribute('title')).toMatch(/full volume/i);
  });

  it('🔴 a BLIND row shows no strip at all — SILENT is a claim', async () => {
    // The intent lives on the stack, a separate snapshot. Before it lands, printing SILENT
    // for a plate that may be raised is the B-094 class on the one axis an operator cannot
    // check by looking at a monitor.
    const { el } = await render(
      [layer()],
      OWNED,
      'disconnected',
      { accepted: true },
      'both-up',
      true,
      true,
      true,
      false,
      raised({ 'item-a': { 'guest-1': 1 } }),
    );
    expect(stripIn(el, 'guest-1')).toBeNull();
  });

  it('a STRANDED row shows no strip either — no item owns it, so no verb reaches it', async () => {
    const { el } = await render([layer()], STRANDED);
    expect(stripIn(el, 'guest-1')).toBeNull();
    // …and it still gets the one control that CAN reach it.
    expect(buttonIn(rowFor(el, '1-10'), 'RELEASE')).toBeDefined();
  });
});

/**
 * `PATCH-BX-01` B — **PANIC'S SCOPE IS THE BRIDGE'S LEDGER, AND THE PANEL NO LONGER CHOOSES
 * IT.**
 *
 * The panel used to resolve the scope from the ON-AIR rows and hand it down. That was `B-122`'s
 * shape one verb along — an emergency control gated on believed status — and it cost two real
 * cases: a row in the `exitRehearse` window (plates seated and potentially AUDIBLE, status not
 * on air) was never reached, and a browser whose ledger snapshot had not yet arrived would have
 * addressed nothing while reporting success.
 *
 * These tests therefore assert about the DOOR and the WORDING. That the scope is right is a
 * property of the bridge and is pinned in
 * `tools/caspar-bridge/tests/live-plate-panic.integration.test.ts`, where a wire can be observed.
 */
describe('PATCH-BX-01 — PANIC asks the bridge, and reads its answer out loud', () => {
  const panicButton = (el: HTMLElement): HTMLButtonElement | undefined =>
    [...el.querySelectorAll('button')].find((b) => b.textContent === 'SILENCE ALL BOXES');

  /**
   * The command feedback channel, captured directly.
   *
   * ⚠ The toast COMPONENT (`CommandToast`) is not mounted by this harness, so the wording never
   * reaches `document.body` here. Subscribing to the channel is the honest way to assert what
   * the operator is told without dragging an unrelated component into every case — and it also
   * separates the two channels, which matters: a refusal on the ERROR channel and a completion
   * on the SUCCESS channel are different claims, and a test that read one blob of text could
   * not tell them apart.
   */
  function captureFeedback(): { errors: string[]; successes: string[]; stop: () => void } {
    const errors: string[] = [];
    const successes: string[] = [];
    const offError = onCommandError((m) => errors.push(m));
    const offSuccess = onCommandSuccess((m) => successes.push(m));
    return {
      errors,
      successes,
      stop: () => {
        offError();
        offSuccess();
      },
    };
  }

  it('🔴 one press = ONE call to the bridge, with NO scope of the panel’s choosing', async () => {
    const captured = await render(
      [layer({ layer: 10, sourceId: 'guest-1' }), layer({ layer: 11, sourceId: 'guest-2' })],
      OWNED,
      'live',
      { accepted: true },
      'both-up',
      true,
      true,
      true,
      false,
      () => undefined,
      { ok: true, silenced: 2, recorded: 2, rows: [{ itemId: 'item-a', plates: 2 }], failed: [] },
    );

    await act(async () => {
      panicButton(captured.el)?.click();
      await Promise.resolve();
    });

    expect(captured.panics).toBe(1);
    // …and NOT through the per-row map door. A panel that still fanned out per row would be
    // choosing the scope by another name.
    expect(captured.applied).toEqual([]);
  });

  it('🔴 it is offered even when NO row reads as on air — that is the whole fix', async () => {
    /*
      The `exitRehearse` window: plates seated, the item present, and nothing about it saying
      "on air". Under the old scope this press addressed nothing. The panel must not gate it.
    */
    const offAir = ownerLabelFor(
      [{ ...item('item-a'), status: 'loaded' } as StackItemState],
      () => 'IRIB News',
    );
    const captured = await render(
      [layer()],
      offAir,
      'live',
      { accepted: true },
      'both-up',
      true,
      true,
      true,
      false,
      () => undefined,
      { ok: true, silenced: 1, recorded: 1, rows: [{ itemId: 'item-a', plates: 1 }], failed: [] },
    );

    expect(panicButton(captured.el)?.disabled, 'the press is not gated on any status').toBe(false);
    await act(async () => {
      panicButton(captured.el)?.click();
      await Promise.resolve();
    });
    expect(captured.panics).toBe(1);
  });

  it('names the ROWS it addressed — under a ledger scope they can be unpredicted ones', async () => {
    const { el } = await render(
      [layer()],
      OWNED,
      'live',
      { accepted: true },
      'both-up',
      true,
      true,
      true,
      false,
      () => undefined,
      {
        ok: true,
        silenced: 3,
        recorded: 3,
        rows: [
          { itemId: 'item-a', plates: 2 },
          { itemId: 'item-b', plates: 1 },
        ],
        failed: [],
      },
    );

    const fb = captureFeedback();
    await act(async () => {
      panicButton(el)?.click();
      await Promise.resolve();
    });
    fb.stop();

    expect(fb.successes.join(' ')).toContain('Silenced 3 plate(s)');
    expect(fb.successes.join(' ')).toContain('2 row(s)');
    expect(fb.errors, 'a completed panic is not also an error').toEqual([]);
  });

  it('🔴 distinguishes what reached the WIRE from what was only RECORDED (held plates)', async () => {
    // A held plate is already silent, so nothing is sent for it — but its intent goes to 0 so
    // it stays silent when its look comes back. Reporting 4 "silenced" would overstate what
    // left air; saying nothing about the other 2 would hide a real effect.
    const { el } = await render(
      [layer()],
      OWNED,
      'live',
      { accepted: true },
      'both-up',
      true,
      true,
      true,
      false,
      () => undefined,
      { ok: true, silenced: 2, recorded: 4, rows: [{ itemId: 'item-a', plates: 4 }], failed: [] },
    );

    const fb = captureFeedback();
    await act(async () => {
      panicButton(el)?.click();
      await Promise.resolve();
    });
    fb.stop();

    const said = fb.successes.join(' ');
    expect(said, 'it must not claim 4 reached air').toContain('Silenced 2 plate(s)');
    expect(said).toMatch(/2 already silent in the current look/i);
  });

  it('🔴 a bridge holding NO live plates is NOT reported as a success', async () => {
    // B-122's failure exactly: an operator told the escape hatch worked while nothing was sent.
    const { el } = await render([layer()]);

    const fb = captureFeedback();
    await act(async () => {
      panicButton(el)?.click();
      await Promise.resolve();
    });
    fb.stop();

    expect(fb.errors.join(' ')).toMatch(/nothing was sent/i);
    // 🔴 On the SUCCESS channel, silence. A no-op reported as a completed panic is exactly the
    // lie B-122 names — and asserting on one blob of page text could not tell the two apart.
    expect(fb.successes).toEqual([]);
  });

  it('a plate that did not take is NAMED, and the press is not called a success', async () => {
    const { el } = await render(
      [layer()],
      OWNED,
      'live',
      { accepted: true },
      'both-up',
      true,
      true,
      true,
      false,
      () => undefined,
      {
        ok: false,
        silenced: 1,
        recorded: 1,
        rows: [{ itemId: 'item-a', plates: 2 }],
        failed: [{ itemId: 'item-a', plateId: 'guest-2', reason: 'amcp-error' }],
      },
    );

    const fb = captureFeedback();
    await act(async () => {
      panicButton(el)?.click();
      await Promise.resolve();
    });
    fb.stop();

    // It NAMES the plate. "The panic failed" would have the operator re-press it; saying
    // nothing would leave a guest audible with the console reporting a success.
    expect(fb.errors.join(' ')).toContain('guest-2');
    expect(fb.errors.join(' ')).toMatch(/may still be audible/i);
    expect(fb.successes).toEqual([]);
  });

  it('PANIC has no confirm — an emergency control behind a dialog is one that does not happen', async () => {
    const { el } = await render(
      [layer()],
      OWNED,
      'live',
      { accepted: true },
      'both-up',
      true,
      true,
      true,
      false,
      () => undefined,
      { ok: true, silenced: 1, recorded: 1, rows: [{ itemId: 'item-a', plates: 1 }], failed: [] },
    );

    await act(async () => {
      panicButton(el)?.click();
      await Promise.resolve();
    });

    expect(openDialog(), 'no confirm dialog stands between the press and the silence').toBeNull();
  });

  it('PANIC is disabled with the BRIDGE down — the command cannot leave the browser', async () => {
    const { el } = await render([layer()], OWNED, 'disconnected');
    expect(panicButton(el)?.disabled).toBe(true);
  });

  it('the control SAYS its scope is wider than what this console shows as on air', async () => {
    const { el } = await render([layer()]);
    const title = panicButton(el)?.getAttribute('title') ?? '';
    expect(title).toMatch(/every live plate the bridge has seated/i);
    expect(title, 'an operator must not be surprised by the wider reach').toMatch(
      /rows this console does not show as on air/i,
    );
  });
});
