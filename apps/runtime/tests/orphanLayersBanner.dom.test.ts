// @vitest-environment jsdom
import { StrictMode, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { OrphanLayer } from '@cg/shared-ipc';
import { OrphanLayersBanner } from '../src/renderer/features/layers/OrphanLayersBanner.js';

/**
 * R-009 — the orphan-layer warning surface: renders NOTHING when the set is
 * empty (idle-quiet), names each channel-layer, and Clear is confirm-gated
 * (accept → exactly one layers.clear for that layer; cancel → nothing).
 */

let container: HTMLDivElement | null = null;

afterEach(() => {
  container?.remove();
  container = null;
  vi.restoreAllMocks();
});

function orphan(channel: number, layer: number): OrphanLayer {
  return { channel, layer, producer: 'html', since: '2026-07-11T12:00:00.000Z' };
}

function stubBridge(): { clear: Mock } {
  const clear = vi.fn(() => Promise.resolve({ ok: true }));
  const stub = { layers: { clear } };
  (window as unknown as { cg: typeof stub }).cg = stub;
  return { clear };
}

async function renderBanner(orphans: OrphanLayer[]): Promise<HTMLDivElement> {
  container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(createElement(StrictMode, null, createElement(OrphanLayersBanner, { orphans })));
  });
  return container;
}

describe('OrphanLayersBanner — R-009', () => {
  it('renders nothing when there are no orphans (idle-quiet)', async () => {
    stubBridge();
    const el = await renderBanner([]);
    expect(el.querySelector('[role="alert"]')).toBeNull();
    expect(el.textContent).toBe('');
  });

  it('names each orphan channel-layer with the not-on-your-stack message', async () => {
    stubBridge();
    const el = await renderBanner([orphan(1, 60), orphan(2, 15)]);
    const alert = el.querySelector('[role="alert"]');
    expect(alert).not.toBeNull();
    expect(el.textContent).toContain('Layer 1-60 is on air but not on your stack');
    expect(el.textContent).toContain('Layer 2-15 is on air but not on your stack');
  });

  it('confirm-accept sends exactly one layers.clear for that layer', async () => {
    const { clear } = stubBridge();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const el = await renderBanner([orphan(1, 60)]);
    const btn = el.querySelector<HTMLButtonElement>('button[aria-label="Clear layer 1-60"]');
    expect(btn).not.toBeNull();
    await act(async () => {
      btn?.click();
      await Promise.resolve();
    });
    expect(clear).toHaveBeenCalledTimes(1);
    expect(clear).toHaveBeenCalledWith({ channel: 1, layer: 60 });
  });

  it('confirm-cancel sends nothing', async () => {
    const { clear } = stubBridge();
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const el = await renderBanner([orphan(1, 60)]);
    await act(async () => {
      el.querySelector<HTMLButtonElement>('button[aria-label="Clear layer 1-60"]')?.click();
    });
    expect(clear).not.toHaveBeenCalled();
  });
});
