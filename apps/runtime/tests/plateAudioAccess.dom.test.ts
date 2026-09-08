// @vitest-environment jsdom
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/renderer/App.js';
import { createMockBridge } from '../src/platform/createRuntimeBridge.js';
import { __resetDraftsForTest } from '../src/renderer/features/inspector/draftStore.js';
import type { RuntimeBridge } from '../src/shared/runtime-bridge.js';
import { installMemoryStorage } from './support/localStorage.js';

/**
 * 🔴 `RUNTIME-REDESIGN-01` PHASE 6 — **the audio modal opens by RIGHT-CLICK and by the
 * keyboard, from both of its doors, and SOLO is scoped to the OWNING ROW.**
 *
 * On the whole `App` with the e2e-armed mock under it, the way the E2E harness boots it:
 *
 *   - the LAYER ROW's door — right-click (or `Shift+F10` / `ContextMenu`) opens the row's own
 *     menu, whose AUDIO item opens the dialog on that row;
 *   - the PLATE's door — on the LIVE SOURCES tab, right-click (or the same two keys) on a seated
 *     plate opens the dialog on the plate's OWNING ROW with that plate's fader focused.
 *
 * Keyboard parity is not optional (`PROMPT.md` §6): every pointer path here has a keyboard
 * twin asserted beside it, and both must land in the SAME dialog.
 *
 * ── SOLO NAMES THE OWNING ROW ────────────────────────────────────────────────
 *
 * Two rows carry plates: `item-irib-news` (the seeded ledger — `guest-1` on screen and
 * `guest-2` HELD, the hidden frame) and `item-looks` (four declared plates, none seated). Every
 * plate on both is raised first, so a silence anywhere is attributable. SOLO on the news row's
 * `guest-1` must silence `guest-2` — the hidden frame — and leave `item-looks`'s intents
 * exactly as they were. A SOLO that silenced everything would fail here; one scoped to the
 * visible look would fail here too. The bridge-side twin, at the wire, is
 * `tools/caspar-bridge/tests/audio-does-not-take.integration.test.ts`.
 */

class NoopResizeObserver {
  observe(): void {
    /* geometry is measured in Playwright */
  }
  unobserve(): void {
    /* no-op */
  }
  disconnect(): void {
    /* no-op */
  }
}
(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = NoopResizeObserver;
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** The seeded row that declares plates (`e2e-looks`, four boxes) — the row door's subject. */
const PLATE_ROW = 89;
const NEWS = 'item-irib-news';
const LOOKS = 'item-looks';

let root: Root | null = null;
let host: HTMLDivElement | null = null;
let cg: RuntimeBridge;

beforeEach(async () => {
  (globalThis as { CG_E2E?: boolean }).CG_E2E = true;
  (globalThis as { CG_E2E_FIXED_BANK?: boolean }).CG_E2E_FIXED_BANK = true;
  installMemoryStorage();
  cg = createMockBridge();
  window.cg = cg;
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root?.render(createElement(App));
    await flush();
  });
  await act(flush);
  expect(row(PLATE_ROW).getAttribute('data-item-id')).toBe(LOOKS);
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  host?.remove();
  host = null;
  for (const node of document.querySelectorAll('[role="presentation"]')) node.remove();
  __resetDraftsForTest();
  vi.restoreAllMocks();
});

async function flush(): Promise<void> {
  for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 0));
}

function row(layer: number): HTMLElement {
  const el = document.querySelector<HTMLElement>(`[data-layer="${String(layer)}"]`);
  if (el === null) throw new Error(`no row for layer ${String(layer)}`);
  return el;
}

function dialog(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[role="dialog"]');
}

function menu(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[role="menu"]');
}

async function rightClick(target: Element): Promise<MouseEvent> {
  const ev = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2 });
  await act(async () => {
    target.dispatchEvent(ev);
    await flush();
  });
  return ev;
}

async function key(target: Element, init: KeyboardEventInit): Promise<void> {
  await act(async () => {
    target.dispatchEvent(
      new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init }),
    );
    await flush();
  });
}

async function click(el: Element | null): Promise<void> {
  if (el === null) throw new Error('nothing to click');
  await act(async () => {
    (el as HTMLElement).click();
    await flush();
  });
}

/** The open menu's AUDIO item. */
function audioItem(): HTMLElement | null {
  return (
    [...(menu()?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])].find(
      (i) => i.textContent?.trim() === 'AUDIO',
    ) ?? null
  );
}

async function openLiveSourcesTab(): Promise<void> {
  const tab = [...document.querySelectorAll<HTMLElement>('[role="tab"]')].find((t) =>
    /^LIVE SOURCES/.test(t.textContent ?? ''),
  );
  await click(tab ?? null);
}

function plateRow(coordinate: string): HTMLElement {
  const el = document.querySelector<HTMLElement>(`[data-live-layer="${coordinate}"]`);
  if (el === null) throw new Error(`no plate row ${coordinate}`);
  return el;
}

async function closeDialog(): Promise<void> {
  const close = [...(dialog()?.querySelectorAll('button') ?? [])].find(
    (b) => b.textContent === 'Close',
  );
  await click(close ?? null);
  expect(dialog()).toBeNull();
}

