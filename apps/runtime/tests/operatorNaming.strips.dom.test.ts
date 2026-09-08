// @vitest-environment jsdom
import { StrictMode, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  FixedLayerBank,
  FixedSlotState,
  OwnedOccupancyWarning,
  RestoreSkip,
  TemplateInfo,
} from '@cg/shared-ipc';
import { LayersPanel } from '../src/renderer/features/layers/LayersPanel.js';
import { OrphanLayersBanner } from '../src/renderer/features/layers/OrphanLayersBanner.js';
import { clearPortals } from './support/dialog.js';
import { connectionsStub } from './support/reachability.js';

/**
 * 🔴 `B-233` — **THE THREE STRIPS THAT STILL SPOKE IN IDS.**
 *
 * `B-232` established golden rule 11 and the module that carries it
 * (`ui/operatorNaming.ts`): an operator-facing surface names things in the operator's
 * words, and internal ids live behind a `title` or on a technical surface. Its sweep found
 * FOUR surfaces, fixed one, and filed the rest as `B-233` because each needed a decision
 * its brief did not authorise. These are two of the three; the third (the stranded-release
 * toast in `LiveSourcesPanel`) is a `reportCommandError` string with no DOM of its own and
 * is covered by `liveSourcesPanel` specs.
 *
 * ── THE ASYMMETRY BETWEEN THEM, WHICH IS THE FINDING WORTH KEEPING ──────────
 *
 * The occupancy strip needed NO wire change: an occupancy warning names an item whose LOAD
 * raised it, so that item is on the stack and the renderer can join `itemId → templateId`.
 *
 * The restore-SKIPS strip could not do that at any price. A skipped row is BY DEFINITION
 * not on the stack — that is what "did not come back" means — so there is nothing on this
 * side to join against, and the naming had to travel with the report. Hence
 * `RestoreSkipSchema` gained an optional `templateId` and `slot`, additive exactly like its
 * `detail`, filled from the `RetainedStackItem` the bridge already holds at every skip site.
 *
 * ⭐ These specs use REAL-SHAPED ids (`item-e602d912-1c4b-4c8a-9f2e-0b7a5d3e1f00`). The
 * pre-existing spec for this strip used `headline` and `ticker`, which are short, readable
 * and pass `shortId` through unchanged — which is exactly why the defect was invisible to
 * it for as long as it was. A test whose fixture cannot exhibit the bug is not covering it.
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

/** A real UUID-shaped item id, the kind the plant actually produces. */
const ITEM_ID = 'item-e602d912-1c4b-4c8a-9f2e-0b7a5d3e1f00';
const TEMPLATE_ID = 'e506e319-6e68-4603-a5f4-290b21616250';

/** The operator's own words for that row and that template — Persian, as on the plant. */
const ROW_NAME = 'لوگوی اصلی';
const TEMPLATE_NAME = '3ghab';

const BANK: FixedLayerBank = {
  channel: 1,
  low: { start: 1, count: 9 },
  start: 70,
  count: 2,
  aliases: { 70: ROW_NAME },
};
const SLOTS: FixedSlotState[] = [
  { channel: 1, layer: 70, observed: { kind: 'empty' }, binding: null },
  { channel: 1, layer: 71, observed: { kind: 'empty' }, binding: null },
];
const TEMPLATE: TemplateInfo = {
  templateId: TEMPLATE_ID,
  templateType: 'lower-third',
  name: TEMPLATE_NAME,
  fields: [],
};

