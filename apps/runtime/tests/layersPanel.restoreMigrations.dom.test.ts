// @vitest-environment jsdom
import { StrictMode, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, expect, it, vi } from 'vitest';
import {
  defaultLayerAlias,
  type FixedLayerBank,
  type FixedSlotState,
  type RestoreMigration,
  type RestoreSkip,
} from '@cg/shared-ipc';
import { LayersPanel } from '../src/renderer/features/layers/LayersPanel.js';
import { clearPortals } from './support/dialog.js';
import { connectionsStub } from './support/reachability.js';

/**
 * `RUNTIME-REDESIGN-01` deletion guard, item 11 — **the restore-MIGRATIONS strip**
 * (`single-clock-look-switch`).
 *
 * On a reconnect the bridge re-seats what it can. A row whose template declares live plates
 * is a graphics BED, and if it was retained on an operator row it comes back on a BED row
 * instead — it DID come back, on a different row. That is a separate fact from `B-108`'s
 * "did not come back" and it has its own strip, because folding it into the skips notice
 * would send the operator hunting for a row that is on screen.
 *
 * Until Phase 3 this surface had NO test — `data-restore-migrations` occurred in exactly one
 * file, the component — and Phase 3 is the phase that restructures the file it lives in. So
 * the guard is written BEFORE the restructure, and it pins the pair rather than the presence:
 *
 *  1. a MIGRATION is announced, in the operator's words, with where it came from and where it
 *     landed, and the DEMOTED case says the row came back NOT on air and what to do about it;
 *  2. the BENIGN case — nothing migrated — announces NOTHING; and the strip is its own seam,
 *     never the skips strip wearing a second sentence.
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

const BANK: FixedLayerBank = {
  channel: 1,
  low: { start: 1, count: 9 },
  start: 70,
  count: 2,
  aliases: {},
};
const SLOTS: FixedSlotState[] = [
  { channel: 1, layer: 70, observed: { kind: 'empty' }, binding: null },
  { channel: 1, layer: 71, observed: { kind: 'empty' }, binding: null },
];

/** The fixture's one migration: retained on operator row 70, came back on bed row 3. */
const MOVED: RestoreMigration = {
  itemId: 'item-e602d912-4c1e-4c3b-9d1a-0c2b3f8a7e11',
  from: { channel: 1, layer: 70 },
  to: { channel: 1, layer: 3 },
  demoted: false,
};

