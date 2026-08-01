// @vitest-environment jsdom
import { StrictMode, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { OrphanLayer, OwnedOccupancyWarning } from '@cg/shared-ipc';
import { OrphanLayersBanner } from '../src/renderer/features/layers/OrphanLayersBanner.js';
import { clearPortals, clickDialogButton, openDialog } from './support/dialog.js';
import { connectionsStub, type Reachability } from './support/reachability.js';

/**
 * R-009 — the orphan-layer warning surface: renders NOTHING when the set is
 * empty (idle-quiet), names each channel-layer, and Clear is confirm-gated
 * (accept → exactly one layers.clear for that layer; cancel → nothing).
 *
 * B-056 — the owned-slot occupancy variant: a DISTINCT strip naming the
 * channel-layer AND the item, with NO Clear control (the remedy is
 * Out/Remove of the item), rendered alongside — not instead of — R-009 rows.
 */

let container: HTMLDivElement | null = null;

afterEach(() => {
  container?.remove();
  container = null;
  clearPortals();
  vi.restoreAllMocks();
});

function orphan(channel: number, layer: number): OrphanLayer {
  return { channel, layer, producer: 'html', since: '2026-07-11T12:00:00.000Z' };
}

function stubBridge(
  reach: Reachability = 'both-up',
  link: 'live' | 'disconnected' = 'live',
): { clear: Mock } {
  const clear = vi.fn(() => Promise.resolve({ ok: true }));
  const stub = {
    // §1 — this Clear emits AMCP, so the banner reads BOTH hops and the stub owes
    // both channels. Adding `useCasparReach` anywhere pulls `useLink` in
    // transitively (health rides `useBridgeSnapshot`, which reads the link).
    link: { status: () => link, onStatusChanged: () => () => undefined },
    connections: connectionsStub(reach),
    layers: { clear },
  };
  (window as unknown as { cg: typeof stub }).cg = stub;
  return { clear };
}

async function renderBanner(
  orphans: OrphanLayer[],
  ownedOccupancy: OwnedOccupancyWarning[] = [],
): Promise<HTMLDivElement> {
  container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      createElement(
        StrictMode,
        null,
        createElement(OrphanLayersBanner, { orphans, ownedOccupancy }),
      ),
    );
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

  it('confirming in the modal sends exactly one layers.clear for that layer', async () => {
    const { clear } = stubBridge();
    const nativeConfirm = vi.spyOn(window, 'confirm');
    const el = await renderBanner([orphan(1, 60)]);
    const btn = el.querySelector<HTMLButtonElement>('button[aria-label="Clear layer 1-60"]');
    expect(btn).not.toBeNull();

    await act(async () => {
      btn?.click();
      await Promise.resolve();
    });

    expect(openDialog()?.textContent).toContain('Clear layer 1-60');
    expect(nativeConfirm).not.toHaveBeenCalled();
    expect(clear).not.toHaveBeenCalled();

    await clickDialogButton('Clear layer');

    expect(clear).toHaveBeenCalledTimes(1);
    expect(clear).toHaveBeenCalledWith({ channel: 1, layer: 60 });
  });

  it('cancelling the modal sends nothing', async () => {
    const { clear } = stubBridge();
    const el = await renderBanner([orphan(1, 60)]);

    await act(async () => {
      el.querySelector<HTMLButtonElement>('button[aria-label="Clear layer 1-60"]')?.click();
      await Promise.resolve();
    });
    await clickDialogButton('Cancel');

    expect(clear).not.toHaveBeenCalled();
    expect(openDialog()).toBeNull();
  });
});

describe('OrphanLayersBanner — B-056 owned-slot occupancy variant', () => {
  const warning: OwnedOccupancyWarning = {
    channel: 1,
    layer: 10,
    itemId: 'item1',
    producer: 'html',
    since: '2026-07-12T12:00:00.000Z',
  };

  it('renders nothing when both sets are empty', async () => {
    stubBridge();
    const el = await renderBanner([], []);
    expect(el.querySelector('[role="alert"]')).toBeNull();
    expect(el.textContent).toBe('');
  });

  it('names the channel-layer AND the item, with the Out/Remove remedy and NO Clear control', async () => {
    stubBridge();
    const el = await renderBanner([], [warning]);
    const alert = el.querySelector('[aria-label="Owned-layer occupancy warnings"]');
    expect(alert).not.toBeNull();
    expect(alert?.getAttribute('role')).toBe('alert');
    expect(el.textContent).toContain('Layer 1-10');
    expect(el.textContent).toContain('item1');
    expect(el.textContent).toContain('Out or Remove the item');
    // No direct Clear on an owned layer — the strip has no buttons at all.
    expect(alert?.querySelector('button')).toBeNull();
  });

  it('renders BOTH strips when orphans and owned warnings coexist — R-009 rows unchanged', async () => {
    stubBridge();
    const el = await renderBanner([orphan(2, 15)], [warning]);
    expect(el.querySelector('[aria-label="Orphaned on-air layers"]')).not.toBeNull();
    expect(el.querySelector('[aria-label="Owned-layer occupancy warnings"]')).not.toBeNull();
    expect(el.textContent).toContain('Layer 2-15 is on air but not on your stack');
    expect(
      el.querySelector<HTMLButtonElement>('button[aria-label="Clear layer 2-15"]'),
    ).not.toBeNull();
    // …and the owned strip still offers no buttons.
    expect(
      el.querySelector('[aria-label="Owned-layer occupancy warnings"]')?.querySelector('button'),
    ).toBeNull();
  });
});