function dialogNames(): string {
  return dialog()?.querySelector('[data-audio-subtitle]')?.textContent ?? '';
}

describe('the LAYER ROW door — right-click and its keyboard twins reach the audio dialog', () => {
  it('right-click → menu → AUDIO opens the dialog on THAT row', async () => {
    const ev = await rightClick(row(PLATE_ROW));
    expect(ev.defaultPrevented).toBe(true);
    expect(menu(), 'the row’s own menu opened').not.toBeNull();
    await click(audioItem());
    expect(dialog()).not.toBeNull();
    expect(dialog()?.textContent).toContain('Live plate audio');
    // Four declared, unseated plates — the row's own, named.
    expect(dialog()?.querySelectorAll('[data-audio-plate]')).toHaveLength(4);
    expect(dialog()?.querySelector('[data-audio-subtitle]')?.getAttribute('title')).toContain(
      LOOKS,
    );
  });

  it('🔴 `Shift+F10` on the focused row → menu → Enter on AUDIO opens the SAME dialog', async () => {
    const r = row(PLATE_ROW);
    r.focus();
    await key(r, { key: 'F10', shiftKey: true });
    expect(menu(), 'Shift+F10 opened the row’s menu').not.toBeNull();
    const item = audioItem();
    expect(item).not.toBeNull();
    item?.focus();
    await key(item as Element, { key: 'Enter' });
    expect(dialog()).not.toBeNull();
    expect(dialog()?.querySelectorAll('[data-audio-plate]')).toHaveLength(4);
  });

  it('🔴 the `ContextMenu` key does the same', async () => {
    const r = row(PLATE_ROW);
    r.focus();
    await key(r, { key: 'ContextMenu' });
    expect(menu()).not.toBeNull();
    await click(audioItem());
    expect(dialog()).not.toBeNull();
  });
});

describe('the PLATE door — on LIVE SOURCES, a seated plate opens its OWNING ROW’s audio', () => {
  it('right-click on a plate opens the dialog on the owner with THAT plate’s fader focused', async () => {
    await openLiveSourcesTab();
    const held = plateRow('1-11');
    const ev = await rightClick(held);
    expect(ev.defaultPrevented).toBe(true);
    expect(dialog()).not.toBeNull();
    // The OWNER — the seeded news row — not the plate's own coordinate as a title.
    expect(dialog()?.querySelector('[data-audio-subtitle]')?.getAttribute('title')).toContain(NEWS);
    // Both of the owner's seated plates are listed; the one pointed at holds focus.
    expect(dialog()?.querySelectorAll('[data-audio-plate]')).toHaveLength(2);
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Volume for guest-2');
    // …and the hidden frame reads as hidden, never as audible (A12).
    const hidden = dialog()?.querySelector('[data-audio-plate="guest-2"]');
    expect(hidden?.textContent).toContain('HIDDEN BY THIS LOOK');
    expect(hidden?.textContent).toContain('on 1-11');
  });

  it('🔴 `Shift+F10` and `ContextMenu` on a focused plate row open the same dialog', async () => {
    await openLiveSourcesTab();
    const shown = plateRow('1-10');
    shown.focus();
    await key(shown, { key: 'F10', shiftKey: true });
    expect(dialog(), 'Shift+F10 opened the dialog').not.toBeNull();
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Volume for guest-1');
    await closeDialog();

    shown.focus();
    await key(shown, { key: 'ContextMenu' });
    expect(dialog(), 'the ContextMenu key opened the dialog').not.toBeNull();
    expect(dialogNames()).not.toBe('');
  });
});

describe('🔴 SOLO is scoped to the OWNING ROW — item-irib-news — hidden frames included', () => {
  it('SOLO on the news row’s guest-1 silences its HIDDEN guest-2 and touches nothing on item-looks', async () => {
    // Every plate on BOTH rows raised, so a silence anywhere is attributable.
    expect(
      (await cg.stack.setPlateVolumes({ itemId: NEWS, volumes: { 'guest-1': 1, 'guest-2': 1 } }))
        .ok,
    ).toBe(true);
    expect(
      (await cg.stack.setPlateVolumes({ itemId: LOOKS, volumes: { 'live-1': 1, 'live-2': 1 } })).ok,
    ).toBe(true);
    await act(flush);

    await openLiveSourcesTab();
    await rightClick(plateRow('1-10'));
    expect(dialog()).not.toBeNull();
    const solo = dialog()?.querySelector<HTMLButtonElement>('button[aria-label^="Solo guest-1"]');
    expect(solo?.disabled).toBe(false);
    await click(solo ?? null);

    const items = await cg.stack.snapshot();
    const news = items.find((i) => i.itemId === NEWS);
    const looks = items.find((i) => i.itemId === LOOKS);
    // The owning row: the raised plate at 1, the HIDDEN frame at 0.
    expect(news?.plateVolumes).toEqual({ 'guest-1': 1, 'guest-2': 0 });
    // The row SOLO does not own: exactly as it was.
    expect(looks?.plateVolumes).toEqual({ 'live-1': 1, 'live-2': 1 });
    // …and the dialog agrees with the bridge about what it just did.
    expect(dialog()?.querySelector('[data-audio-plate="guest-2"]')?.textContent).toContain('0%');
  });
});
