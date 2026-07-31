// @vitest-environment jsdom
import { StrictMode, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FixedLayerBank, FixedSlotState } from '@cg/shared-ipc';
import { LayersPanel } from '../src/renderer/features/layers/LayersPanel.js';
import { clearPortals } from './support/dialog.js';
import { connectionsStub } from './support/reachability.js';

/**
 * §3 — A BRIDGE RECONNECT MUST NOT RENDER AN EMPTY LIST.
 *
 * `useBridgeSnapshot` does not even ASK while the link is down, so a Runtime
 * opened before the bridge is up holds `bank = null` / `slots = []` — and the
 * panel read that `null` as an ANSWER, telling the operator "No candidate layers
 * are declared. This station has no rows to load onto yet." It then filled in
 * silently seconds later, with nothing having said it was about to.
 *
 * ── WHY THESE ASSERTIONS ARE SHAPED THE WAY THEY ARE ────────────────────────
 *
 * The obvious spec — render, await the snapshot, assert the rows — PASSES against
 * the unfixed code, because by the time it looks the data has landed. So the
 * snapshots here are DEFERRED and resolved by hand: every assertion about the
 * waiting state is made while the window is genuinely open, and the arrival is a
 * step the test takes rather than a race it hopes to win.
 *
 * And the third case is the one that stops the fix over-reaching: a station that
 * genuinely has no bank must still say so, in words, once we KNOW. "Nothing here"
 * and "not told yet" are opposite claims and both have to survive.
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
const SLOTS: FixedSlotState[] = [
  { channel: 1, layer: 70, observed: { kind: 'empty' }, binding: null },
  { channel: 1, layer: 71, observed: { kind: 'empty' }, binding: null },
];

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
 * A bridge whose fixed-layer snapshots are held OPEN until the spec resolves them
 * — the boot / reconnect window, made into a state the test can stand inside.
 */
function stubBridge(link: 'live' | 'disconnected' = 'live'): {
  config: Deferred<FixedLayerBank | null>;
  state: Deferred<FixedSlotState[]>;
  setLink: (next: 'live' | 'disconnected') => void;
} {
  const config = deferred<FixedLayerBank | null>();
  const state = deferred<FixedSlotState[]>();
  const listeners = new Set<(s: 'live' | 'disconnected') => void>();
  let status = link;
  const stub = {
    link: {
      status: () => status,
      onStatusChanged: (h: (s: 'live' | 'disconnected') => void) => {
        listeners.add(h);
        return () => listeners.delete(h);
      },
    },
    connections: connectionsStub('both-up'),
    templates: { list: () => Promise.resolve([]), onChanged: () => () => undefined },
    fixedLayers: {
      config: () => config.promise,
      state: () => state.promise,
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
      snapshot: () => Promise.resolve([]),
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
  return {
    config,
    state,
    setLink: (next) => {
      status = next;
      for (const h of listeners) h(next);
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
  });
  return container;
}

const loading = (el: HTMLElement): Element | null => el.querySelector('[data-layers-loading]');
const rows = (el: HTMLElement): NodeListOf<Element> => el.querySelectorAll('[data-layer]');

describe('§3 — an unready list can never render as an empty list', () => {
  it('says LOADING for the WHOLE window, then the rows arrive', async () => {
    const bridge = stubBridge('live');
    const el = await renderPanel();

    // ── inside the window ──────────────────────────────────────────────────
    expect(loading(el), 'the panel must say it is waiting').not.toBeNull();
    expect(loading(el)?.getAttribute('role')).toBe('status');
    // …and it must not be mistakable for either flavour of "nothing here".
    expect(el.textContent).not.toContain('No candidate layers are declared');
    expect(el.textContent).toContain('not an empty list');
    expect(rows(el)).toHaveLength(0);

    // A HALF-ARRIVAL is still an unready list: a ready bank over unready slots
    // renders the declared range as a table with nothing on it.
    await act(async () => {
      bridge.config.resolve(BANK);
      await Promise.resolve();
    });
    expect(loading(el), 'the bank alone is not the list').not.toBeNull();
    expect(rows(el)).toHaveLength(0);

    // ── the window closes on the DATA, not on a timer ──────────────────────
    await act(async () => {
      bridge.state.resolve(SLOTS);
      await Promise.resolve();
    });
    expect(loading(el)).toBeNull();
    expect(rows(el)).toHaveLength(2);
  });

  it('a page opened BEFORE the bridge is up waits, and fills in when it returns', async () => {
    // The reported case. With the link down nothing is even asked for, so the old
    // panel sat on `null` and announced that the station had no rows.
    const bridge = stubBridge('disconnected');
    const el = await renderPanel();

    expect(loading(el)).not.toBeNull();
    expect(el.textContent).not.toContain('No candidate layers are declared');

    await act(async () => {
      bridge.setLink('live');
      await Promise.resolve();
    });
    // The link is back but the answer is not — still the waiting state, not empty.
    expect(loading(el)).not.toBeNull();
    expect(rows(el)).toHaveLength(0);

    await act(async () => {
      bridge.config.resolve(BANK);
      bridge.state.resolve(SLOTS);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(loading(el)).toBeNull();
    expect(rows(el)).toHaveLength(2);
  });

  it('a station that genuinely HAS no bank still says so — once we know', async () => {
    // The half this fix must not swallow. `null` after an ANSWER is a fact, and it
    // keeps its paragraph telling the operator where to declare the range.
    const bridge = stubBridge('live');
    const el = await renderPanel();

    await act(async () => {
      bridge.config.resolve(null);
      bridge.state.resolve([]);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(loading(el)).toBeNull();
    expect(el.textContent).toContain('No candidate layers are declared');
  });
});
