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
 * 🔴 `RUNTIME-REDESIGN-01` — DELETION GUARD ITEM 23: **the app-wide native context-menu
 * suppression, with editable fields exempt.** Written in Phase 6, BEFORE that phase rewired
 * right-click, because the guard had no test and Phase 6 is the exact path it lives on.
 *
 * On a playout machine the browser's own menu is never what the operator wants and some of
 * it is dangerous — Reload and Back leave the running show — so `App` cancels `contextmenu`
 * app-wide. EDITABLE FIELDS ARE EXEMPT: the Inspector is where Persian copy is typed, and
 * right-click there is the ordinary way to the browser's cut/copy/paste and its BiDi and
 * spelling services, a real editing affordance the suppression must not take away.
 *
 * Three halves, on the WHOLE `App` with the mock bridge under it (the wiring is the subject,
 * so no harness re-wires it):
 *
 *   1. the SURFACE is suppressed — a right-click on chrome with no menu of its own is
 *      cancelled;
 *   2. a TEXT FIELD is exempt — the same right-click inside an Inspector input is NOT
 *      cancelled;
 *   3. the app's OWN menus still open — a right-click on a row cancels the native menu AND
 *      raises ours, which is the half `PROMPT.md` §6 says Phase 6 must keep.
 *
 * Each half was taken RED against a planted defect in `App.tsx` (`design.md` §13.6): (1) with
 * the `preventDefault` removed, (2) with the `isEditable` early return removed. (3) reads the
 * row's own handler, so it is green under both plants — which is what makes it a control
 * rather than a third copy of (1).
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

const ROW = 74;

let root: Root | null = null;
let host: HTMLDivElement | null = null;
let cg: RuntimeBridge;

beforeEach(async () => {
  (globalThis as { CG_E2E?: boolean }).CG_E2E = true;
  (globalThis as { CG_E2E_FIXED_BANK?: boolean }).CG_E2E_FIXED_BANK = true;
  installMemoryStorage();
  cg = createMockBridge();
  window.cg = cg;
  await cg.templates.import({
    template: {
      templateId: 'tpl-ctx',
      name: 'context-menu fixture',
      sourceFileName: 'ctx.vcg',
      templateType: 'lower-third',
      // A TEXT field, so the Inspector renders a real editable input to right-click in.
      fields: [{ id: 'headline', label: 'Headline', type: 'text', required: false, default: '' }],
    },
    html: '<!doctype html><html><body>fixture</body></html>',
  });
  const res = await cg.fixedLayers.load({
    channel: 1,
    layer: ROW,
    itemId: 'item-ctx',
    templateId: 'tpl-ctx',
    fields: {},
  });
  expect(res.accepted, 'the row loads').toBe(true);
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root?.render(createElement(App));
    await flush();
  });
  await act(flush);
  expect(row().getAttribute('data-item-id')).toBe('item-ctx');
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

function row(): HTMLElement {
  const el = document.querySelector<HTMLElement>(`[data-layer="${String(ROW)}"]`);
  if (el === null) throw new Error(`no row for layer ${String(ROW)}`);
  return el;
}

/** Right-click `target` the way a browser does: bubbling, cancelable. Returns the event. */
function rightClick(target: Element): MouseEvent {
  const ev = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2 });
  act(() => {
    target.dispatchEvent(ev);
  });
  return ev;
}

describe('guard item 23 — native context-menu suppression, editable fields exempt', () => {
  it('🔴 (1) the operator SURFACE: a right-click on chrome with no menu of its own is cancelled', () => {
    // The Layers panel's own title — plain chrome, no `onContextMenu` of its own, so the
    // only thing that can cancel this event is the app-wide suppressor.
    const chrome = document.querySelector('.cg-panel-title');
    if (chrome === null) throw new Error('no panel title to right-click');
    const ev = rightClick(chrome);
    expect(ev.defaultPrevented, 'the browser menu is suppressed on the surface').toBe(true);
    // …and it opened nothing of ours: suppression is silence, not a half-menu.
    expect(document.querySelector('[role="menu"]')).toBeNull();
  });

  it('🔴 (2) a TEXT FIELD is exempt: the same right-click inside an Inspector input is NOT cancelled', async () => {
    const body = row().querySelector<HTMLElement>('[data-row-body]');
    if (body === null) throw new Error('no row body to select');
    await act(async () => {
      body.click();
      await flush();
    });
    const inspector = document.querySelector('[aria-label="Inspector"]');
    if (inspector === null) throw new Error('the Inspector did not open on selection');
    const field = inspector.querySelector<HTMLElement>('textarea, input[type="text"]');
    if (field === null) throw new Error('no editable field in the Inspector to right-click');
    const ev = rightClick(field);
    expect(ev.defaultPrevented, 'the browser menu stays available in a text field').toBe(false);
  });

  it('(3) CONTROL — the app’s own row menu still opens on right-click, and the native one is cancelled with it', () => {
    const ev = rightClick(row());
    expect(ev.defaultPrevented).toBe(true);
    const menu = document.querySelector('[role="menu"]');
    expect(menu, 'the row’s own context menu opened').not.toBeNull();
    expect(menu?.getAttribute('aria-label')).toMatch(/actions$/);
  });
});
