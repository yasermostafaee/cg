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
 * THE ROW'S OWN LOADING WINDOW — the half `layersPanel.loading.dom.test.ts` does
 * not cover, and the owner's actual report.
 *
 * ── WHAT WAS WRONG ──────────────────────────────────────────────────────────
 *
 * The earlier guard protects the SET OF ROWS: an unready bank or slots can no
 * longer render as a station with no rows. The owner's symptom is not a missing
 * set — the rows render, and every one of them reads EMPTY, then the occupied
 * ones appear at once. On every startup and every reconnect the rundown looked
 * wiped.
 *
 * The stack is a THIRD snapshot and it lands separately. `useStack()` hands back
 * `[]` until its first answer — right for rendering a list, wrong for deciding
 * what a row IS — and the panel collapsed the lookup with `?? null`, which is the
 * same value an UNBOUND slot produces. Two different facts, one value:
 *
 *   - "this row has no template bound"     — ours, known, EMPTY is honest.
 *   - "we have not received the stack yet" — not a fact about the row at all.
 *
 * ── WHY THESE ASSERTIONS ARE SHAPED THIS WAY ────────────────────────────────
 *
 * The obvious spec — render, await, assert — PASSES against the unfixed code,
 * because by the time it looks the stack has landed and the rows are correct. So
 * the stack snapshot here is DEFERRED and resolved by hand: every assertion about
 * the waiting state is made while the window is genuinely open, and the arrival is
 * a step the test takes rather than a race it hopes to win. A snapshot taken
 * afterwards is exactly the test that would have shipped this bug.
 *
 * The second `it` is the one that goes RED without the fix.
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
 * A bridge whose FIXED-LAYER snapshots answer immediately and whose STACK is held
 * open until the spec resolves it.
 *
 * That split is the point: it reproduces the exact window the owner sees, where
 * the list has arrived (so rows render) and the stack has not (so every bound row
 * has no item to find). `push` drives the reconnect case — a live `onStateChanged`
 * publish, which is the other way the stack becomes ready.
 */
