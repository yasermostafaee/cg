// @vitest-environment jsdom
import { StrictMode, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConnectionBanner } from '../src/renderer/features/status/ConnectionBanner.js';
import { setupStub } from './support/authStub.js';

/**
 * The #312 banners are compact strips — and still loud.
 *
 * They used to take roughly half the viewport, and nothing in ConnectionBanner caused it: the
 * banner was the first in-flow child of a grid whose rows were `1fr auto`, so it took the
 * flexible track and stretched. The shell fix (a flex column) stops that; this pins the
 * banner's own box so it cannot regress into a block — no fixed height, and `flexShrink: 0`
 * so it is neither inflated nor squeezed.
 *
 * Loud is not the same as large: the R-006 messages and roles are asserted here UNCHANGED,
 * because the height was never what made them impossible to miss. (The actions changed once, on
 * purpose: `R-087` took the way into test mode off the NOT CONNECTED banner.)
 */

let container: HTMLDivElement | null = null;

afterEach(() => {
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function renderBanner(link: 'disconnected' | 'offline-mock'): Promise<HTMLDivElement> {
  // The reachability probe is a real `fetch` of the address: refused here, never dialled.
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.reject(new Error('refused'))),
  );
  const stub = {
    link: {
      status: () => link,
      onStatusChanged: () => () => undefined,
      resyncing: () => false,
      onResyncingChanged: () => () => undefined,
    },
    // `CENTRAL-BRIDGE-01` — the disconnected banner asks whether this console may set up again.
    setup: setupStub(),
  };
  (window as unknown as { cg: typeof stub }).cg = stub;
  container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(createElement(StrictMode, null, createElement(ConnectionBanner)));
  });
  return container;
}

const alertEl = (el: HTMLElement): HTMLElement | null => el.querySelector('[role="alert"]');

describe('the connection banners are strips, not blocks', () => {
  it.each(['disconnected', 'offline-mock'] as const)('%s: sizes to its content', async (link) => {
    const banner = alertEl(await renderBanner(link));
    expect(banner).not.toBeNull();

    // Nothing pins a height: the strip is exactly as tall as heading + line + buttons.
    expect(banner?.style.height).toBe('');
    expect(banner?.style.minHeight).toBe('');
    // …and it can be neither inflated by a greedy track nor squeezed away by a long stack.
    expect(banner?.style.flexShrink).toBe('0');
  });
});

describe('the banners stay loud — the R-006 message is unchanged', () => {
  it('TEST MODE still says nothing is on air, and offers the way out', async () => {
    const el = await renderBanner('offline-mock');
    const banner = alertEl(el);

    expect(banner?.getAttribute('aria-label')).toBe('Test mode');
    expect(banner?.textContent).toContain('NOTHING IS ON AIR');
    expect(banner?.textContent).toContain('No command reaches CasparCG');
    expect(el.querySelector('button')?.textContent).toBe('Leave test mode');
  });

  it('NOT CONNECTED still says nothing can reach air, and refuses to queue', async () => {
    const el = await renderBanner('disconnected');
    const banner = alertEl(el);

    expect(banner?.getAttribute('aria-label')).toBe('Bridge disconnected');
    expect(banner?.textContent).toContain('NOTHING CAN REACH AIR');
    // `R-093` — the one fact an operator acts on, and no explanation (`connectionBannerSetUpAgain`).
    expect(banner?.textContent).toContain('Takes are refused until it is back.');
    // `R-087` (`RELEASE-0112-01-A` A1) — the retry is the one door here (a browser has no Set up
    // again); the way INTO test mode is gone.
    const buttons = [...el.querySelectorAll('button')].map((b) => b.textContent);
    expect(buttons).toEqual(['Retry connection']);
  });
});

/**
 * 🔴 `R-087` (`RELEASE-0112-01-A` A1, the owner 2026-10-04) — **NO WAY INTO TEST MODE ON THE NOT
 * CONNECTED BANNER**, pinned as an ABSENCE (the direction it regresses in). The mode's code stays —
 * every Playwright spec boots it through the harness flag — so only the operator's door is gone.
 */
describe('R-087 A1 — the NOT CONNECTED banner offers no test mode', () => {
  it('no "Enter test mode" anywhere on the banner, by text or by name — CONTROL: Retry connection still reloads', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('refused'))),
    );
    const reload = vi.fn();
    (window as unknown as { cg: unknown }).cg = {
      link: {
        status: () => 'disconnected',
        onStatusChanged: () => () => undefined,
        resyncing: () => false,
        onResyncingChanged: () => () => undefined,
      },
      setup: setupStub(),
    };
    container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(createElement(StrictMode, null, createElement(ConnectionBanner, { reload })));
    });
    const el = container;
    expect(el.textContent ?? '').not.toMatch(/test mode/i);
    expect(
      [...el.querySelectorAll('button')].some((b) =>
        /test mode/i.test(`${b.textContent ?? ''} ${b.getAttribute('aria-label') ?? ''}`),
      ),
    ).toBe(false);
    const retry = [...el.querySelectorAll('button')].find(
      (b) => b.textContent === 'Retry connection',
    );
    expect(retry, 'no Retry connection').toBeDefined();
    await act(async () => {
      retry?.click();
    });
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
