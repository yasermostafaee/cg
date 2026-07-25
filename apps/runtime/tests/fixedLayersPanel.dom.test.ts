// @vitest-environment jsdom
import { StrictMode, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { FixedLayerBank, FixedSlotState } from '@cg/shared-ipc';
import { FixedLayersPanel } from '../src/renderer/features/fixedLayers/FixedLayersPanel.js';
import { FixedRow } from '../src/renderer/features/fixedLayers/FixedRow.js';
import { onCommandError } from '../src/renderer/features/status/commandFeedback.js';
import { clearPortals, clickDialogButton, openDialog } from './support/dialog.js';

/**
 * R-021 stage 2b — the fixed-bank panel + row:
 *
 *  - idle-quiet: NO bank ⇒ the panel renders NOTHING (byte-identical to today);
 *  - permanent rows render alias + layer number and HONEST occupancy (unknown
 *    is explicit, never "empty" — B-094);
 *  - the D1 verb split, asserted by COMPARING the button and menu surfaces
 *    (the contextMenu.dom.test.ts approach — a restated expectation would pass
 *    just as happily if both surfaces drifted together);
 *  - the confirm gate: accept sends exactly ONE layers.clear for that layer;
 *    cancel sends none, toasts nothing, and flashes no success;
 *  - the D8 dead-link mask: every row displays unknown and offers nothing.
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

type Link = 'live' | 'disconnected' | 'offline-mock';

const BANK: FixedLayerBank = {
  channel: 1,
  start: 70,
  count: 4,
  aliases: { '70': 'CLOCK', '71': 'LOWER THIRD' },
};

function slotOf(
  layer: number,
  observed: FixedSlotState['observed'],
  alias?: string,
): FixedSlotState {
  return { channel: 1, layer, ...(alias !== undefined ? { alias } : {}), observed, binding: null };
}

/** The D9 seed shape: html / non-html / empty / unknown — all four display cases. */
function seededSlots(): FixedSlotState[] {
  return [
    slotOf(70, { kind: 'producer', producer: 'html' }, 'CLOCK'),
    slotOf(71, { kind: 'producer', producer: 'ffmpeg' }, 'LOWER THIRD'),
    slotOf(72, { kind: 'empty' }),
    slotOf(73, { kind: 'unknown' }),
  ];
}

function stubBridge(
  bank: FixedLayerBank | null,
  slots: FixedSlotState[],
  link: Link = 'offline-mock',
): { clear: Mock } {
  const clear = vi.fn(() => Promise.resolve({ ok: true }));
  const stub = {
    link: { status: () => link, onStatusChanged: () => () => undefined },
    fixedLayers: {
      config: () => Promise.resolve(bank),
      state: () => Promise.resolve(slots),
      onConfigChanged: () => () => undefined,
      onStateChanged: () => () => undefined,
      setConfig: () => Promise.resolve({ ok: true }),
    },
    layers: { clear },
  };
  (window as unknown as { cg: typeof stub }).cg = stub;
  return { clear };
}

async function render(element: JSX.Element): Promise<HTMLDivElement> {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  const r = root;
  await act(async () => {
    r.render(createElement(StrictMode, null, element));
  });
  // Flush the useBridgeSnapshot pulls (fetch → setState is a microtask).
  await act(async () => {
    await Promise.resolve();
  });
  return container;
}

function rowOf(el: HTMLElement, layer: number): HTMLElement | null {
  return el.querySelector<HTMLElement>(`[data-layer="${String(layer)}"]`);
}

function buttonsOf(row: HTMLElement | null): string[] {
  return [...(row?.querySelectorAll('button') ?? [])].map((b) => b.textContent?.trim() ?? '');
}

async function openMenu(row: HTMLElement): Promise<void> {
  await act(async () => {
    row.dispatchEvent(
      new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 40, clientY: 40 }),
    );
  });
}

function menuLabels(): string[] {
  return [...document.body.querySelectorAll<HTMLElement>('[role="menuitem"]')].map(
    (i) => i.textContent?.trim() ?? '',
  );
}

describe('FixedLayersPanel — idle-quiet and honest rows', () => {
  it('renders NOTHING when no bank is declared', async () => {
    stubBridge(null, []);
    const el = await render(createElement(FixedLayersPanel));
    expect(el.querySelector('[aria-label="Fixed layers"]')).toBeNull();
    expect(el.textContent).toBe('');
  });

  it('renders one permanent row per slot with alias + layer number', async () => {
    stubBridge(BANK, seededSlots());
    const el = await render(createElement(FixedLayersPanel));
    const panel = el.querySelector('[aria-label="Fixed layers"]');
    expect(panel).not.toBeNull();
    expect(el.querySelectorAll('[data-layer]')).toHaveLength(4);
    // Aliased rows show the alias AND the layer number; bare rows the number.
    expect(rowOf(el, 70)?.textContent).toContain('CLOCK');
    expect(rowOf(el, 70)?.textContent).toContain('layer 70');
    expect(rowOf(el, 71)?.textContent).toContain('LOWER THIRD');
    expect(rowOf(el, 73)?.textContent).toContain('Layer 73');
  });

  it('unknown occupancy reads as explicitly unknown — NEVER as empty (B-094)', async () => {
    stubBridge(BANK, seededSlots());
    const el = await render(createElement(FixedLayersPanel));
    const unknownRow = rowOf(el, 73);
    expect(unknownRow?.textContent).toContain('no signal — occupancy unknown');
    expect(unknownRow?.textContent).not.toContain('empty');
    // …while the genuinely-empty row says so.
    expect(rowOf(el, 72)?.textContent).toContain('empty');
  });

  it('the header Configure opens the bank config modal', async () => {
    stubBridge(BANK, seededSlots());
    const el = await render(createElement(FixedLayersPanel));
    const configure = [...el.querySelectorAll('button')].find(
      (b) => b.textContent?.trim() === 'Configure',
    );
    expect(configure).not.toBeUndefined();
    await act(async () => {
      configure?.click();
    });
    expect(openDialog()?.textContent).toContain('bank configuration');
  });
});

