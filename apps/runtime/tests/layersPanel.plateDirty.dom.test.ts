// @vitest-environment jsdom
import { StrictMode, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { StackItemState } from '@cg/shared-schema';
import type { SourceAssignments, SourceCatalog, TemplateInfo } from '@cg/shared-ipc';
import { LayersPanel } from '../src/renderer/features/layers/LayersPanel.js';
import { clearPortals } from './support/dialog.js';
import { connectionsStub } from './support/reachability.js';
import {
  __resetDraftsForTest,
  stagePlateSource,
} from '../src/renderer/features/inspector/draftStore.js';
import {
  __resetSourcesForTest,
  initSources,
} from '../src/renderer/features/sources/sourceStore.js';

/**
 * B-139 task 4.6 — THE DOM FACT, and only it.
 *
 * The broader "both surfaces agree" matrix is deliberately NOT built here: the row
 * and the Inspector now take the same value from the same call, so asserting they
 * agree would assert the framework rather than the rule. The predicate-level cases
 * (`livePlateDraft.test.ts`) already pin the rule and its inverse.
 *
 * 🔴 What they CANNOT pin is this: **a predicate returning `true` does not prove a
 * button is enabled.** The half of B-139 that actually hurt was functional — with a
 * plate staged to _not assigned_, the row's UPDATE verb was DISABLED, so the
 * operator could not apply the edit from the row at all. Whether the verb is
 * enabled is a DOM fact, and this repo's rule is that a boundary test reads what
 * the BROWSER shows rather than what the code thinks.
 *
 * So: one row, one staged un-assignment, two assertions — the draft chip is
 * rendered, and UPDATE is enabled. That is the regression an operator would feel.
 */

const LAYER = 70;
const TEMPLATE_ID = 'tpl-1';
const PLATE = 'guest-1';
const SAVED_SOURCE = 'src-aaa';

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
  __resetDraftsForTest();
  __resetSourcesForTest();
  vi.restoreAllMocks();
});

/** A template declaring ONE live plate, so the row has a plate baseline at all. */
const TEMPLATE: TemplateInfo = {
  templateId: TEMPLATE_ID,
  name: 'Two box',
  templateType: 'clock',
  fields: [],
  liveSources: {
    resolution: { width: 1920, height: 1080 },
    sources: [
      { elementId: 'el-1', sourceId: PLATE, rect: { x: 0, y: 0, width: 960, height: 540 } },
    ],
  },
};

const CATALOG: SourceCatalog = {
  sources: [{ id: SAVED_SOURCE, name: 'Studio A', producer: { kind: 'route', channel: 2 } }],
  layerRange: { start: 10, end: 59 },
};

/** The plate's SAVED assignment — the baseline the row must compare against. */
const ASSIGNMENTS: SourceAssignments = {
  assignments: [{ templateId: TEMPLATE_ID, plateId: PLATE, sourceId: SAVED_SOURCE }],
};

const ITEM: StackItemState = {
  itemId: 'item-1',
  templateId: TEMPLATE_ID,
  fields: {},
  status: 'on-air',
  pending: false,
  slot: { channel: 1, layer: LAYER, server: 'primary' },
};

