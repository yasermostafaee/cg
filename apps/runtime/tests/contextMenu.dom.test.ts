// @vitest-environment jsdom
import { StrictMode, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { StackItemState } from '@cg/shared-schema';
import { StackRow } from '../src/renderer/features/stack/StackRow.js';
import { isEditable } from '../src/renderer/App.js';
import { onCommandError } from '../src/renderer/features/status/commandFeedback.js';

/**
 * The right-click menu is an ALTERNATE ENTRY POINT to actions that already exist —
 * never a new capability and never a second, unguarded door onto air (R-006).
 *
 * The invariant these tests exist to hold:
 *
 *   **A menu item is enabled exactly when its button is, and runs exactly what its
 *   button runs.**
 *
 * The first case asserts that by COMPARING the two surfaces across every status ×
 * link combination, rather than restating the expected gates — a restatement would
 * pass just as happily if both surfaces drifted together.
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
  document.body.innerHTML = '';
});

type Link = 'live' | 'disconnected' | 'offline-mock';

function stubLink(status: Link): void {
  const stub = { link: { status: () => status, onStatusChanged: () => () => undefined } };
  (window as unknown as { cg: typeof stub }).cg = stub;
}

function itemWith(status: StackItemState['status']): StackItemState {
  return {
    itemId: 'item-1',
    templateId: 'tpl-1',
    fields: { title: 'عنوان' },
    status,
    pending: false,
  };
}

const ok = (): Promise<{ accepted: boolean }> => Promise.resolve({ accepted: true });

interface Handlers {
  onPlay?: (id: string) => Promise<{ accepted: boolean; errorCode?: string | undefined }>;
  onUpdate?: (id: string) => Promise<{ accepted: boolean; errorCode?: string | undefined }>;
  onStop?: (id: string) => Promise<{ accepted: boolean; errorCode?: string | undefined }>;
  onOut?: (id: string) => Promise<{ accepted: boolean; errorCode?: string | undefined }>;
  onRemove?: (id: string) => Promise<{ accepted: boolean; errorCode?: string | undefined }>;
}

async function renderRow(
  status: StackItemState['status'],
  link: Link = 'live',
  handlers: Handlers = {},
): Promise<void> {
  stubLink(link);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  const r = root;
  await act(async () => {
    r.render(
      createElement(
        StrictMode,
        null,
        createElement(StackRow, {
          item: itemWith(status),
          selected: false,
          dirty: false,
          onSelect: () => undefined,
          onPlay: handlers.onPlay ?? ok,
          onUpdate: handlers.onUpdate ?? ok,
          onStop: handlers.onStop ?? ok,
          onOut: handlers.onOut ?? ok,
          onRemove: handlers.onRemove ?? ok,
        }),
      ),
    );
  });
}

/** Right-click the row, exactly as an operator would. */
async function openMenu(): Promise<void> {
  const row = container?.querySelector<HTMLElement>('[data-item-id]');
  if (row === null || row === undefined) throw new Error('row not rendered');
  await act(async () => {
    row.dispatchEvent(
      new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 40, clientY: 40 }),
    );
  });
}

function menuItems(): HTMLElement[] {
  return [...document.body.querySelectorAll<HTMLElement>('[role="menuitem"]')];
}

function buttonGates(): Map<string, boolean> {
  const out = new Map<string, boolean>();
  for (const btn of container?.querySelectorAll('button') ?? []) {
    out.set(btn.textContent?.trim() ?? '', btn.disabled);
  }
  return out;
}

function menuGates(): Map<string, boolean> {
  const out = new Map<string, boolean>();
  for (const item of menuItems()) {
    out.set(item.textContent?.trim() ?? '', item.getAttribute('aria-disabled') === 'true');
  }
  return out;
}

const STATUSES: StackItemState['status'][] = [
  'idle',
  'loaded',
  'playing',
  'on-air',
  'updating',
  'exiting',
  'unconfirmed',
  'unverified',
  'error',
  'disconnected',
];

