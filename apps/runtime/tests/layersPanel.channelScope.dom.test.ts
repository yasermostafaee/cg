// @vitest-environment jsdom
import { StrictMode, createElement } from 'react';
import { fillBridgeStub } from './support/authStub.js';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, expect, it, vi } from 'vitest';
import type { FixedLayerBank, FixedSlotState, RestoreMigration, RestoreSkip } from '@cg/shared-ipc';
import type { StackItemState } from '@cg/shared-schema';
import { LayersPanel } from '../src/renderer/features/layers/LayersPanel.js';
import { clearPortals } from './support/dialog.js';
import { connectionsStub } from './support/reachability.js';

/**
 * 🔴 `DESKTOP-APPS-01-D` — what the channel's own Layers view shows.
 *
 * h — a row's `#` and its default name carry the REAL AMCP layer: the owner's top row read
 * `#1 · Layer 1` while the Inspector said layer 99, on a channel shared with a playout server.
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

/** The first-run bank on channel 2: operator rows 80–99, beds 50–59, row 98 named by the admin. */
const BANK: FixedLayerBank = {
  channel: 2,
  start: 80,
  count: 20,
  aliases: { '98': 'CLOCK' },
  low: { start: 50, count: 10 },
};
const SLOTS: FixedSlotState[] = [99, 98, 97, 59].map((layer) => ({
  channel: 2,
  layer,
  observed: { kind: 'empty' },
  binding: null,
  ...(layer === 98 ? { alias: 'CLOCK' } : {}),
}));

interface Scene {
  readonly items?: readonly StackItemState[];
  readonly skips?: readonly RestoreSkip[];
}

function stubBridge(scene: Scene = {}): void {
  const stub = {
    link: {
      status: () => 'live',
      onStatusChanged: () => () => undefined,
      resyncing: () => false,
      onResyncingChanged: () => () => undefined,
    },
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
    liveLayers: {
      state: () => Promise.resolve([]),
      onStateChanged: () => () => undefined,
      onPlateReleased: () => () => undefined,
    },
    stack: {
      snapshot: () => Promise.resolve(scene.items ?? []),
      onStateChanged: () => () => undefined,
      onRestoreSkips: (handler: (s: readonly RestoreSkip[]) => void) => {
        handler(scene.skips ?? []);
        return () => undefined;
      },
      onRestoreMigrations: (handler: (m: readonly RestoreMigration[]) => void) => {
        handler([]);
        return () => undefined;
      },
      clearAll: () => Promise.resolve({ ok: true, cleared: 0 }),
      removeAll: () => Promise.resolve({ ok: true, removed: 0 }),
      take: () => Promise.resolve({ accepted: true }),
      update: () => Promise.resolve({ accepted: true }),
      out: () => Promise.resolve({ accepted: true }),
      remove: () => Promise.resolve({ accepted: true }),
    },
  };
  (window as unknown as { cg: typeof stub }).cg = fillBridgeStub(stub);
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
            monitorPx: 220,
            focus: 'none' as const,
            narrow: false,
            setInspectorPx: () => undefined,
            setMonitorPx: () => undefined,
            setFocus: () => undefined,
            reset: () => undefined,
            customized: false,
            monitorsShown: true,
            setMonitorsShown: () => undefined,
          },
          onUpdate: () => Promise.resolve({ accepted: true }),
          inspectorOpen: false,
          onToggleInspector: () => undefined,
        }),
      ),
    );
  });
  return container;
}

const row = (el: HTMLElement, layer: number): HTMLElement | null =>
  el.querySelector(`[data-layer="${String(layer)}"]`);

it('h — the top row’s # reads 99 and its default name is `Layer 99`; a bed reads 59 and `Bed 59`', async () => {
  stubBridge();
  const el = await renderPanel();
  const top = row(el, 99);
  expect(top, 'the panel rendered no row for layer 99').not.toBeNull();
  expect(top?.getAttribute('data-row-number')).toBe('99');
  expect(top?.querySelector('[data-row-body]')?.textContent).toBe('Layer 99');
  expect(top?.getAttribute('title')).toBe('Layer 99 · CasparCG layer 2-99');
  const bed = row(el, 59);
  expect(bed?.getAttribute('data-row-number')).toBe('59');
  expect(bed?.querySelector('[data-row-body]')?.textContent).toBe('Bed 59');
  // Nothing on the table still counts rows from 1.
  expect(el.textContent).not.toMatch(/\bLayer 1\b/);
});

it('h control — a row the admin NAMED keeps its name; only its # is the layer', async () => {
  stubBridge();
  const el = await renderPanel();
  const named = row(el, 98);
  expect(named?.querySelector('[data-row-body]')?.textContent).toBe('CLOCK');
  expect(named?.getAttribute('data-row-number')).toBe('98');
});