function stubBridge(): void {
  const stub = {
    link: { status: () => 'live', onStatusChanged: () => () => undefined },
    connections: connectionsStub('both-up'),
    templates: { list: () => Promise.resolve([TEMPLATE]), onChanged: () => () => undefined },
    fixedLayers: {
      config: () => Promise.resolve({ channel: 1, layers: [{ layer: LAYER, alias: 'BOX' }] }),
      state: () =>
        Promise.resolve([
          {
            channel: 1,
            layer: LAYER,
            alias: 'BOX',
            observed: { kind: 'producer', producer: 'html' },
            binding: { itemId: ITEM.itemId, templateType: 'clock', templateId: TEMPLATE_ID },
          },
        ]),
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
    },
    sources: {
      config: () => Promise.resolve(CATALOG),
      assignments: () => Promise.resolve(ASSIGNMENTS),
      setConfig: () => Promise.resolve({ ok: true }),
      setAssignments: () => Promise.resolve({ ok: true }),
      onConfigChanged: () => () => undefined,
      onAssignmentsChanged: () => () => undefined,
    },
    stack: {
      snapshot: () => Promise.resolve([ITEM]),
      onStateChanged: () => () => undefined,
      onRestoreSkips: () => () => undefined,
      clearAll: () => Promise.resolve({ ok: true, cleared: 0, attempted: 0, refused: [] }),
      removeAll: () => Promise.resolve({ ok: true, removed: 0 }),
      take: () => Promise.resolve({ accepted: true }),
      update: () => Promise.resolve({ accepted: true }),
      out: () => Promise.resolve({ accepted: true }),
      remove: () => Promise.resolve({ accepted: true }),
    },
  };
  (window as unknown as { cg: typeof stub }).cg = stub;
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

/**
 * UPDATE is a `surface: 'menu'` action (the verb block is a closed six-column
 * grid), so it exists in the DOM only once the row's context menu is open, and
 * the menu is PORTALLED to `document.body` rather than into the panel.
 */
async function openRowMenu(el: HTMLElement): Promise<void> {
  // The row's stable anchor is its DECLARED LAYER NUMBER (`data-layer`) — which is
  // what the product itself treats as the row's identity, unlike an itemId.
  const row = el.querySelector<HTMLElement>(`[data-layer="${String(LAYER)}"]`);
  expect(row, 'the declared row should be rendered').not.toBeNull();
  await act(async () => {
    row?.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    await Promise.resolve();
  });
}

/**
 * The UPDATE menu item and whether it is disabled.
 *
 * Matched anchored at the START, not exactly: a label can carry more after it
 * (session A's `/LAYERS/` two-tab regression is the same instrument error). And
 * the item is a `role="menuitem"` div, so "disabled" is `aria-disabled` — reading
 * `.disabled` on it would silently be `undefined` and assert nothing.
 */
function updateVerb(): { el: Element; disabled: boolean } | null {
  for (const item of document.body.querySelectorAll('[role="menuitem"]')) {
    if (/^UPDATE\b/.test((item.textContent ?? '').trim())) {
      return { el: item, disabled: item.getAttribute('aria-disabled') === 'true' };
    }
  }
  return null;
}

const draftChip = (el: HTMLElement): Element | null =>
  el.querySelector('[aria-label$="has unapplied edits"]');

describe('B-139 — a plate staged as NOT ASSIGNED is applicable from the row', () => {
  it('renders the draft chip AND leaves UPDATE enabled', async () => {
    stubBridge();
    initSources(window.cg as never);
    __resetDraftsForTest();
    // The operator clears the plate that currently HAS a source. Before the fix the
    // row compared `''` against a fabricated `''` and called this clean, so the chip
    // vanished and UPDATE went disabled — an edit with no way to apply it.
    stagePlateSource(ITEM.itemId, PLATE, '');

    const el = await renderPanel();
    await act(async () => {
      await Promise.resolve();
    });

    /*
      SOFT on the first two, deliberately. The chip and the verb are two INDEPENDENT
      consequences of the same defect, and a hard assertion on the chip would
      short-circuit before the verb was ever examined — so the red run would only
      ever prove half of what this test exists to prove. Verified red on both:
      against the pre-fix collapsed baseline the chip is absent AND UPDATE is
      disabled.
    */
    expect.soft(draftChip(el), 'the row should show a draft chip').not.toBeNull();

    await openRowMenu(el);
    const update = updateVerb();
    expect.soft(update, 'the row should offer an UPDATE verb').not.toBeNull();
    expect(
      update?.disabled,
      'UPDATE must be ENABLED so the un-assignment can be applied from the row',
    ).toBe(false);
  });
});