function stubBridge(migrations: RestoreMigration[], skips: RestoreSkip[] = []): void {
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
    },
    stack: {
      snapshot: () => Promise.resolve([]),
      onStateChanged: () => () => undefined,
      onRestoreSkips: (handler: (s: readonly RestoreSkip[]) => void) => {
        handler(skips);
        return () => undefined;
      },
      // The live implementation replays the latest report on subscribe, because the
      // panel mounts AFTER boot — so the stub does too, or it would be testing a
      // contract the product does not have.
      onRestoreMigrations: (handler: (m: readonly RestoreMigration[]) => void) => {
        handler(migrations);
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
            monitorPx: 220,
            focus: 'none' as const,
            narrow: false,
            setInspectorPx: () => undefined,
            setMonitorPx: () => undefined,
            setFocus: () => undefined,
            reset: () => undefined,
            customized: false,
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

const migrations = (el: HTMLElement): HTMLElement | null =>
  el.querySelector('[data-restore-migrations]');
const skipsStrip = (el: HTMLElement): HTMLElement | null =>
  el.querySelector('[data-restore-skips]');

it('a row that came back on a DIFFERENT row is announced — by its row name, with where it came from and where it landed', async () => {
  stubBridge([MOVED]);
  const el = await renderPanel();

  const strip = migrations(el);
  expect(strip).not.toBeNull();
  const text = strip?.textContent ?? '';
  // The COUNT and the FACT: this row is on screen, on another row.
  expect(text).toContain('1 row came back on a different row');
  // WHERE it came from and where it landed — the layer numbers, because that is what the
  // operator carries to the row he now has to find.
  expect(text).toContain('moved from layer 70 to bed layer 3');
  // Named as the ROW it landed on, through the one canonical naming rule (golden rule 11),
  // and in its own bidi isolate. The alias is asked of the same function the table asks,
  // never spelled here — a spec that hard-coded `Bed 7` would go red on a bank change while
  // saying nothing about the property.
  const landedOn = defaultLayerAlias(BANK, MOVED.to.layer);
  expect(landedOn.length, 'the bank names its bed rows').toBeGreaterThan(0);
  const isolates = [...(strip?.querySelectorAll('bdi') ?? [])].map((b) => b.textContent);
  expect(isolates).toContain(landedOn);
  // …and the raw item id is NOT in the sentence (it is RELOCATED, never deleted — but the
  // visible line is the operator's words).
  expect(text).not.toContain(MOVED.itemId);
  // A row is NOT demoted here, so nothing says it came back off air.
  expect(text).not.toContain('NOT on air');
  // It INTERRUPTS: the row is on screen and looks fine, which is exactly why a quiet
  // `status` would go unread — the operator has to be told the bed came back somewhere else.
  expect(strip?.getAttribute('role')).toBe('alert');
});

it('a DEMOTED row says it came back NOT on air, and what to do before taking it', async () => {
  stubBridge([{ ...MOVED, demoted: true }]);
  const el = await renderPanel();
  const text = migrations(el)?.textContent ?? '';
  // The half that changes what the operator must DO: the old row may still be carrying
  // whatever was on it before the upgrade.
  expect(text).toContain('came back NOT on air');
  expect(text).toContain('clear its old layer before taking it');
});

it('TWO migrated rows read as rows, not "2 row"', async () => {
  stubBridge([
    MOVED,
    {
      itemId: 'item-ticker',
      from: { channel: 1, layer: 71 },
      to: { channel: 1, layer: 2 },
      demoted: false,
    },
  ]);
  const el = await renderPanel();
  expect(migrations(el)?.textContent).toContain('2 rows came back on a different row');
});

it('THE NO-FALSE-ALARM CASE: nothing is announced when no row migrated', async () => {
  stubBridge([]);
  const el = await renderPanel();
  expect(migrations(el)).toBeNull();
});

it('it is its OWN seam — a migration never rides the skips strip, and the two can stand together', async () => {
  // A migration alone: the migrations strip is present and the skips strip is NOT. The two
  // say opposite things about whether the row is there, and a redesign that keeps one strip
  // for "restore notices" would put "did not come back" over a row that is on screen.
  stubBridge([MOVED]);
  const el = await renderPanel();
  expect(migrations(el)).not.toBeNull();
  expect(skipsStrip(el)).toBeNull();

  await act(async () => {
    root?.unmount();
  });
  root = null;
  container?.remove();

  // Both at once: two strips, each with its own sentence.
  stubBridge([MOVED], [{ itemId: 'item-lost', reason: 'no-layer' }]);
  const el2 = await renderPanel();
  expect(migrations(el2)).not.toBeNull();
  expect(skipsStrip(el2)).not.toBeNull();
  expect(migrations(el2)?.textContent).toContain('came back on a different row');
  expect(skipsStrip(el2)?.textContent).toContain('did not come back');
});

it('dismissing THIS report does not silence the NEXT one', async () => {
  // Keyed by CONTENT, not a boolean — a surface that can be permanently turned off by one
  // click is a surface that eventually lies. Same rule as the skips strip.
  stubBridge([MOVED]);
  const el = await renderPanel();
  const dismiss = el.querySelector<HTMLButtonElement>(
    'button[aria-label="Dismiss the migrated-row notice"]',
  );
  expect(dismiss).not.toBeNull();
  await act(async () => {
    dismiss?.click();
  });
  expect(migrations(el)).toBeNull();

  await act(async () => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  stubBridge([
    {
      itemId: 'item-ticker',
      from: { channel: 1, layer: 71 },
      to: { channel: 1, layer: 2 },
      demoted: false,
    },
  ]);
  const el2 = await renderPanel();
  expect(migrations(el2)).not.toBeNull();
  expect(migrations(el2)?.textContent).toContain('bed layer 2');
});
