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
  liveLayerRows,
  ownerLabelFor,
} from '../src/renderer/features/layers/liveLayerRows.js';
import { clearPortals, clickDialogButton, openDialog } from './support/dialog.js';
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
    link: { status: () => link, onStatusChanged: () => () => undefined },
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
): Promise<{
  el: HTMLDivElement;
  remove: ReturnType<typeof vi.fn>;
  onSelectOwner: ReturnType<typeof vi.fn>;
}> {
  const { remove } = stubBridge(link, removeResult, reach);
  const onSelectOwner = vi.fn();
  const rows = liveLayerRows(layers, labelFor, link === 'disconnected');
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  const r = root;
  await act(async () => {
    r.render(
      createElement(StrictMode, null, createElement(LiveSourcesPanel, { rows, onSelectOwner })),
    );
  });
  return { el: container, remove, onSelectOwner };
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
    const [row] = liveLayerRows([layer()], OWNED, false);
    expect(row?.releasable).toBe(false);
    expect(row?.needsAttention).toBe(false);
    expect(row?.ownerLabel).toBe('IRIB News');
  });

  it('an owner the stack does not carry is releasable AND raises attention', () => {
    const [row] = liveLayerRows([layer()], STRANDED, false);
    expect(row?.releasable).toBe(true);
    expect(row?.needsAttention).toBe(true);
    expect(row?.ownerLabel).toBeNull();
  });

  it('🔴 linkDown is checked FIRST — it masks the stranded verdict, not the other way round', () => {
    const [row] = liveLayerRows([layer()], STRANDED, true);
    expect(row?.headline).toBe('Unknown');
    expect(row?.releasable).toBe(false);
    expect(row?.needsAttention).toBe(false);
  });

  it('a HELD plate keeps its owner and stays non-actionable', () => {
    const [row] = liveLayerRows([layer({ held: true })], OWNED, false);
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
    expect(hasStrandedLiveLayer(liveLayerRows([layer()], OWNED, false))).toBe(false);
    expect(hasStrandedLiveLayer(liveLayerRows([layer()], STRANDED, false))).toBe(true);
    // …and it goes dark with the link, because every row does.
    expect(hasStrandedLiveLayer(liveLayerRows([layer()], STRANDED, true))).toBe(false);
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