function baseStub(over: Record<string, unknown> = {}): void {
  const stub = {
    link: {
      status: () => 'live',
      onStatusChanged: () => () => undefined,
      resyncing: () => false,
      onResyncingChanged: () => () => undefined,
    },
    connections: connectionsStub('both-up'),
    templates: {
      list: () => Promise.resolve([TEMPLATE]),
      get: () => Promise.resolve(TEMPLATE),
      onChanged: () => () => undefined,
    },
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
    liveLayers: { state: () => Promise.resolve([]), onStateChanged: () => () => undefined },
    layers: { clear: () => Promise.resolve({ ok: true }) },
    stack: {
      snapshot: () => Promise.resolve([]),
      onStateChanged: () => () => undefined,
      onRestoreSkips: () => () => undefined,
      onRestoreMigrations: () => () => undefined,
      clearAll: () => Promise.resolve({ ok: true, cleared: 0 }),
      removeAll: () => Promise.resolve({ ok: true, removed: 0 }),
      take: () => Promise.resolve({ accepted: true }),
      update: () => Promise.resolve({ accepted: true }),
      out: () => Promise.resolve({ accepted: true }),
      remove: () => Promise.resolve({ accepted: true }),
    },
    ...over,
  };
  (window as unknown as { cg: typeof stub }).cg = stub;
}

async function renderEl(element: ReturnType<typeof createElement>): Promise<HTMLDivElement> {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  const r = root;
  await act(async () => {
    r.render(createElement(StrictMode, null, element));
    for (let i = 0; i < 8; i++) await Promise.resolve();
  });
  await act(async () => {
    for (let i = 0; i < 8; i++) await Promise.resolve();
  });
  return container;
}

function panel(): ReturnType<typeof createElement> {
  return createElement(LayersPanel, {
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
  });
}

describe('B-233 §1 — the restore-SKIPS strip names rows, not ids', () => {
  const skip = (over: Partial<RestoreSkip> = {}): RestoreSkip => ({
    itemId: ITEM_ID,
    reason: 'unknown-template',
    templateId: TEMPLATE_ID,
    slot: { channel: 1, layer: 70, server: 'primary' },
    ...over,
  });

  async function renderWithSkips(skips: RestoreSkip[]): Promise<HTMLElement> {
    baseStub({
      stack: {
        snapshot: () => Promise.resolve([]),
        onStateChanged: () => () => undefined,
        onRestoreSkips: (h: (s: readonly RestoreSkip[]) => void) => {
          h(skips);
          return () => undefined;
        },
        onRestoreMigrations: () => () => undefined,
        clearAll: () => Promise.resolve({ ok: true, cleared: 0 }),
        removeAll: () => Promise.resolve({ ok: true, removed: 0 }),
        take: () => Promise.resolve({ accepted: true }),
        update: () => Promise.resolve({ accepted: true }),
        out: () => Promise.resolve({ accepted: true }),
        remove: () => Promise.resolve({ accepted: true }),
      },
    });
    const el = await renderEl(panel());
    const strip = el.querySelector<HTMLElement>('[data-restore-skips]');
    if (strip === null) throw new Error('the restore-skips strip did not render');
    return strip;
  }

  it('🔴 THE BUG: the strip says «لوگوی اصلی», never the raw item id', async () => {
    const strip = await renderWithSkips([skip()]);
    expect(strip.textContent).toContain(ROW_NAME);
    expect(strip.textContent).toContain(TEMPLATE_NAME);
    // ── the assertion that goes RED without the fix ────────────────────────
    expect(strip.textContent, 'the raw item id is in the sentence').not.toContain(ITEM_ID);
    expect(strip.textContent, 'the raw template UUID is in the sentence').not.toContain(
      TEMPLATE_ID,
    );
    // The reason still survives — the naming replaced the id, not the explanation.
    expect(strip.textContent).toContain('re-import');
  });

  it('isolates each name in its own <bdi>, because Persian sits beside Latin here', async () => {
    // Not decoration: the row name is RTL, the template name is usually LTR and the ` · `
    // between them is a NEUTRAL, so joined into one text node their order is decided by the
    // bidi algorithm rather than by the author. Four surfaces learned this separately
    // (`B-210`/`B-211`, `B-223`, `useTemplateIndex`, `B-232`) before it was written down.
    const strip = await renderWithSkips([skip()]);
    const isolates = [...strip.querySelectorAll('bdi')].map((b) => b.textContent);
    expect(isolates).toContain(ROW_NAME);
    expect(isolates).toContain(TEMPLATE_NAME);
  });

  it('degrades to a SHORTENED id when the bridge sends no naming — never a blank', async () => {
    /*
      🔴 THE COMPATIBILITY CASE, and it is the reason the two fields are OPTIONAL.

      A bridge process that predates this change sends `{ itemId, reason }` and nothing else.
      That must still render, and it must not render an empty bullet: `operatorRowName`'s
      documented last resort is a shortened id, because a row with no slot and no known
      template can be named by nothing else and the operator at least has a handle to search
      the log with. Still better than the full UUID this strip used to print.
    */
    const strip = await renderWithSkips([{ itemId: ITEM_ID, reason: 'no-layer' }]);
    expect(strip.textContent).toContain('item-e602d912…');
    expect(strip.textContent, 'the FULL id must never reach the sentence').not.toContain(ITEM_ID);
  });
});

