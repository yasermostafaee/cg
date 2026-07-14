// @vitest-environment jsdom
import { StrictMode, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { StackItemState } from '@cg/shared-schema';
import { StackRow } from '../src/renderer/features/stack/StackRow.js';
import { clearPortals } from './support/dialog.js';

/**
 * Right-click on a stack row opens the app's OWN menu — and that menu is a shortcut to the
 * row's buttons, never a second way around their gates.
 *
 * The gate that matters is R-006: PLAY / UPDATE / CLEAR are refused while the bridge link is
 * down, and the buttons say so by being disabled. A context-menu item that stayed live there
 * would be an unguarded route to air, so these pin the menu's disabled state to the buttons'.
 */

let container: HTMLDivElement | null = null;

afterEach(() => {
  container?.remove();
  container = null;
  clearPortals();
  document.querySelectorAll('[role="menu"]').forEach((n) => n.remove());
  vi.restoreAllMocks();
});

function item(status: StackItemState['status']): StackItemState {
  return { itemId: 'i1', templateId: 'tpl', fields: {}, status, pending: false };
}

/** `useLink` reads the bridge, so the link state is stubbed at the bridge. */
function stubLink(status: 'live' | 'disconnected'): void {
  const stub = {
    link: { status: () => status, onStatusChanged: () => () => undefined },
  };
  (window as unknown as { cg: typeof stub }).cg = stub;
}

interface Handlers {
  onPlay: Mock;
  onUpdate: Mock;
  onOut: Mock;
  onRemove: Mock;
}

async function renderRow(state: StackItemState): Promise<{ el: HTMLElement; h: Handlers }> {
  const accepted = (): Promise<{ accepted: boolean }> => Promise.resolve({ accepted: true });
  const h: Handlers = {
    onPlay: vi.fn(accepted),
    onUpdate: vi.fn(accepted),
    onOut: vi.fn(accepted),
    onRemove: vi.fn(accepted),
  };
  container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      createElement(
        StrictMode,
        null,
        createElement(StackRow, {
          item: state,
          selected: false,
          dirty: false,
          templateLabel: 'Lower Third',
          onSelect: () => undefined,
          ...h,
        }),
      ),
    );
    await Promise.resolve();
  });
  return { el: container, h };
}

/** Right-click the row body (the one part of the row guaranteed not to be a control). */
async function rightClickRow(el: HTMLElement): Promise<void> {
  const row = el.querySelector('.cg-row');
  await act(async () => {
    row?.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    await Promise.resolve();
  });
}

const menu = (): HTMLElement | null => document.querySelector<HTMLElement>('[role="menu"]');

function menuItem(label: string): HTMLElement | undefined {
  return [...(menu()?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])].find(
    (n) => n.textContent === label,
  );
}

async function clickMenuItem(label: string): Promise<void> {
  const node = menuItem(label);
  if (node === undefined) throw new Error(`no “${label}” item in the open menu`);
  await act(async () => {
    node.click();
    await Promise.resolve();
  });
}

describe('StackRow right-click menu', () => {
  it('opens the app menu and suppresses the browser default', async () => {
    stubLink('live');
    const { el } = await renderRow(item('idle'));

    expect(menu()).toBeNull();

    const row = el.querySelector('.cg-row');
    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    await act(async () => {
      row?.dispatchEvent(event);
      await Promise.resolve();
    });

    // The browser's menu never gets to open: the row's handler prevents it.
    expect(event.defaultPrevented).toBe(true);
    expect(menu()).not.toBeNull();
    expect(menuItem('Play')).toBeDefined();
    expect(menuItem('Remove')).toBeDefined();
  });

  it('runs the row action it names — on the row that was right-clicked', async () => {
    stubLink('live');
    const { el, h } = await renderRow(item('idle'));
    await rightClickRow(el);

    await clickMenuItem('Play');

    expect(h.onPlay).toHaveBeenCalledWith('i1');
    // The menu closes behind the action; it must not outlive the row it acts on.
    expect(menu()).toBeNull();
  });

  it('Remove is always available — it does not need the link', async () => {
    stubLink('disconnected');
    const { el, h } = await renderRow(item('idle'));
    await rightClickRow(el);

    expect(menuItem('Remove')?.getAttribute('aria-disabled')).toBe('false');
    await clickMenuItem('Remove');
    expect(h.onRemove).toHaveBeenCalledWith('i1');
  });

  it('R-006 — while the link is down, the on-air actions are disabled in the menu too', async () => {
    stubLink('disconnected');
    const { el, h } = await renderRow(item('on-air'));
    await rightClickRow(el);

    for (const label of ['Play', 'Update', 'Clear']) {
      expect(menuItem(label)?.getAttribute('aria-disabled')).toBe('true');
    }

    // And clicking one does nothing — it is inert, not merely greyed.
    await clickMenuItem('Clear');
    expect(h.onOut).not.toHaveBeenCalled();
    expect(h.onPlay).not.toHaveBeenCalled();
    expect(h.onUpdate).not.toHaveBeenCalled();
  });

  it('mirrors the buttons’ gates exactly, whatever the row’s state', async () => {
    stubLink('live');
    // An on-air row: PLAY is spent, UPDATE and CLEAR are live.
    const { el } = await renderRow(item('on-air'));
    await rightClickRow(el);

    expect(menuItem('Play')?.getAttribute('aria-disabled')).toBe('true');
    expect(menuItem('Update')?.getAttribute('aria-disabled')).toBe('false');
    expect(menuItem('Clear')?.getAttribute('aria-disabled')).toBe('false');
  });

  it('an idle row cannot be updated or cleared — there is nothing on air', async () => {
    stubLink('live');
    const { el } = await renderRow(item('idle'));
    await rightClickRow(el);

    expect(menuItem('Play')?.getAttribute('aria-disabled')).toBe('false');
    expect(menuItem('Update')?.getAttribute('aria-disabled')).toBe('true');
    expect(menuItem('Clear')?.getAttribute('aria-disabled')).toBe('true');
  });

  it('Escape closes it', async () => {
    stubLink('live');
    const { el } = await renderRow(item('idle'));
    await rightClickRow(el);
    expect(menu()).not.toBeNull();

    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await Promise.resolve();
    });

    expect(menu()).toBeNull();
  });
});