describe('stack-row context menu mirrors the row buttons', () => {
  it('every status × link: each menu item is disabled exactly when its button is', async () => {
    for (const link of ['live', 'disconnected', 'offline-mock'] as const) {
      for (const status of STATUSES) {
        await renderRow(status, link);
        const buttons = buttonGates();
        await openMenu();
        const menu = menuGates();

        expect([...menu.keys()].sort(), `${status}/${link} labels`).toEqual(
          [...buttons.keys()].sort(),
        );
        for (const [label, disabled] of buttons) {
          expect(menu.get(label), `${label} on ${status}/${link}`).toBe(disabled);
        }

        // Teardown between iterations (afterEach only runs once per `it`).
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
    }
  });

  it('DISCONNECTED: every on-air verb is disabled in the MENU too (R-006 — no second door)', async () => {
    await renderRow('on-air', 'disconnected');
    await openMenu();
    const menu = menuGates();
    expect(menu.get('PLAY')).toBe(true);
    expect(menu.get('UPDATE')).toBe(true);
    expect(menu.get('CLEAR')).toBe(true);
    // B-085 — REMOVE is bridge-owned stack state, so it is gated too.
    expect(menu.get('REMOVE')).toBe(true);
  });

  it('a menu item runs the SAME handler the button runs', async () => {
    const onOut = vi.fn(ok);
    await renderRow('on-air', 'live', { onOut });
    await openMenu();

    const clear = menuItems().find((i) => i.textContent?.trim() === 'CLEAR');
    await act(async () => {
      clear?.click();
    });

    // The row's own `onOut` prop — not a duplicate command path built for the menu.
    expect(onOut).toHaveBeenCalledTimes(1);
    expect(onOut).toHaveBeenCalledWith('item-1');
  });

  it('a DISABLED menu item does nothing when clicked', async () => {
    const onPlay = vi.fn(ok);
    // on-air ⇒ PLAY is disabled (nothing to take that is already taken).
    await renderRow('on-air', 'live', { onPlay });
    await openMenu();

    const play = menuItems().find((i) => i.textContent?.trim() === 'PLAY');
    await act(async () => {
      play?.click();
    });
    expect(onPlay).not.toHaveBeenCalled();
  });

  it('a refusal from a MENU action surfaces as a toast, never inline in the row', async () => {
    const messages: string[] = [];
    const unsub = onCommandError((m) => messages.push(m));
    try {
      await renderRow('on-air', 'live', {
        onOut: () => Promise.resolve({ accepted: false, errorCode: 'disconnected' }),
      });
      await openMenu();
      const clear = menuItems().find((i) => i.textContent?.trim() === 'CLEAR');
      await act(async () => {
        clear?.click();
      });
      await act(async () => {
        await Promise.resolve();
      });

      expect(messages).toHaveLength(1);
      // The bridge's REASON, not a generic fallback — the same wording the button produces,
      // because both map the result through `asyncResultMessage`.
      expect(messages[0]).toMatch(/connect/i);
      // Nothing pinned into the row itself.
      expect(container?.querySelector('.cg-btn-error')).toBeNull();
    } finally {
      unsub();
    }
  });
});

describe('context menu dismissal', () => {
  it('closes on Escape', async () => {
    await renderRow('loaded');
    await openMenu();
    expect(menuItems().length).toBeGreaterThan(0);

    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(menuItems()).toHaveLength(0);
  });

  it('closes on an outside click', async () => {
    await renderRow('loaded');
    await openMenu();
    expect(menuItems().length).toBeGreaterThan(0);

    const backdrop = document.body.querySelector<HTMLElement>('[role="presentation"]');
    await act(async () => {
      // jsdom has no `PointerEvent`; React listens for the 'pointerdown' TYPE, so a
      // MouseEvent of that type drives the same handler.
      backdrop?.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    });
    expect(menuItems()).toHaveLength(0);
  });

  it('closes on scroll — a menu must never point at a row that slid away', async () => {
    await renderRow('loaded');
    await openMenu();
    expect(menuItems().length).toBeGreaterThan(0);

    await act(async () => {
      window.dispatchEvent(new Event('scroll'));
    });
    expect(menuItems()).toHaveLength(0);
  });

  it('closes after running an action, so it never outlives its row', async () => {
    await renderRow('loaded');
    await openMenu();
    const play = menuItems().find((i) => i.textContent?.trim() === 'PLAY');
    await act(async () => {
      play?.click();
    });
    expect(menuItems()).toHaveLength(0);
  });
});

describe('native context-menu suppression exempts text entry', () => {
  it('suppresses over the operator surface, but not in fields the operator types in', () => {
    const div = document.createElement('div');
    expect(isEditable(div)).toBe(false);

    const textarea = document.createElement('textarea');
    expect(isEditable(textarea)).toBe(true);

    // The Runtime's field editing is Persian — cut/copy/paste and the BiDi services
    // are real affordances, so text inputs keep the browser's own menu.
    for (const type of ['text', 'search', 'url', 'tel', 'email', 'password', 'number']) {
      const input = document.createElement('input');
      input.type = type;
      expect(isEditable(input), type).toBe(true);
    }
    // An input with no type is a text input.
    expect(isEditable(document.createElement('input'))).toBe(true);

    // A non-text input has nothing to copy out of it — it stays suppressed.
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    expect(isEditable(checkbox)).toBe(false);

    const editableHost = document.createElement('div');
    Object.defineProperty(editableHost, 'isContentEditable', { value: true });
    expect(isEditable(editableHost)).toBe(true);

    expect(isEditable(null)).toBe(false);
  });
});