describe('B-233 §2 — the owned-occupancy strip names the row that put it there', () => {
  const WARNING: OwnedOccupancyWarning = {
    channel: 1,
    layer: 70,
    itemId: ITEM_ID,
    producer: 'html',
    since: '2026-09-06T10:00:00.000Z',
  };

  async function renderBanner(): Promise<HTMLElement> {
    baseStub({
      stack: {
        snapshot: () =>
          Promise.resolve([
            { itemId: ITEM_ID, templateId: TEMPLATE_ID, fields: {}, status: 'loaded' },
          ]),
        onStateChanged: () => () => undefined,
        onRestoreSkips: () => () => undefined,
        onRestoreMigrations: () => () => undefined,
      },
    });
    const el = await renderEl(
      createElement(OrphanLayersBanner, { orphans: [], ownedOccupancy: [WARNING] }),
    );
    const strip = el.querySelector<HTMLElement>('[aria-label="Owned-layer occupancy warnings"]');
    if (strip === null) throw new Error('the occupancy strip did not render');
    return strip;
  }

  it('🔴 THE BUG: it names the graphic, not `under item "item-e602d912-…"`', async () => {
    const strip = await renderBanner();
    /*
      ⭐ THE TEMPLATE, NOT THE ROW ALIAS — and the distinction is `B-232`'s note, which CI
      proved right. This spec first asserted the row name; passing the warning's coordinate to
      `operatorRowName` to get it made the strip say "Layer 1-70 … put there by layer 70 …",
      repeating the coordinate the sentence had already printed, and calling a layer an item
      demonstrably owns "not a row" wherever the fixture's bank excluded it.

      The warning's coordinate IS the owning item's own layer, so the only thing the sentence
      does not already say is WHICH graphic — which is the template.
    */
    expect(strip.textContent).toContain(TEMPLATE_NAME);
    // ── the assertion that goes RED without the fix ────────────────────────
    expect(strip.textContent, 'the raw item id is in the sentence').not.toContain(ITEM_ID);
  });

  it('🔴 RELOCATES the id rather than deleting it — the full pair is on the row title', async () => {
    // Golden rule 11's other half, and the one a "fix" is most likely to drop: a name can be
    // renamed or repeated and an id cannot, so the forensic handle has to survive somewhere
    // the operator is not reading under pressure.
    const strip = await renderBanner();
    const row = strip.querySelector<HTMLElement>('[title]');
    expect(row, 'no element carries the ids').not.toBeNull();
    expect(row?.getAttribute('title')).toContain(ITEM_ID);
    expect(row?.getAttribute('title')).toContain(TEMPLATE_ID);
  });

  it('keeps the LAYER NUMBER visible in the sentence (R-028)', async () => {
    // `R-028`'s reason is the moment the console is NOT helping — "an operator may need it
    // to clear that layer by hand" — so it must not retreat into the title with the ids.
    const strip = await renderBanner();
    expect(strip.textContent).toContain('1-70');
  });
});
