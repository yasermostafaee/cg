// @vitest-environment jsdom
import { StrictMode, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FixedLayerBank, FixedSlotState } from '@cg/shared-ipc';
import type { StackItemState } from '@cg/shared-schema';
import { LayersPanel } from '../src/renderer/features/layers/LayersPanel.js';
import { clearPortals } from './support/dialog.js';
import { connectionsStub } from './support/reachability.js';

/**
 * §0 — ONE PANEL-LEVEL NOTICE, because thirty subtle signals are worse than one.
 *
 * The rows each say LOADING and each hold their verbs, honestly and individually.
 * That is right and it is not what an operator's eye catches: thirty rows he has
 * to read one at a time is not a signal, it is a search. The notice is the signal.
 *
 * ── WHAT THESE SPECS ACTUALLY PIN ───────────────────────────────────────────
 *
 * Not "a notice exists". The requirement is that it is driven by the SAME
 * `awaiting` condition as the rows — one source, so the two cannot disagree — so
 * the assertions are all about AGREEMENT: the notice is present exactly when a row
 * is waiting, and absent exactly when none is. A notice on its own timer or its own
 * readiness flag would pass a presence test and fail every one of these.
 *
 * The layout-stability rule is asserted STRUCTURALLY (the strip is in the DOM at a
 * fixed height in both states) rather than by measurement, because jsdom computes
 * no layout. The structure is the mechanism: a strip that is always present and
 * always the same height cannot move the rows beneath it when its content changes.
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
  vi.restoreAllMocks();
});

const BANK: FixedLayerBank = { channel: 1, start: 70, count: 2, visible: [70, 71], aliases: {} };

/** Layer 70 is BOUND to an item; layer 71 genuinely carries nothing. */
const SLOTS: FixedSlotState[] = [
  {
    channel: 1,
    layer: 70,
    observed: { kind: 'producer', producer: 'html' },
    binding: { itemId: 'item-1', templateType: 'clock', templateId: 'tpl-1' },
  },
  { channel: 1, layer: 71, observed: { kind: 'empty' }, binding: null },
];

/** No bound rows at all — the case in which the notice must never appear. */
const UNBOUND_ONLY: FixedSlotState[] = [
  { channel: 1, layer: 70, observed: { kind: 'empty' }, binding: null },
  { channel: 1, layer: 71, observed: { kind: 'empty' }, binding: null },
];

const ITEM: StackItemState = {
  itemId: 'item-1',
  templateId: 'tpl-1',
  fields: {},
  status: 'loaded',
  pending: false,
  slot: { channel: 1, layer: 70, server: 'primary' },
};

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

/**
 * Fixed-layer snapshots answer immediately; the STACK is held open until the spec
 * resolves it. That split reproduces the exact window the owner sees — the rows are
 * on screen and their contents are not — and it makes the arrival a step the test
 * TAKES rather than a race it hopes to win.
 */
function stubBridge(slots: FixedSlotState[] = SLOTS): { stack: Deferred<StackItemState[]> } {
  const stack = deferred<StackItemState[]>();
  const stub = {
    link: { status: () => 'live', onStatusChanged: () => () => undefined },
    connections: connectionsStub('both-up'),
    templates: { list: () => Promise.resolve([]), onChanged: () => () => undefined },
    fixedLayers: {
      config: () => Promise.resolve(BANK),
      state: () => Promise.resolve(slots),
      onConfigChanged: () => () => undefined,
      onStateChanged: () => () => undefined,
    },
    rehearse: { state: () => Promise.resolve([]), onStateChanged: () => () => undefined },
    playoutLayers: {
      state: () => Promise.resolve([]),
      clear: () => Promise.resolve({ ok: true }),
      onStateChanged: () => () => undefined,
    },
    stack: {
      snapshot: () => stack.promise,
      onStateChanged: () => () => undefined,
      clearAll: () => Promise.resolve({ ok: true, cleared: 0 }),
      removeAll: () => Promise.resolve({ ok: true, removed: 0 }),
      take: () => Promise.resolve({ accepted: true }),
      update: () => Promise.resolve({ accepted: true }),
      out: () => Promise.resolve({ accepted: true }),
      remove: () => Promise.resolve({ accepted: true }),
    },
  };
  (window as unknown as { cg: typeof stub }).cg = stub;
  return { stack };
}

async function renderPanel(): Promise<HTMLDivElement> {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  const r = root;
  await act(async () => {
    r.render(
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
            setInspectorPx: () => undefined,
            setFocus: () => undefined,
            reset: () => undefined,
            customized: false,
          },
          inspectorOpen: false,
          onToggleInspector: () => undefined,
          onUpdate: () => Promise.resolve({ accepted: true }),
        }),
      ),
    );
    await Promise.resolve();
    await Promise.resolve();
  });
  return container;
}

async function settle(): Promise<void> {
  await act(async () => {
    for (let i = 0; i < 6; i++) await Promise.resolve();
  });
}

