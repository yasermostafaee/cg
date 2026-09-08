// @vitest-environment jsdom
import { StrictMode, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/renderer/App.js';
import { createMockBridge } from '../src/platform/createRuntimeBridge.js';
import { __resetDraftsForTest } from '../src/renderer/features/inspector/draftStore.js';
import { Tooltip } from '../src/renderer/ui/Tooltip.js';
import { installMemoryStorage } from './support/localStorage.js';

/**
 * `RUNTIME-REDESIGN-01` Phase 9 — deletion guard item 22, the single delegated Tooltip.
 *
 * 🔴 NO FILE UNDER `tests/` REFERENCED `Tooltip` before Phase 9; the plant that unmounted it
 * from `App` left 1318 tests green. It is LOAD-BEARING because golden rule 11 relocates every
 * internal id — item ids, template UUIDs, layer coordinates — out of the sentence and into a
 * `title`. This is the one mechanism that puts a `title` back in front of the operator
 * without the OS bubble's delay and look; if it dies, every id the console moved out of sight
 * goes with it, and nothing else in the tree would notice.
 *
 * TWO HALVES, AND THE SECOND IS THE ONE THE PLANT TAUGHT. The first describe pins the
 * delegation CONTRACT on the component alone: a control opts in by carrying a `title` and
 * nothing else; the bubble appears after the dwell, shows the title's text, blanks the native
 * title while it is up (so the OS never double-renders) and restores it exactly on leave;
 * Escape dismisses. The first version of this file stopped there — and the plant that
 * unmounts `<Tooltip />` from `App` STAYED GREEN under it, because a suite that mounts the
 * component itself cannot notice the app no longer does. The second describe mounts the whole
 * `App` on the mock bridge and hovers a real row verb: that is the half that guards the MOUNT.
 *
 * jsdom has no layout, so the bubble's PLACEMENT is not asserted (golden rule 12c) — only
 * that it exists and what it says.
 */

const RELOCATED = 'زیرنویس اصلی — item-e602d912-1a2b, on 1-10';

function pointer(type: string, target: Element): void {
  target.dispatchEvent(new Event(type, { bubbles: true }));
}

const bubble = (): HTMLElement | null => document.querySelector('[role="tooltip"]');

async function dwell(ms: number): Promise<void> {
  await act(async () => {
    vi.advanceTimersByTime(ms);
  });
}

describe('guard item 22 — the delegation contract, on the component alone', () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  beforeEach(() => {
    vi.useFakeTimers();
  });

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
    vi.useRealTimers();
  });

  async function mount(): Promise<{ button: HTMLButtonElement; inner: HTMLSpanElement }> {
    // A control of the shape the console renders: an icon button whose `title` carries the
    // relocated id, with a child span (the pointer lands on the glyph, not the button itself,
    // which is why `closest('[title]')` matters).
    const button = document.createElement('button');
    button.title = RELOCATED;
    button.setAttribute('aria-label', 'Play');
    const inner = document.createElement('span');
    inner.textContent = '▶';
    button.appendChild(inner);
    document.body.appendChild(button);

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    const r = root;
    await act(async () => {
      r.render(createElement(StrictMode, null, createElement(Tooltip)));
    });
    return { button, inner };
  }

  it('a control opts in by its `title` alone: hovering its glyph shows the title after the dwell', async () => {
    const { inner } = await mount();
    pointer('pointerover', inner);
    await dwell(100);
    expect(bubble(), 'the bubble showed before the dwell').toBeNull();
    await dwell(500);
    const b = bubble();
    expect(b, 'the bubble never appeared').not.toBeNull();
    expect(b?.textContent).toBe(RELOCATED);
    expect(b?.className).toContain('cg-tooltip');
  });

  it('the native title is blanked while the bubble is up and restored exactly on leave', async () => {
    const { button, inner } = await mount();
    pointer('pointerover', inner);
    expect(button.title, 'the OS bubble must not double-render').toBe('');
    await dwell(500);
    expect(bubble()).not.toBeNull();
    pointer('pointerout', inner);
    await dwell(0);
    expect(bubble()).toBeNull();
    expect(button.title).toBe(RELOCATED);
  });

  it('Escape dismisses it, like every transient surface', async () => {
    const { inner } = await mount();
    pointer('pointerover', inner);
    await dwell(500);
    expect(bubble()).not.toBeNull();
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(bubble()).toBeNull();
  });

  it('a control with NO title shows nothing — delegation, not decoration', async () => {
    await mount();
    const plain = document.createElement('button');
    plain.textContent = 'No title';
    document.body.appendChild(plain);
    pointer('pointerover', plain);
    await dwell(600);
    expect(bubble()).toBeNull();
  });
});

/*
  The whole `App` on the mock bridge — the harness `contextMenuSuppression.dom.test.ts` uses,
  because the wiring is the subject and no harness may re-wire it.
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

describe('guard item 22 — the MOUNT: the whole App serves a row verb’s title through the one tooltip', () => {
  let root: Root | null = null;
  let host: HTMLDivElement | null = null;
  const ROW = 74;

  beforeEach(async () => {
    (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = NoopResizeObserver;
    (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
      true;
    (globalThis as { CG_E2E?: boolean }).CG_E2E = true;
    (globalThis as { CG_E2E_FIXED_BANK?: boolean }).CG_E2E_FIXED_BANK = true;
    installMemoryStorage();
    const cg = createMockBridge();
    window.cg = cg;
    await cg.templates.import({
      template: {
        templateId: 'tpl-tip',
        name: 'tooltip fixture',
        sourceFileName: 'tip.vcg',
        templateType: 'lower-third',
        fields: [],
      },
      html: '<!doctype html><html><body>fixture</body></html>',
    });
    const res = await cg.fixedLayers.load({
      channel: 1,
      layer: ROW,
      itemId: 'item-tip',
      templateId: 'tpl-tip',
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
  });

  afterEach(() => {
    vi.useRealTimers();
    act(() => root?.unmount());
    root = null;
    host?.remove();
    host = null;
    document.body.innerHTML = '';
    __resetDraftsForTest();
    vi.restoreAllMocks();
  });

  async function flush(): Promise<void> {
    for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 0));
  }

  it('🔴 hovering a titled control anywhere in the App raises the bubble with that title', async () => {
    const rowEl = document.querySelector<HTMLElement>(`[data-layer="${String(ROW)}"]`);
    expect(rowEl, 'the fixture row rendered').not.toBeNull();
    const titled = (rowEl as HTMLElement).querySelector<HTMLElement>('[title]');
    expect(titled, 'the row carries a titled control').not.toBeNull();
    const text = (titled as HTMLElement).title;
    expect(text.trim()).not.toBe('');

    vi.useFakeTimers();
    pointer('pointerover', titled as HTMLElement);
    await dwell(600);
    const b = bubble();
    expect(
      b,
      'the App serves no tooltip — the one delegated Tooltip is not mounted',
    ).not.toBeNull();
    expect(b?.textContent).toBe(text.trim());
  });
});
