// @vitest-environment jsdom
import { StrictMode, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/renderer/App.js';
import { clearPortals } from './support/dialog.js';

/**
 * The browser's context menu is suppressed app-wide.
 *
 * On a playout machine, Reload and Back are one careless right-click away from leaving a live
 * show, and nothing else on that menu says anything about the graphics on air. So the app owns
 * right-click everywhere: it opens one of OUR menus on the surfaces that define one, and
 * nothing at all anywhere else.
 */

let container: HTMLDivElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;

afterEach(async () => {
  // Unmount, so the App's `contextmenu` listener is removed — a leaked listener would make the
  // next test's assertion pass for the wrong reason.
  if (root !== null) {
    const r = root;
    await act(async () => {
      r.unmount();
      await Promise.resolve();
    });
  }
  root = null;
  container?.remove();
  container = null;
  clearPortals();
  vi.restoreAllMocks();
});

/** The App reads the whole bridge on mount; this is the quiet, everything-empty stub. */
function stubBridge(): void {
  const noop = (): (() => void) => () => undefined;
  const stub = {
    link: { status: () => 'live' as const, onStatusChanged: noop },
    templates: { list: () => Promise.resolve([]) },
    stack: { snapshot: () => Promise.resolve([]), onStateChanged: noop },
    lock: { status: () => Promise.resolve({ engaged: false }), onChanged: noop },
    connections: { snapshot: () => Promise.resolve(null), onHealthChanged: noop },
    layers: { orphans: () => Promise.resolve([]), onOrphansChanged: noop },
  };
  (window as unknown as { cg: typeof stub }).cg = stub;
}

async function renderApp(): Promise<void> {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  const r = root;
  await act(async () => {
    r.render(createElement(StrictMode, null, createElement(App)));
    await Promise.resolve();
  });
}

/** Right-click a node and report whether the browser would still have shown its own menu. */
function rightClick(target: EventTarget): boolean {
  const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
  target.dispatchEvent(event);
  return event.defaultPrevented;
}

describe('app-wide context-menu suppression', () => {
  it('suppresses the browser menu on a bare surface — and opens nothing of its own', async () => {
    stubBridge();
    await renderApp();

    const surface = container?.querySelector('main') ?? document.body;
    expect(rightClick(surface)).toBe(true);

    // Suppressed, not replaced: right-click outside our chosen surfaces does NOTHING.
    expect(document.querySelector('[role="menu"]')).toBeNull();
  });

  it('suppresses it on the document body too — the listener is on the window', async () => {
    stubBridge();
    await renderApp();

    expect(rightClick(document.body)).toBe(true);
    expect(document.querySelector('[role="menu"]')).toBeNull();
  });

  it('stops suppressing once the app unmounts — the listener is cleaned up', async () => {
    stubBridge();
    await renderApp();

    const r = root;
    root = null;
    await act(async () => {
      r?.unmount();
      await Promise.resolve();
    });

    // Nothing of ours is listening any more, so the event sails through untouched.
    expect(rightClick(document.body)).toBe(false);
  });
});