/** Is the panel-level notice showing? */
const notice = (el: HTMLElement): Element | null => el.querySelector('[data-layers-awaiting]');
/** Are any ROWS waiting? The other half of the agreement. */
const rowsWaiting = (el: HTMLElement): number =>
  [...el.querySelectorAll('[data-layer]')].filter((r) => (r.textContent ?? '').includes('LOADING'))
    .length;

describe('§0 — one panel-level notice while the row states are not yet known', () => {
  it('is present while a row is awaiting, and gone once the data lands', async () => {
    const bridge = stubBridge();
    const el = await renderPanel();
    await settle();

    // The window is genuinely open: the rows are on screen, the stack is not in.
    expect(el.querySelectorAll('[data-layer]').length).toBe(2);
    expect(notice(el), 'no panel-level notice during the waiting window').not.toBeNull();
    expect(notice(el)?.textContent ?? '').toMatch(/have not arrived yet/i);

    await act(async () => {
      bridge.stack.resolve([ITEM]);
      await Promise.resolve();
    });
    await settle();

    expect(notice(el), 'the notice outlived the data it was waiting for').toBeNull();
  });

  /**
   * THE POINT OF USING ONE SOURCE, asserted as agreement rather than trusted.
   *
   * A notice driven by its own readiness flag or its own timer would pass the spec
   * above and fail this one the moment the two drifted — which is exactly how a
   * notice saying "not known" comes to sit above thirty rows each claiming EMPTY.
   */
  it('agrees with the ROWS at every tick — one condition, never two', async () => {
    const bridge = stubBridge();
    const el = await renderPanel();

    for (let tick = 0; tick < 5; tick++) {
      await settle();
      expect(
        notice(el) !== null,
        `notice/rows disagreed at tick ${String(tick)} (before the data)`,
      ).toBe(rowsWaiting(el) > 0);
    }

    await act(async () => {
      bridge.stack.resolve([ITEM]);
      await Promise.resolve();
    });

    for (let tick = 0; tick < 5; tick++) {
      await settle();
      expect(
        notice(el) !== null,
        `notice/rows disagreed at tick ${String(tick)} (after the data)`,
      ).toBe(rowsWaiting(el) > 0);
    }
  });

  /**
   * A STATION WITH NOTHING BOUND NEVER SEES IT. `awaiting` requires a BINDING whose
   * item has not arrived; a row we know is empty is a fact we have been told, and
   * saying "states have not arrived" over it would be the notice crying wolf — the
   * same defect as an `unknown` that is always on.
   */
  it('never appears when no row is bound, even before the stack answers', async () => {
    stubBridge(UNBOUND_ONLY);
    const el = await renderPanel();

    for (let tick = 0; tick < 4; tick++) {
      await settle();
      expect(
        notice(el),
        `notice appeared over rows we KNOW are empty (tick ${String(tick)})`,
      ).toBeNull();
      expect(rowsWaiting(el)).toBe(0);
    }
  });

  /**
   * IT MUST NOT SHIFT THE LAYOUT WHEN IT APPEARS OR GOES.
   *
   * The operator should not have rows move under his cursor at the moment he is
   * reaching for one — and that moment is precisely when the notice goes, a second
   * or so in. Pinned structurally because jsdom computes no layout: the strip is
   * ALWAYS in the DOM and always the same declared height, which is the mechanism
   * that makes the shift impossible. A strip rendered only while waiting would fail
   * here, and a `minHeight` that grew with content would too.
   */
  it('reserves its height permanently — the rows cannot move when it goes', async () => {
    const bridge = stubBridge();
    const el = await renderPanel();
    await settle();

    const strip = el.querySelector('[role="status"]');
    expect(
      strip,
      'the notice strip must exist as a container, not only as a message',
    ).not.toBeNull();
    const heightWhileWaiting = (strip as HTMLElement).style.height;
    expect(heightWhileWaiting, 'the strip must declare a FIXED height').not.toBe('');

    await act(async () => {
      bridge.stack.resolve([ITEM]);
      await Promise.resolve();
    });
    await settle();

    // Same element, same height, no message — so nothing below it moved.
    const after = el.querySelector('[role="status"]');
    expect(after, 'the strip was removed with its message — that is the shift').not.toBeNull();
    expect((after as HTMLElement).style.height).toBe(heightWhileWaiting);
    expect(notice(el)).toBeNull();
  });

  /**
   * IT COMPLEMENTS THE ROWS AND REPLACES NOTHING. The per-row treatment stays: a
   * notice above thirty rows still claiming EMPTY would be two sources disagreeing,
   * which is the shape this panel keeps paying for.
   */
  it('does not weaken the per-row treatment', async () => {
    stubBridge();
    const el = await renderPanel();
    await settle();

    expect(notice(el)).not.toBeNull();
    const bound = el.querySelector('[data-layer="70"]')?.textContent ?? '';
    expect(bound).toContain('LOADING');
    expect(bound).not.toContain('EMPTY');
    // …and the row we KNOW is empty still says so, in the same window.
    expect(el.querySelector('[data-layer="71"]')?.textContent ?? '').toContain('EMPTY');
  });
});
