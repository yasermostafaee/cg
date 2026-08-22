// @vitest-environment jsdom
import { StrictMode, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, expect, it, vi } from 'vitest';
import type { FixedLayerBank, FixedSlotState, RestoreSkip } from '@cg/shared-ipc';
import { LayersPanel } from '../src/renderer/features/layers/LayersPanel.js';
import { clearPortals } from './support/dialog.js';
import { connectionsStub } from './support/reachability.js';

/**
 * B-108 — **a row that does not come back must not vanish in silence.**
 *
 * On every reconnect the browser re-delivers its retained stack intent and the
 * bridge re-seats what it can. What it cannot re-seat is skipped — and the row
 * simply disappears from the operator's list. `WebSocketRuntime.#resync` awaited the
 * restore and DISCARDED its result, so nothing anywhere said how many rows were gone
 * or why. Silently NOT restoring something is the same class of lie as falsely
 * restoring it.
 *
 * WHAT THESE PIN, and it is the pair rather than the presence:
 *
 *  1. a LOSS is announced, names the rows, and says what to do about each;
 *  2. the BENIGN case announces NOTHING. A page reload against a healthy bridge
 *     skips every item (the live bridge already holds them) and loses no row at all.
 *     A notice there would be a false alarm on the most ordinary event there is —
 *     and an alarm that cries wolf on every reload is one nobody reads when it is
 *     real. The filtering happens in `#resync`, so this asserts the panel does not
 *     invent one either.
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

const BANK: FixedLayerBank = { channel: 1, start: 70, count: 2, aliases: {} };
const SLOTS: FixedSlotState[] = [
  { channel: 1, layer: 70, observed: { kind: 'empty' }, binding: null },
  { channel: 1, layer: 71, observed: { kind: 'empty' }, binding: null },
];

function stubBridge(skips: RestoreSkip[]): void {
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
      // The live implementation replays the latest report on subscribe, because the
      // panel mounts AFTER boot — so the stub does too, or it would be testing a
      // contract the product does not have.
      onRestoreSkips: (handler: (s: readonly RestoreSkip[]) => void) => {
        handler(skips);
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
        /*
          🔴 **SESSION BR — THIS CALL WAS THREE APIs OUT OF DATE, and only a typecheck of
          `tests/` could see it.**

          It passed `selectedItemId` (the prop is `selectedId`), `layout: 'wide'` (the prop is
          a `ShellLayout` OBJECT), and omitted `inspectorOpen` / `onToggleInspector`
          entirely. React does not object: unknown props are dropped and missing ones are
          `undefined`. So this spec has been rendering the panel with **no selection prop, a
          string where the layout object goes, and no inspector controls** — and its
          assertion about the restore-skips notice held anyway, because that notice does not
          depend on any of them.

          The assertion is therefore intact and is NOT being changed. What changes is the
          harness around it: the panel is now rendered the way its siblings render it, so the
          spec is exercising the component the product actually mounts.
        */
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

function notice(el: HTMLElement): HTMLElement | null {
  return el.querySelector('[data-restore-skips]');
}

it('B-108: lost rows are announced, by id and with what to do about each', async () => {
  stubBridge([
    { itemId: 'headline', reason: 'unknown-template' },
    { itemId: 'ticker', reason: 'no-layer' },
  ]);
  const el = await renderPanel();

  const strip = notice(el);
  expect(strip).not.toBeNull();
  // The COUNT, so the operator knows the size of the gap at a glance…
  expect(strip?.textContent).toContain('2 rows did not come back');
  // …the IDs, so they know WHICH rows to rebuild…
  expect(strip?.textContent).toContain('headline');
  expect(strip?.textContent).toContain('ticker');
  // …and an ACTION per reason, because the two situations need different ones. A
  // bare reason code is not an explanation.
  expect(strip?.textContent).toContain('re-import');
  expect(strip?.textContent).toContain('remove something');
  // It INTERRUPTS: rows the operator was looking at are gone, which is not the
  // ordinary first second of a page (that is the awaiting strip's job, `status`).
  expect(strip?.getAttribute('role')).toBe('alert');
});

it('B-108: ONE lost row reads as one row, not "1 rows"', async () => {
  stubBridge([{ itemId: 'headline', reason: 'unknown-template' }]);
  const el = await renderPanel();
  expect(notice(el)?.textContent).toContain('1 row did not come back');
});

it('B-108 THE NO-FALSE-ALARM CASE: nothing is announced when nothing was lost', async () => {
  // The empty report is what a healthy reconnect produces — including the page
  // reload against a live bridge, whose every skip is the benign already-held one
  // and is filtered out upstream in `#resync`.
  stubBridge([]);
  const el = await renderPanel();
  expect(notice(el)).toBeNull();
});

it('B-108: dismissing THIS report does not silence the NEXT one', async () => {
  // The notice is keyed by CONTENT, not by a boolean. A boolean would let one click
  // silence every future reconnect — a surface that can be permanently turned off is
  // a surface that eventually lies.
  stubBridge([{ itemId: 'headline', reason: 'no-layer' }]);
  const el = await renderPanel();
  const dismiss = el.querySelector<HTMLButtonElement>(
    'button[aria-label="Dismiss the restore notice"]',
  );
  expect(dismiss).not.toBeNull();
  await act(async () => {
    dismiss?.click();
  });
  expect(notice(el)).toBeNull();

  // A DIFFERENT report arrives (a second reconnect lost a different row): it shows.
  await act(async () => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  stubBridge([{ itemId: 'ticker', reason: 'no-layer' }]);
  const el2 = await renderPanel();
  expect(notice(el2)).not.toBeNull();
  expect(notice(el2)?.textContent).toContain('ticker');
});