/**
 * §1 — THE CLEAR THAT WAS NOT IN THE GATE'S LIST.
 *
 * It emits AMCP (`layers.clear`), so with either hop down the command never
 * leaves: the enabled button was the APPEARANCE of a remedy. That matters more
 * here than on a row verb, because this is the control an operator reaches for
 * once the console's own model has already failed them — they press it, believe
 * the layer is coming off, and a graphic they cannot account for stays on air.
 *
 * The gate is on REACHABILITY ONLY. The orphan row exists precisely because the
 * layer carries something we did not put there, and that is never a reason to
 * refuse the remedy.
 */
describe('OrphanLayersBanner — §1 the Clear is gated on BOTH hops', () => {
  function clearBtn(el: HTMLElement): HTMLButtonElement | null {
    return el.querySelector<HTMLButtonElement>('button[aria-label="Clear layer 1-60"]');
  }

  it('with both hops up it is enabled and says what it will send', async () => {
    stubBridge('both-up');
    const el = await renderBanner([orphan(1, 60)]);
    expect(clearBtn(el)?.disabled).toBe(false);
    expect(clearBtn(el)?.title).toContain('Send CLEAR 1-60');
  });

  it('with CasparCG unreachable it is DISABLED and names the playout server', async () => {
    stubBridge('caspar-down');
    const el = await renderBanner([orphan(1, 60)]);
    expect(clearBtn(el)?.disabled).toBe(true);
    expect(clearBtn(el)?.title).toMatch(/CasparCG cannot be reached/i);
  });

  it('with the BRIDGE down it is disabled and names the BRIDGE, not CasparCG', async () => {
    stubBridge('bridge-down', 'disconnected');
    const el = await renderBanner([orphan(1, 60)]);
    expect(clearBtn(el)?.disabled).toBe(true);
    expect(clearBtn(el)?.title).toMatch(/Bridge disconnected/i);
    expect(clearBtn(el)?.title).not.toMatch(/CasparCG cannot be reached/i);
  });

  it('during the BOOT WINDOW it is disabled and says connecting, not unreachable', async () => {
    stubBridge('unknown');
    const el = await renderBanner([orphan(1, 60)]);
    expect(clearBtn(el)?.disabled).toBe(true);
    expect(clearBtn(el)?.title).toMatch(/connecting/i);
    expect(clearBtn(el)?.title).not.toMatch(/cannot be reached/i);
  });
});

describe('OrphanLayersBanner — R-015 video layers read as NORMAL and can never be cleared', () => {
  function video(channel: number, layer: number, producer = 'ffmpeg'): OrphanLayer {
    return { channel, layer, producer, since: '2026-07-19T12:00:00.000Z' };
  }

  it('a video layer renders in the NEUTRAL strip: no alert role, no Clear control, kind named', async () => {
    stubBridge();
    const el = await renderBanner([video(1, 1)]);
    // Not a problem: no alert strip exists at all for a video-only set.
    expect(el.querySelector('[role="alert"]')).toBeNull();
    const neutral = el.querySelector('[aria-label="Layers in use by other systems"]');
    expect(neutral).not.toBeNull();
    expect(neutral?.getAttribute('role')).toBe('status');
    expect(el.textContent).toContain('Layer 1-1 is carrying video (ffmpeg)');
    expect(el.textContent).toContain('placed by another system');
    // The affordance does not exist — not disabled, ABSENT.
    expect(el.querySelector('button')).toBeNull();
  });

  it('an unrecognised producer kind is presented exactly as video — "not html" fails safe', async () => {
    stubBridge();
    const el = await renderBanner([video(1, 33, 'decklink')]);
    expect(el.querySelector('[role="alert"]')).toBeNull();
    expect(
      el.querySelector('[aria-label="Layers in use by other systems"]')?.getAttribute('role'),
    ).toBe('status');
    expect(el.textContent).toContain('Layer 1-33 is carrying video (decklink)');
    expect(el.querySelector('button')).toBeNull();
  });

  it('html and video coexist: the html orphan keeps its warning + Clear, the video row offers none', async () => {
    stubBridge();
    const el = await renderBanner([orphan(1, 60), video(1, 1)]);
    // The html orphan's R-009 surface is byte-for-byte alive…
    const alert = el.querySelector('[aria-label="Orphaned on-air layers"]');
    expect(alert?.getAttribute('role')).toBe('alert');
    expect(el.textContent).toContain('Layer 1-60 is on air but not on your stack');
    expect(
      el.querySelector<HTMLButtonElement>('button[aria-label="Clear layer 1-60"]'),
    ).not.toBeNull();
    // …the video row is neutral, and the ONLY button in the banner is the html Clear.
    expect(el.textContent).toContain('Layer 1-1 is carrying video (ffmpeg)');
    expect(el.querySelectorAll('button')).toHaveLength(1);
    expect(
      el.querySelector('[aria-label="Layers in use by other systems"]')?.querySelector('button'),
    ).toBeNull();
  });
});
