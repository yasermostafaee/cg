// @vitest-environment jsdom
import { StrictMode, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { OrphanLayer, OwnedOccupancyWarning } from '@cg/shared-ipc';
import {
  OrphanLayersBanner,
  orphanWarningChannels,
} from '../src/renderer/features/layers/OrphanLayersBanner.js';
import {
  __reloadForeignDismissalsForTest,
  dismissedStrip,
} from '../src/renderer/features/layers/foreignNotice.js';
import { clearPortals, clickDialogButton, openDialog } from './support/dialog.js';
import { connectionsStub, type Reachability } from './support/reachability.js';
import { fillBridgeStub } from './support/authStub.js';

/**
 * R-009 — the orphan-layer warning surface: renders NOTHING when the set is
 * empty (idle-quiet), names each channel-layer, and Clear is confirm-gated
 * (accept → exactly one layers.clear for that layer; cancel → nothing).
 *
 * B-056 — the owned-slot occupancy variant: a DISTINCT strip naming the
 * channel-layer AND the item, with NO Clear control (the remedy is
 * Out/Remove of the item), rendered alongside — not instead of — R-009 rows.
 *
 * `FIELD-FIXES-01` L — the orphan strips speak only for layers INSIDE CG's bands (50 and up), so
 * every orphan fixture here sits in them; below the bands is its own case, at the end.
 */

let container: HTMLDivElement | null = null;

afterEach(() => {
  container?.remove();
  container = null;
  clearPortals();
  vi.restoreAllMocks();
  // `FIELD-FIXES-01` L — the dismissals are module state: back to this page's (empty) storage.
  vi.unstubAllGlobals();
  __reloadForeignDismissalsForTest();
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
    link: {
      status: () => link,
      onStatusChanged: () => () => undefined,
      resyncing: () => false,
      onResyncingChanged: () => () => undefined,
    },
    connections: connectionsStub(reach),
    layers: { clear },
    /*
      `B-233` — THE THREE CHANNELS THE OCCUPANCY STRIP'S NAMING NEEDS.

      The strip used to print the owning item's raw id; it now names the ROW, which needs the
      STACK (to reach a `templateId`), the BANK (to turn a coordinate into the operator's row
      name) and the REGISTRY (to turn a template UUID into its name). `B-232`'s note in this
      banner said it "holds neither"; these are what it holds now.

      ⚠ Every method here is REQUIRED by the component, not defensive padding — the same
      reason this stub already owes both reachability hops. A stub that omitted one would
      fail as an unrelated-looking crash in every spec in the file, which is exactly what
      happened when the hooks landed before this stub grew.
    */
    stack: {
      // The item the occupancy warning names, ON THE STACK — which is the whole reason this
      // strip needs no wire change (its owner's LOAD raised the warning, so the item is
      // always there to join against). An empty stack would exercise only the last-resort id.
      snapshot: () =>
        Promise.resolve([
          { itemId: 'item1', templateId: 'tpl-news', fields: {}, status: 'loaded' },
        ]),
      onStateChanged: () => () => undefined,
    },
    fixedLayers: {
      config: () => Promise.resolve(null),
      onConfigChanged: () => () => undefined,
    },
    templates: {
      list: () =>
        Promise.resolve([
          {
            templateId: 'tpl-news',
            templateType: 'lower-third',
            name: 'News Composite',
            fields: [],
          },
        ]),
      onChanged: () => () => undefined,
    },
  };
  (window as unknown as { cg: typeof stub }).cg = fillBridgeStub(stub);
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
    const el = await renderBanner([orphan(1, 60), orphan(2, 65)]);
    const alert = el.querySelector('[role="alert"]');
    expect(alert).not.toBeNull();
    expect(el.textContent).toContain('Layer 1-60 is on air but not on your stack');
    expect(el.textContent).toContain('Layer 2-65 is on air but not on your stack');
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

  it('names the channel-layer AND the owning ROW, with the Out/Remove remedy and NO Clear control', async () => {
    stubBridge();
    const el = await renderBanner([], [warning]);
    const alert = el.querySelector('[aria-label="Owned-layer occupancy warnings"]');
    expect(alert).not.toBeNull();
    expect(alert?.getAttribute('role')).toBe('alert');
    expect(el.textContent).toContain('Layer 1-10');
    /*
      🔴 `B-233` — THIS ASSERTED THE RAW ITEM ID (`item1`), AND IT WAS RIGHT ABOUT THE OLD
      COPY. Golden rule 11 replaced it: the sentence names the GRAPHIC in the operator's
      words, and the id is RELOCATED to the row's `title` rather than deleted.

      ⭐ It names the TEMPLATE and not the row, obeying `B-232`'s own note: naming the owner
      by its layer "would just repeat the coordinate the sentence has already printed two
      words earlier" — and CI proved that note right when the first attempt passed the slot
      anyway and rendered "put there by layer 10 (not a row) · …".
    */
    expect(el.textContent).toContain('News Composite');
    expect(el.textContent, 'the raw item id is still in the sentence').not.toContain('item1');
    const row = alert?.querySelector('[title]');
    expect(row?.getAttribute('title'), 'the id was deleted rather than relocated').toContain(
      'item1',
    );
    expect(el.textContent).toContain('Out or Remove the item');
    // No direct Clear on an owned layer — the strip has no buttons at all.
    expect(alert?.querySelector('button')).toBeNull();
  });

  it('renders BOTH strips when orphans and owned warnings coexist — R-009 rows unchanged', async () => {
    stubBridge();
    const el = await renderBanner([orphan(2, 65)], [warning]);
    expect(el.querySelector('[aria-label="Orphaned on-air layers"]')).not.toBeNull();
    expect(el.querySelector('[aria-label="Owned-layer occupancy warnings"]')).not.toBeNull();
    expect(el.textContent).toContain('Layer 2-65 is on air but not on your stack');
    expect(
      el.querySelector<HTMLButtonElement>('button[aria-label="Clear layer 2-65"]'),
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

  /** Every CLEAR control in the banner — the affordance R-015 keeps off a video layer. */
  const clears = (el: ParentNode): NodeListOf<HTMLButtonElement> =>
    el.querySelectorAll<HTMLButtonElement>('button[aria-label^="Clear"]');

  it('a video layer renders in the NEUTRAL strip: no alert role, no Clear control, kind named', async () => {
    stubBridge();
    const el = await renderBanner([video(1, 90)]);
    // Not a problem: no alert strip exists at all for a video-only set.
    expect(el.querySelector('[role="alert"]')).toBeNull();
    const neutral = el.querySelector('[aria-label="Layers in use by other systems"]');
    expect(neutral).not.toBeNull();
    expect(neutral?.getAttribute('role')).toBe('status');
    expect(el.textContent).toContain('Layer 1-90 is carrying video (ffmpeg)');
    expect(el.textContent).toContain('placed by another system');
    // The affordance does not exist — not disabled, ABSENT. (`FIELD-FIXES-01` L: the strip's one
    // control is its dismiss, which clears nothing.)
    expect(clears(el)).toHaveLength(0);
    expect(
      [...(neutral?.querySelectorAll('button') ?? [])].map((b) => b.getAttribute('aria-label')),
    ).toEqual(['Dismiss this notice']);
  });

  it('an unrecognised producer kind is presented exactly as video — "not html" fails safe', async () => {
    stubBridge();
    const el = await renderBanner([video(1, 73, 'decklink')]);
    expect(el.querySelector('[role="alert"]')).toBeNull();
    expect(
      el.querySelector('[aria-label="Layers in use by other systems"]')?.getAttribute('role'),
    ).toBe('status');
    expect(el.textContent).toContain('Layer 1-73 is carrying video (decklink)');
    expect(clears(el)).toHaveLength(0);
  });

  it('html and video coexist: the html orphan keeps its warning + Clear, the video row offers none', async () => {
    stubBridge();
    const el = await renderBanner([orphan(1, 60), video(1, 90)]);
    // The html orphan's R-009 surface is byte-for-byte alive…
    const alert = el.querySelector('[aria-label="Orphaned on-air layers"]');
    expect(alert?.getAttribute('role')).toBe('alert');
    expect(el.textContent).toContain('Layer 1-60 is on air but not on your stack');
    expect(
      el.querySelector<HTMLButtonElement>('button[aria-label="Clear layer 1-60"]'),
    ).not.toBeNull();
    // …the video row is neutral, and the ONLY Clear in the banner is the html one.
    expect(el.textContent).toContain('Layer 1-90 is carrying video (ffmpeg)');
    expect([...clears(el)].map((b) => b.getAttribute('aria-label'))).toEqual(['Clear layer 1-60']);
    const neutral = el.querySelector('[aria-label="Layers in use by other systems"]');
    expect(neutral === null ? 0 : clears(neutral).length).toBe(0);
  });
});

/**
 * 🔴 `FIELD-FIXES-01` L — **ANOTHER SYSTEM'S LAYER BELOW CG'S BANDS IS NORMAL; INSIDE THEM IT IS A
 * CONFLICT, AND ITS NOTICE CAN BE DISMISSED.** The owner's channel 1 carried a blue notice for
 * layer 1-5 — the Playout's own playlist, which plays on a low layer practically all the time —
 * that could not be closed, and marked the channel's tab. The Station layers tab lists it; the
 * e2e reads that half.
 */
describe('OrphanLayersBanner — FIELD-FIXES-01 L: CG’s bands, and a dismissal that holds', () => {
  function video(channel: number, layer: number, producer = 'ffmpeg'): OrphanLayer {
    return { channel, layer, producer, since: '2026-09-26T12:00:00.000Z' };
  }

  /** This page's storage, in memory: a reload below re-reads it. */
  function memoryStorage(): Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> {
    const data = new Map<string, string>();
    return {
      getItem: (key) => data.get(key) ?? null,
      setItem: (key, value) => {
        data.set(key, String(value));
      },
      removeItem: (key) => {
        data.delete(key);
      },
    };
  }

  interface Mounted {
    readonly el: HTMLDivElement;
    /** The bridge publishes a new set. */
    rerender(orphans: OrphanLayer[]): Promise<void>;
    /** Unmount, re-read storage, mount again — a reload, as far as this banner can tell. */
    reload(orphans: OrphanLayer[]): Promise<Mounted>;
  }
  const roots: { unmount(): void }[] = [];

  async function mount(orphans: OrphanLayer[]): Promise<Mounted> {
    const el = document.createElement('div');
    document.body.appendChild(el);
    const root = createRoot(el);
    roots.push(root);
    const render = async (next: OrphanLayer[]): Promise<void> => {
      await act(async () => {
        root.render(
          createElement(
            StrictMode,
            null,
            createElement(OrphanLayersBanner, { orphans: next, ownedOccupancy: [] }),
          ),
        );
      });
    };
    await render(orphans);
    return {
      el,
      rerender: render,
      reload: async (next) => {
        roots.splice(roots.indexOf(root), 1);
        await act(async () => {
          root.unmount();
        });
        el.remove();
        __reloadForeignDismissalsForTest();
        return mount(next);
      },
    };
  }

  afterEach(async () => {
    for (const root of roots.splice(0)) {
      await act(async () => {
        root.unmount();
      });
    }
  });

  const videoStrip = (el: ParentNode): Element | null =>
    el.querySelector('[aria-label="Layers in use by other systems"]');
  const graphicStrip = (el: ParentNode): Element | null =>
    el.querySelector('[aria-label="Orphaned on-air layers"]');
  async function dismissIn(strip: Element | null): Promise<void> {
    const button = strip?.querySelector<HTMLButtonElement>(
      'button[aria-label="Dismiss this notice"]',
    );
    expect(button, 'the strip carries its dismiss').not.toBeNull();
    await act(async () => {
      button?.click();
    });
  }

  function freshStorage(): void {
    vi.stubGlobal('localStorage', memoryStorage());
    __reloadForeignDismissalsForTest();
  }

  it('🔴 below the bands another system’s layer gets NO notice and NO mark — video or graphic (control: the same producers inside them do)', async () => {
    stubBridge();
    freshStorage();
    const below = [video(1, 5), orphan(1, 20)];
    const quiet = await mount(below);
    expect(quiet.el.textContent, 'layer 5 is the Playout’s: no notice').toBe('');
    expect(orphanWarningChannels(below, [], {}), 'and no mark').toEqual([]);

    // CONTROL — the same two producers inside CG's bands: both strips, and the channel's mark.
    const inside = [video(1, 90), orphan(1, 60)];
    const loud = await mount(inside);
    expect(videoStrip(loud.el)?.textContent).toContain('Layer 1-90 is carrying video (ffmpeg)');
    expect(graphicStrip(loud.el)?.textContent).toContain(
      'Layer 1-60 is on air but not on your stack',
    );
    expect(orphanWarningChannels(inside, [], {})).toEqual([1]);
  });

  it('🔴 a dismissed strip stays dismissed after a reload, and returns for a NEW layer or a DIFFERENT producer — not for a layer leaving, nor the same set seen again', async () => {
    stubBridge();
    freshStorage();
    const first = await mount([orphan(1, 60), video(1, 90)]);
    expect(videoStrip(first.el)).not.toBeNull();
    await dismissIn(videoStrip(first.el));
    expect(videoStrip(first.el), 'dismissed').toBeNull();
    expect(graphicStrip(first.el), 'the other strip is its own notice').not.toBeNull();

    const again = await first.reload([orphan(1, 60), video(1, 90)]);
    expect(videoStrip(again.el), 'the dismissal survived the reload').toBeNull();
    expect(graphicStrip(again.el)).not.toBeNull();

    // A layer leaving, and the set seen again (a bridge restart re-observes it), are not news.
    await again.rerender([orphan(1, 60)]);
    await again.rerender([orphan(1, 60), video(1, 90)]);
    expect(videoStrip(again.el)).toBeNull();

    // A NEW layer is: the strip returns, naming everything on it.
    await again.rerender([orphan(1, 60), video(1, 90), video(1, 91)]);
    expect(videoStrip(again.el)?.textContent).toContain('Layer 1-91 is carrying video (ffmpeg)');
    expect(videoStrip(again.el)?.textContent).toContain('Layer 1-90 is carrying video (ffmpeg)');

    // …and so is a DIFFERENT producer on a layer already dismissed.
    await dismissIn(videoStrip(again.el));
    expect(videoStrip(again.el)).toBeNull();
    await again.rerender([orphan(1, 60), video(1, 90, 'decklink'), video(1, 91)]);
    expect(videoStrip(again.el)?.textContent).toContain('Layer 1-90 is carrying video (decklink)');
  });

  it('the mark follows the notice: gone while every strip of the channel is dismissed, back with the strip', () => {
    const set = [orphan(1, 60), video(1, 90)];
    const videoHeard = dismissedStrip({}, set, 'video');
    expect(orphanWarningChannels(set, [], videoHeard), 'the graphic strip still stands').toEqual([
      1,
    ]);
    const bothHeard = dismissedStrip(videoHeard, set, 'graphic');
    expect(orphanWarningChannels(set, [], bothHeard)).toEqual([]);
    expect(orphanWarningChannels([...set, video(1, 91)], [], bothHeard)).toEqual([1]);
    // A dismissal is per channel: channel 2's new strip marks channel 2 alone.
    expect(orphanWarningChannels([...set, video(2, 90)], [], bothHeard)).toEqual([2]);
  });

  it('with storage unavailable a dismissal lasts the page, and does not outlive it', async () => {
    stubBridge();
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('storage denied');
      },
      setItem: () => {
        throw new Error('storage denied');
      },
    });
    __reloadForeignDismissalsForTest();
    const page = await mount([video(1, 90)]);
    await dismissIn(videoStrip(page.el));
    expect(videoStrip(page.el)).toBeNull();
    const next = await page.reload([video(1, 90)]);
    expect(videoStrip(next.el)).not.toBeNull();
  });
});