function stubBridge(): {
  stack: Deferred<StackItemState[]>;
  push: (items: StackItemState[]) => void;
} {
  const stack = deferred<StackItemState[]>();
  const stackListeners = new Set<(items: StackItemState[]) => void>();
  const stub = {
    link: { status: () => 'live', onStatusChanged: () => () => undefined },
    connections: connectionsStub('both-up'),
    templates: { list: () => Promise.resolve([]), onChanged: () => () => undefined },
    fixedLayers: {
      config: () => Promise.resolve(BANK),
      state: () => Promise.resolve(SLOTS),
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
      onStateChanged: (h: (items: StackItemState[]) => void) => {
        stackListeners.add(h);
        return () => stackListeners.delete(h);
      },
      clearAll: () => Promise.resolve({ ok: true, cleared: 0 }),
      removeAll: () => Promise.resolve({ ok: true, removed: 0 }),
      take: () => Promise.resolve({ accepted: true }),
      update: () => Promise.resolve({ accepted: true }),
      out: () => Promise.resolve({ accepted: true }),
      remove: () => Promise.resolve({ accepted: true }),
    },
  };
  (window as unknown as { cg: typeof stub }).cg = stub;
  return {
    stack,
    push: (items) => {
      for (const h of stackListeners) h(items);
    },
  };
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

/** One row's rendered text, by layer. */
const rowText = (el: HTMLElement, layer: number): string =>
  el.querySelector(`[data-layer="${String(layer)}"]`)?.textContent ?? '';

/** Let the fixed-layer snapshots (which resolve immediately) settle. */
async function settle(): Promise<void> {
  await act(async () => {
    for (let i = 0; i < 6; i++) await Promise.resolve();
  });
}

describe('a bound row whose stack has not arrived is LOADING, never EMPTY', () => {
  it('an unbound row with a READY stack still reads EMPTY — the rule is not weakened', async () => {
    // The half this fix must not swallow. Layer 71 genuinely carries nothing, and
    // once we KNOW that it must go on saying so, in the same word, querying
    // nothing. A fix that made every row cautious would be the B-094 defect
    // inverted — an `unknown` that is always on is how a real one stops being read.
    const bridge = stubBridge();
    const el = await renderPanel();
    await settle();
    await act(async () => {
      bridge.stack.resolve([ITEM]);
      await Promise.resolve();
    });
    await settle();

    expect(rowText(el, 71)).toContain('EMPTY');
    expect(rowText(el, 71)).not.toContain('LOADING');
  });

  it('THE BUG: a BOUND row does not read EMPTY while the stack is still in flight', async () => {
    // ── the assertion that goes RED without the fix ────────────────────────
    const bridge = stubBridge();
    const el = await renderPanel();
    await settle();

    // The window is genuinely open here: the bank and the slots have answered (so
    // the rows are on screen) and the stack has not. Unfixed, layer 70 says EMPTY.
    expect(el.querySelectorAll('[data-layer]').length, 'the rows must be rendered').toBe(2);
    expect(
      rowText(el, 70),
      'a bound row reported EMPTY while its item was still in flight',
    ).not.toContain('EMPTY');
    expect(rowText(el, 70)).toContain('LOADING');

    // …and it ends on the DATA, not on a timer.
    await act(async () => {
      bridge.stack.resolve([ITEM]);
      await Promise.resolve();
    });
    await settle();

    expect(rowText(el, 70)).toContain('READY');
    expect(rowText(el, 70)).not.toContain('LOADING');
  });

  it('the loading state holds for the WHOLE window — not just at the first frame', async () => {
    // Asserted ACROSS the window rather than once inside it: a row that flickered
    // to EMPTY partway through would still be the reported bug, and a single
    // sample at the top of the window would miss it.
    const bridge = stubBridge();
    const el = await renderPanel();

    for (let tick = 0; tick < 5; tick++) {
      await settle();
      expect(rowText(el, 70), `EMPTY appeared at tick ${String(tick)}`).not.toContain('EMPTY');
      expect(rowText(el, 70), `LOADING lost at tick ${String(tick)}`).toContain('LOADING');
    }

    await act(async () => {
      bridge.stack.resolve([ITEM]);
      await Promise.resolve();
    });
    await settle();
    expect(rowText(el, 70)).toContain('READY');
  });

  it('THE RECONNECT WINDOW: a resync publish closes it, exactly as the first load does', async () => {
    // The owner reports it on startup; the reconnect path is the same shape and
    // must not be left behind. Here the stack becomes ready via a live
    // `onStateChanged` publish rather than a resolved pull — the other of the two
    // ways `ready` latches, and the one a reconnect actually takes.
    const bridge = stubBridge();
    const el = await renderPanel();
    await settle();

    expect(rowText(el, 70)).toContain('LOADING');
    expect(rowText(el, 70)).not.toContain('EMPTY');

    await act(async () => {
      bridge.push([ITEM]);
      await Promise.resolve();
    });
    await settle();

    expect(rowText(el, 70)).toContain('READY');
    expect(rowText(el, 70)).not.toContain('LOADING');
  });

  it('a row stuck LOADING after its item arrived is the mirror bug — it must not happen', async () => {
    // Adversarial: the failure mode this fix could introduce. A row that never
    // leaves the waiting state reads as a hung panel, and it would be just as
    // invisible in code as the defect being fixed. Resolve, then keep ticking —
    // nothing may drift back to LOADING once the answer is in hand.
    const bridge = stubBridge();
    const el = await renderPanel();
    await settle();
    await act(async () => {
      bridge.stack.resolve([ITEM]);
      await Promise.resolve();
    });

    for (let tick = 0; tick < 5; tick++) {
      await settle();
      expect(rowText(el, 70), `stuck LOADING at tick ${String(tick)}`).not.toContain('LOADING');
      expect(rowText(el, 70)).toContain('READY');
    }
  });
});
