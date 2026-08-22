// @vitest-environment jsdom
import { StrictMode, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FixedLayerBank, FixedSlotState } from '@cg/shared-ipc';
import type { StackItemState } from '@cg/shared-schema';
import { LayersPanel } from '../src/renderer/features/layers/LayersPanel.js';
import { colors } from '../src/renderer/theme.js';
import { clearPortals } from './support/dialog.js';
import { connectionsStub, linkFor, type Reachability } from './support/reachability.js';

/**
 * §4 — WHAT THE STATE LABELS SAY WHILE CASPARCG IS UNREACHABLE.
 *
 * THREE TREATMENTS, NO FOURTH, and they are asserted in ONE render because each
 * alone permits a wrong reading of the rule:
 *
 *   PAST TENSE + GREY — a label asserting something about AIR at a moment we can
 *     no longer confirm. `ON AIR` → `WAS ON AIR`. NOT generalised: it comes from
 *     the item's own `unverified` status, and no other label is renamed.
 *   GREY, NO RENAME — a label still TRUE but not currently actionable. `READY`
 *     stays `READY` (a row bound while the server is off was never ready in the
 *     past — it is ready now), and the header's on-air count stays a count.
 *   NORMAL — a label about OUR LIST alone. An unbound row reads `EMPTY` in its
 *     ordinary styling: nothing about it depends on the wire.
 *
 * A spec that checked only the rename would pass a build that greyed everything;
 * one that checked only the grey would pass a build that renamed READY to WAS
 * READY, which is the thing the owner explicitly refused.
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
  start: 70,
  count: 3,
  aliases: {},
};

const SLOTS: FixedSlotState[] = [
  // UNBOUND — nothing of ours has ever been on it.
  { channel: 1, layer: 70, observed: { kind: 'unknown' }, binding: null },
  // BOUND and READY.
  {
    channel: 1,
    layer: 71,
    observed: { kind: 'empty' },
    binding: { itemId: 'ready-item', templateType: 'clock', templateId: 'tpl-1' },
  },
  // BOUND and claiming AIR.
  {
    channel: 1,
    layer: 72,
    observed: { kind: 'producer', producer: 'html' },
    binding: { itemId: 'air-item', templateType: 'clock', templateId: 'tpl-1' },
  },
];

const STACK: StackItemState[] = [
  { itemId: 'ready-item', templateId: 'tpl-1', fields: {}, status: 'loaded', pending: false },
  { itemId: 'air-item', templateId: 'tpl-1', fields: {}, status: 'on-air', pending: false },
];

function stubBridge(reach: Reachability): void {
  const stub = {
    link: {
      status: () => linkFor(reach),
      onStatusChanged: () => () => undefined,
      resyncing: () => false,
      onResyncingChanged: () => () => undefined,
    },
    connections: connectionsStub(reach),
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
      snapshot: () => Promise.resolve(STACK),
      onStateChanged: () => () => undefined,
      clearAll: () => Promise.resolve({ ok: true, cleared: 0 }),
      removeAll: () => Promise.resolve({ ok: true, removed: 0 }),
      take: () => Promise.resolve({ accepted: true }),
      update: () => Promise.resolve({ accepted: true }),
      out: () => Promise.resolve({ accepted: true }),
      remove: () => Promise.resolve({ accepted: true }),
      // B-108 — the restore-skip report. A healthy session reports NOTHING,
      // which is what this panel renders for every spec not about that surface.
      onRestoreSkips: () => () => undefined,
    },
  };
  (window as unknown as { cg: typeof stub }).cg = stub;
}

async function renderPanel(reach: Reachability): Promise<HTMLDivElement> {
  stubBridge(reach);
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
            monitorPx: 220,
            setInspectorPx: () => undefined,
            setMonitorPx: () => undefined,
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

/**
 * A theme token as the DOM will report it back.
 *
 * The colour assertions below read the TOKEN, never a hex literal — that is the
 * repo's rule (`data-row-state` exists because a hex assertion fails the next time
 * the palette is tuned while saying nothing about the property that matters). But
 * the DOM normalises `#9CA3AF` to `rgb(156, 163, 175)`, so the token has to go
 * through the same normalisation before it can be compared.
 */
function asRendered(token: string): string {
  const probe = document.createElement('span');
  probe.style.color = token;
  return probe.style.color;
}

