// @vitest-environment jsdom
import { StrictMode, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { OrphanLayer, PlayoutLayerState } from '@cg/shared-ipc';
import { StationLayersPanel } from '../src/renderer/features/layers/StationLayersPanel.js';
import { clearPortals } from './support/dialog.js';
import { connectionsStub } from './support/reachability.js';

/**
 * 🔴 `B-235` — **the panel whose job is "this is not yours" stayed silent about a layer
 * another system was using, while that layer surfaced above the operator's own list.**
 *
 * ── THE DIAGNOSIS, WRITTEN BEFORE THE FIX ───────────────────────────────────
 *
 * Both halves of the prompt's question have an answer in the source, and neither is a
 * renderer FILTER:
 *
 *  1. **The layer is ABSENT from what the panel reads.** `caspar-runtime.ts`
 *     `playoutLayersState()` opens with `if (this.#reservedLayers.length === 0) return []`
 *     and then maps over `[...this.#reservedLayers]` — exactly one row per DECLARED
 *     reserved layer and nothing else. A layer another system is using that was never
 *     declared in `--reserved-layers` / `bridge-reserved-layers.json` is not in that array
 *     at any point, so nothing in the renderer had a chance to filter it out. On an install
 *     that declares no reserved layers at all the panel renders its "No playout layers are
 *     declared" empty state — which is exactly the silence the owner saw.
 *  2. **What appears above the Layers list is the ORPHAN path**, not the candidate path.
 *     `#orphanTracker.update(occupied, owned)` builds it; the bridge's comment there records
 *     that unbound BANK layers were deliberately re-included and that the RESERVED range is
 *     deliberately EXCLUDED ("a playout `html` graphic is indistinguishable from ours on the
 *     wire"). `App.tsx` renders `OrphanLayersBanner` in the chrome strip immediately above
 *     `LayersPanel`.
 *
 * So the two sets are DISJOINT BY CONSTRUCTION, split by whether a layer was DECLARED —
 * while the operator's question is "is this mine?", to which both sets answer "no". The
 * cause is the RENDERER presenting them as two unrelated surfaces. It is NOT a bridge-ledger
 * fault: the bridge computes both sets correctly and for stated reasons, and nothing about
 * the ledger is reshaped here.
 *
 * ── WHAT THIS FIXES, AND WHAT IT DELIBERATELY DOES NOT ──────────────────────
 *
 * The panel now says it. The orphan set is listed as its own group, labelled as never
 * declared. The banner keeps the CLEAR — one dangerous action, one implementation, one
 * confirm gate; a second Clear here would be exactly the drift golden rule 6 exists to end.
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

function stubBridge(): void {
  const stub = {
    link: {
      status: () => 'live',
      onStatusChanged: () => () => undefined,
      resyncing: () => false,
      onResyncingChanged: () => () => undefined,
    },
    connections: connectionsStub('both-up'),
    playoutLayers: {
      clear: vi.fn(() => Promise.resolve({ ok: true })),
      state: () => Promise.resolve([]),
      onStateChanged: () => () => undefined,
    },
    liveLayers: { state: () => Promise.resolve([]), onStateChanged: () => () => undefined },
  };
  (window as unknown as { cg: typeof stub }).cg = stub;
}

async function render(
  layers: PlayoutLayerState[],
  orphans: OrphanLayer[],
): Promise<HTMLDivElement> {
  stubBridge();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  const r = root;
  await act(async () => {
    r.render(
      createElement(StrictMode, null, createElement(StationLayersPanel, { layers, orphans })),
    );
  });
  return container;
}

const ORPHAN: OrphanLayer = {
  channel: 1,
  layer: 42,
  producer: 'ffmpeg',
  since: '2026-09-06T00:00:00.000Z',
};
const DECLARED: PlayoutLayerState = { channel: 1, layer: 61, observed: { kind: 'empty' } };

describe('B-235 — the Station layers panel names a layer another system is using', () => {
  it('says so even when NOTHING is declared reserved — the silence the owner saw', async () => {
    const el = await render([], [ORPHAN]);
    const text = el.textContent ?? '';
    // Non-empty first: an assertion against a constant that does not exist yet is
    // `expect(undefined).toBe(undefined)`.
    expect(text.length).toBeGreaterThan(0);
    // The empty state is still honest about the DECLARED half…
    expect(text).toContain('No playout layers are declared');
    // …and the panel is no longer silent about the layer that is actually in use.
    expect(el.querySelector('[data-undeclared-layer="42"]')).not.toBeNull();
    expect(text).toContain('never declared');
  });

  it('lists them alongside the declared rows when both exist', async () => {
    const el = await render([DECLARED], [ORPHAN]);
    expect(el.querySelector('[data-playout-layer="61"]')).not.toBeNull();
    expect(el.querySelector('[data-undeclared-layer="42"]')).not.toBeNull();
  });

  it('POSITIVE CONTROL: with no orphans the group is absent — it is real, not always-on', async () => {
    const el = await render([DECLARED], []);
    expect(el.querySelector('[data-playout-layer="61"]')).not.toBeNull();
    expect(el.textContent ?? '').not.toContain('never declared');
  });

  it('offers NO second Clear — one dangerous action, one implementation', async () => {
    const el = await render([], [ORPHAN]);
    const group = el.querySelector('[data-undeclared-layer="42"]');
    expect(group?.querySelector('button')).toBeNull();
    expect(el.textContent ?? '').toContain('warning strip above the layer list');
  });
});
