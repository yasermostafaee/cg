// @vitest-environment jsdom
import { StrictMode, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConnectionBanner } from '../src/renderer/features/status/ConnectionBanner.js';

/**
 * The #312 banners are compact strips — and still loud.
 *
 * They used to take roughly half the viewport, and nothing in ConnectionBanner caused it: the
 * banner was the first in-flow child of a grid whose rows were `1fr auto`, so it took the
 * flexible track and stretched. The shell fix (a flex column) stops that; this pins the
 * banner's own box so it cannot regress into a block — no fixed height, and `flexShrink: 0`
 * so it is neither inflated nor squeezed.
 *
 * Loud is not the same as large: the R-006 messages, roles and actions are asserted here
 * UNCHANGED, because the height was never what made them impossible to miss.
 */

let container: HTMLDivElement | null = null;

afterEach(() => {
  container?.remove();
  container = null;
  vi.restoreAllMocks();
});

async function renderBanner(link: 'disconnected' | 'offline-mock'): Promise<HTMLDivElement> {
  const stub = { link: { status: () => link, onStatusChanged: () => () => undefined } };
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
    expect(banner?.textContent).toContain('refused, not queued');
    // Both doors are still there: retry, or an EXPLICIT entry to test mode.
    const buttons = [...el.querySelectorAll('button')].map((b) => b.textContent);
    expect(buttons).toEqual(['Retry connection', 'Enter test mode']);
  });
});