/** A row's STATE cell — the icon + word, and the hooks that carry its confidence. */
function stateCell(el: HTMLElement, layer: number): HTMLElement | null {
  return el.querySelector<HTMLElement>(`[data-layer="${String(layer)}"] [data-row-state]`);
}
const airCount = (el: HTMLElement): HTMLElement | null =>
  el.querySelector<HTMLElement>('[aria-label$="items on air"]');

describe('§4 — the four treatments, together, with CasparCG unreachable', () => {
  it('READY greyed · WAS ON AIR greyed · the count greyed · EMPTY normal', async () => {
    const el = await renderPanel('caspar-down');

    // 1. READY — the WORD is unchanged, only the confidence.
    const ready = stateCell(el, 71);
    expect(ready?.textContent).toContain('READY');
    expect(ready?.textContent, 'READY must NOT be renamed').not.toContain('WAS READY');
    expect(ready?.hasAttribute('data-unverifiable'), 'READY must be greyed').toBe(true);
    // …and the ROLE is untouched, which is what "only greyed" means.
    expect(ready?.getAttribute('data-row-state')).toBe('ready');
    expect(ready?.style.color).toBe(asRendered(colors.textMuted));

    // 2. ON AIR — past tense AND greyed. The one rename, and it is the item's own
    // `unverified` status doing it, not a rule applied to labels in general.
    const air = stateCell(el, 72);
    expect(air?.textContent).toContain('WAS ON AIR');
    expect(air?.hasAttribute('data-unverifiable')).toBe(true);
    expect(air?.getAttribute('data-row-state'), 'never the air tone').not.toBe('onair');

    // 3. The header count — still a count, greyed, not renamed and not hidden.
    expect(airCount(el)?.textContent).toContain('(1)');
    expect(airCount(el)?.hasAttribute('data-unverifiable')).toBe(true);
    expect(airCount(el)?.style.color).toBe(asRendered(colors.textMuted));

    // 4. EMPTY — a fact about OUR list. Normal styling, no confidence hook at all.
    const empty = stateCell(el, 70);
    expect(empty?.textContent).toContain('EMPTY');
    expect(empty?.hasAttribute('data-unverifiable'), 'EMPTY is not a wire claim').toBe(false);
    expect(empty?.style.color).toBe(asRendered(colors.emptyRow));
  });

  it('with both hops up, nothing is greyed and ON AIR is present tense', async () => {
    const el = await renderPanel('both-up');

    expect(stateCell(el, 72)?.textContent).toContain('ON AIR');
    expect(stateCell(el, 72)?.textContent).not.toContain('WAS ON AIR');
    expect(stateCell(el, 72)?.getAttribute('data-row-state')).toBe('onair');
    expect(stateCell(el, 71)?.hasAttribute('data-unverifiable')).toBe(false);
    expect(stateCell(el, 71)?.style.color).toBe(asRendered(colors.ready));
    expect(airCount(el)?.hasAttribute('data-unverifiable')).toBe(false);
    expect(airCount(el)?.style.color).toBe(asRendered(colors.onAir));
  });

  /**
   * THE BOOT WINDOW MUST NOT GREY ANYTHING — and this is the assertion that keeps
   * §4 from swallowing §2.
   *
   * The VERB gate fails closed on unknown, because refusing costs a second. A
   * LABEL that failed closed on unknown would grey a live row and past-tense its
   * air claim for the first moment of every reload — and a warning that fires
   * twice a day on a healthy plant is a warning nobody reads on the day it means
   * something.
   */
  it('the boot window greys NOTHING — unknown is not a fault', async () => {
    const el = await renderPanel('unknown');

    expect(stateCell(el, 72)?.textContent).toContain('ON AIR');
    expect(stateCell(el, 72)?.textContent).not.toContain('WAS ON AIR');
    expect(stateCell(el, 71)?.hasAttribute('data-unverifiable')).toBe(false);
    expect(airCount(el)?.hasAttribute('data-unverifiable')).toBe(false);
  });

  /**
   * R-006's other half. Test mode IS reachable — the mock executes every verb —
   * so nothing greys, and the air claim keeps its honest SIM badge rather than
   * being demoted to a past tense that would read as a real link having dropped.
   */
  it('test mode is reachable: SIM ON AIR, present tense, nothing greyed', async () => {
    const el = await renderPanel('test-mode');

    expect(stateCell(el, 72)?.textContent).toContain('SIM ON AIR');
    expect(stateCell(el, 72)?.textContent).not.toContain('WAS ON AIR');
    expect(stateCell(el, 71)?.hasAttribute('data-unverifiable')).toBe(false);
    expect(airCount(el)?.hasAttribute('data-unverifiable')).toBe(false);
  });
});