describe('FixedRow — the D1 verb split, button/menu parity by comparison', () => {
  it('across all four observation cases, the menu offers exactly what the buttons offer', async () => {
    for (const slot of seededSlots()) {
      stubBridge(BANK, [slot], 'live');
      const el = await render(createElement(FixedRow, { slot }));
      const row = rowOf(el, slot.layer);
      expect(row).not.toBeNull();
      if (row === null) continue;

      const buttons = buttonsOf(row);
      await openMenu(row);
      const menu = menuLabels();
      // COMPARED, not restated: whatever the buttons offer, the menu mirrors —
      // including offering NOTHING (no empty menu shell for a verb-less row).
      expect(menu.sort(), `layer ${String(slot.layer)}`).toEqual([...buttons].sort());

      const r = root;
      if (r !== null) {
        await act(async () => {
          r.unmount();
        });
      }
      root = null;
      container?.remove();
      container = null;
      document.body.innerHTML = '';
    }
  });

  it('only the observed-html row offers CLEAR; unknown/empty/non-html offer NO control', async () => {
    stubBridge(BANK, seededSlots(), 'live');
    const el = await render(createElement(FixedLayersPanel));
    expect(buttonsOf(rowOf(el, 70))).toEqual(['CLEAR']);
    expect(buttonsOf(rowOf(el, 71))).toEqual([]);
    expect(buttonsOf(rowOf(el, 72))).toEqual([]);
    expect(buttonsOf(rowOf(el, 73))).toEqual([]);
  });

  it('D8 — a dead link masks every row to unknown and strips every control', async () => {
    // The snapshot still CLAIMS producer/empty (frozen data); the link is down.
    const slot = slotOf(70, { kind: 'producer', producer: 'html' }, 'CLOCK');
    stubBridge(BANK, [slot], 'disconnected');
    const el = await render(createElement(FixedRow, { slot }));
    const row = rowOf(el, 70);
    expect(row?.textContent).toContain('not connected — occupancy unknown');
    expect(row?.textContent).not.toContain('occupied');
    expect(buttonsOf(row)).toEqual([]);
  });

  it('confirm-accept sends exactly ONE layers.clear for that layer', async () => {
    const slot = slotOf(70, { kind: 'producer', producer: 'html' }, 'CLOCK');
    const { clear } = stubBridge(BANK, [slot], 'live');
    const el = await render(createElement(FixedRow, { slot }));

    const btn = [...(rowOf(el, 70)?.querySelectorAll('button') ?? [])].find(
      (b) => b.textContent?.trim() === 'CLEAR',
    );
    await act(async () => {
      btn?.click();
      await Promise.resolve();
    });

    // The gate is the app's own modal, naming the layer; nothing sent yet.
    expect(openDialog()?.textContent).toContain('Clear layer 1-70');
    expect(clear).not.toHaveBeenCalled();

    await clickDialogButton('Clear layer');
    expect(clear).toHaveBeenCalledTimes(1);
    expect(clear).toHaveBeenCalledWith({ channel: 1, layer: 70 });
  });

  it('cancel sends nothing, toasts nothing, and flashes no success', async () => {
    const slot = slotOf(70, { kind: 'producer', producer: 'html' }, 'CLOCK');
    const { clear } = stubBridge(BANK, [slot], 'live');
    const toasts: string[] = [];
    const unsub = onCommandError((m) => toasts.push(m));
    try {
      const el = await render(createElement(FixedRow, { slot }));
      const btn = [...(rowOf(el, 70)?.querySelectorAll('button') ?? [])].find(
        (b) => b.textContent?.trim() === 'CLEAR',
      );
      await act(async () => {
        btn?.click();
        await Promise.resolve();
      });
      await clickDialogButton('Cancel');
      await act(async () => {
        await Promise.resolve();
      });

      expect(clear).not.toHaveBeenCalled();
      expect(toasts).toEqual([]);
      expect(openDialog()).toBeNull();
      // No success flash: a cancel is not a success (the D3 `cancelled` path).
      expect(btn?.classList.contains('is-success')).toBe(false);
      expect(el.querySelector('.cg-btn-error')).toBeNull();
    } finally {
      unsub();
    }
  });

  it('the context-menu CLEAR passes through the SAME confirm gate', async () => {
    const slot = slotOf(70, { kind: 'producer', producer: 'html' }, 'CLOCK');
    const { clear } = stubBridge(BANK, [slot], 'live');
    const el = await render(createElement(FixedRow, { slot }));
    const row = rowOf(el, 70);
    expect(row).not.toBeNull();
    if (row === null) return;

    await openMenu(row);
    const item = [...document.body.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(
      (i) => i.textContent?.trim() === 'CLEAR',
    );
    await act(async () => {
      item?.click();
      await Promise.resolve();
    });

    // The menu path hits the same declaration-time gate — dialog first, no send.
    expect(openDialog()?.textContent).toContain('Clear layer 1-70');
    expect(clear).not.toHaveBeenCalled();
    await clickDialogButton('Clear layer');
    expect(clear).toHaveBeenCalledTimes(1);
    expect(clear).toHaveBeenCalledWith({ channel: 1, layer: 70 });
  });
});
