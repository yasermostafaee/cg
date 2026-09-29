// @vitest-environment jsdom
import { StrictMode, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { ClearedOutsideLayer, OrphanLayer, OwnedOccupancyWarning } from '@cg/shared-ipc';
import {
  OrphanLayersBanner,
  orphanWarningChannels,
} from '../src/renderer/features/layers/OrphanLayersBanner.js';
import {
  __reloadForeignDismissalsForTest,
  dismissedClearedOutside,
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
  clearedOutside: ClearedOutsideLayer[] = [],
): Promise<HTMLDivElement> {
  container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      createElement(
        StrictMode,
        null,
        createElement(OrphanLayersBanner, { orphans, ownedOccupancy, clearedOutside }),
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

/*
  🔴 `B-292` (`RELEASE-091-01` DELTA B, B3 — the owner, 2026-09-29) SUPERSEDED this block's "can
  never be cleared". Its three tests asserted NO Clear on a video layer at 1-90, 1-73 and beside an
  html orphan; inside the three bands (50–99) each of those rows now carries one, because a plate
  another station or a lost ledger left in our bands had no surface that could clear it. The neutral
  strip itself — `role="status"`, never an alert, the kind named — is unchanged and still pinned, and
  the old prohibition survives where it still holds: ABOVE the bands (the control at 1-120).
*/
describe('OrphanLayersBanner — R-015 video layers read as NORMAL; `B-292`: inside 50–99 they clear', () => {
  function video(channel: number, layer: number, producer = 'ffmpeg'): OrphanLayer {
    return { channel, layer, producer, since: '2026-07-19T12:00:00.000Z' };
  }

  /** Every CLEAR control in a region — per row and CLEAR ALL LISTED alike. */
  const clears = (el: ParentNode): NodeListOf<HTMLButtonElement> =>
    el.querySelectorAll<HTMLButtonElement>('button[aria-label^="Clear"]');
  const labels = (el: ParentNode): (string | null)[] =>
    [...clears(el)].map((b) => b.getAttribute('aria-label'));
  const neutralStrip = (el: ParentNode): Element | null =>
    el.querySelector('[aria-label="Layers in use by other systems"]');

  it('a video layer renders in the NEUTRAL strip — no alert role, kind named — and, inside the bands, carries a CLEAR', async () => {
    stubBridge();
    const el = await renderBanner([video(1, 90)]);
    // Not a problem: no alert strip exists at all for a video-only set.
    expect(el.querySelector('[role="alert"]')).toBeNull();
    const neutral = neutralStrip(el);
    expect(neutral).not.toBeNull();
    expect(neutral?.getAttribute('role')).toBe('status');
    expect(el.textContent).toContain('Layer 1-90 is carrying video (ffmpeg)');
    expect(el.textContent).toContain('placed by another system');
    expect(el.textContent).not.toContain('Not clearable from here');
    expect(
      [...(neutral?.querySelectorAll('button') ?? [])].map((b) => b.getAttribute('aria-label')),
    ).toEqual(['Clear layer 1-90', 'Dismiss this notice']);
  });

  it('🔴 CONTROL — above the bands a video layer offers NO Clear, and says so', async () => {
    stubBridge();
    const el = await renderBanner([video(1, 120)]);
    const neutral = neutralStrip(el);
    expect(neutral?.textContent).toContain('Layer 1-120 is carrying video (ffmpeg)');
    expect(neutral?.textContent).toContain('Not clearable from here.');
    // The affordance does not exist — not disabled, ABSENT.
    expect(clears(el)).toHaveLength(0);
  });

  it('an unrecognised producer kind is presented exactly as video — "not html" fails safe', async () => {
    stubBridge();
    const el = await renderBanner([video(1, 73, 'decklink')]);
    expect(el.querySelector('[role="alert"]')).toBeNull();
    expect(neutralStrip(el)?.getAttribute('role')).toBe('status');
    expect(el.textContent).toContain('Layer 1-73 is carrying video (decklink)');
    expect(labels(el)).toEqual(['Clear layer 1-73']);
  });

  it('html and video coexist: the html orphan keeps its warning + Clear, and the video row has its own', async () => {
    stubBridge();
    const el = await renderBanner([orphan(1, 60), video(1, 90)]);
    // The html orphan's R-009 surface is byte-for-byte alive…
    const alert = el.querySelector('[aria-label="Orphaned on-air layers"]');
    expect(alert?.getAttribute('role')).toBe('alert');
    expect(el.textContent).toContain('Layer 1-60 is on air but not on your stack');
    expect(labels(alert ?? el)).toEqual(['Clear layer 1-60']);
    // …and the video row stays neutral, in its own strip, with its own Clear.
    expect(el.textContent).toContain('Layer 1-90 is carrying video (ffmpeg)');
    expect(labels(neutralStrip(el) ?? el)).toEqual(['Clear layer 1-90']);
  });

  it('🔴 a video row’s CLEAR confirms, then sends exactly one `layers.clear` for that layer — cancel sends nothing', async () => {
    const { clear } = stubBridge();
    const el = await renderBanner([video(2, 70)]);
    const btn = el.querySelector<HTMLButtonElement>('button[aria-label="Clear layer 2-70"]');
    expect(btn).not.toBeNull();

    await act(async () => {
      btn?.click();
      await Promise.resolve();
    });
    expect(openDialog()?.textContent).toContain('Clear layer 2-70');
    await clickDialogButton('Cancel');
    expect(clear).not.toHaveBeenCalled();

    await act(async () => {
      btn?.click();
      await Promise.resolve();
    });
    await clickDialogButton('Clear layer');
    expect(clear).toHaveBeenCalledTimes(1);
    expect(clear).toHaveBeenCalledWith({ channel: 2, layer: 70 });
  });

  it('🔴 CLEAR ALL LISTED: one confirm naming every layer in 50–99, then one `layers.clear` per layer, in turn — never the layer above the bands, never a channel', async () => {
    const { clear } = stubBridge();
    const el = await renderBanner([video(2, 70), video(2, 71, 'route'), video(2, 120)]);
    const all = neutralStrip(el)?.querySelector<HTMLButtonElement>(
      'button[aria-label="Clear all listed layers"]',
    );
    expect(all?.textContent).toBe('CLEAR ALL LISTED');

    await act(async () => {
      all?.click();
      await Promise.resolve();
    });
    const dialog = openDialog();
    expect(dialog?.textContent).toContain('Clear 2 layers?');
    expect(dialog?.textContent).toContain('2-70, 2-71');
    expect(dialog?.textContent, 'the layer above the bands is not in the batch').not.toContain(
      '2-120',
    );
    // Cancel first — nothing is sent.
    await clickDialogButton('Cancel');
    expect(clear).not.toHaveBeenCalled();

    await act(async () => {
      all?.click();
      await Promise.resolve();
    });
    await clickDialogButton('Clear 2 layers');
    await act(async () => {
      await Promise.resolve();
    });
    expect(clear.mock.calls).toEqual([[{ channel: 2, layer: 70 }], [{ channel: 2, layer: 71 }]]);
  });

  it('CLEAR ALL LISTED appears only when a strip lists two or more layers it may clear', async () => {
    stubBridge();
    const one = await renderBanner([video(1, 70), video(1, 120)]);
    expect(labels(one)).toEqual(['Clear layer 1-70']);
    container?.remove();
    const two = await renderBanner([orphan(1, 60), orphan(1, 61)]);
    expect(labels(two)).toEqual([
      'Clear layer 1-60',
      'Clear layer 1-61',
      'Clear all listed layers',
    ]);
  });

  it('with CasparCG unreachable every CLEAR — per row and all — is disabled', async () => {
    stubBridge('caspar-down');
    const el = await renderBanner([video(1, 70), video(1, 71)]);
    const buttons = [...clears(el)];
    expect(buttons.map((b) => b.getAttribute('aria-label'))).toEqual([
      'Clear layer 1-70',
      'Clear layer 1-71',
      'Clear all listed layers',
    ]);
    expect(buttons.every((b) => b.disabled)).toBe(true);
  });
});

/**
 * 🔴 `B-292` (`RELEASE-091-01` DELTA B, B1) — **A LAYER OF OURS CLEARED OUTSIDE CG CONTROL**, said in
 * this family's own words and dismissed the same way. The bridge half (the silence question, the row
 * off air, nothing re-sent) is `media-plates.integration.test.ts`.
 */
describe('OrphanLayersBanner — B-292 a layer of ours cleared outside CG Control', () => {
  const cleared = (channel: number, layer: number, at = '2026-09-29T20:00:00.000Z') => ({
    channel,
    layer,
    at,
  });
  const strip = (el: ParentNode): Element | null =>
    el.querySelector('[aria-label="Layers cleared outside CG Control"]');

  function freshStorage(): void {
    const data = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => {
        data.set(key, String(value));
      },
      removeItem: (key: string) => {
        data.delete(key);
      },
    });
    __reloadForeignDismissalsForTest();
  }

  it('🔴 names each layer in the owner’s sentence, as an alert — control: an empty list renders nothing', async () => {
    stubBridge();
    freshStorage();
    const quiet = await renderBanner([], [], []);
    expect(quiet.textContent).toBe('');
    container?.remove();

    const el = await renderBanner([], [], [cleared(2, 60), cleared(2, 71)]);
    expect(strip(el)?.getAttribute('role')).toBe('alert');
    expect(strip(el)?.textContent).toContain('Layer 60 on CH 2 was cleared outside CG Control');
    expect(strip(el)?.textContent).toContain('Layer 71 on CH 2 was cleared outside CG Control');
    // A statement, with nothing to press but its dismiss: nothing is put back from here.
    expect(
      [...(strip(el)?.querySelectorAll('button') ?? [])].map((b) => b.getAttribute('aria-label')),
    ).toEqual(['Dismiss this notice']);
  });

  it('🔴 a dismissal holds across a reload — and the same layer cleared AGAIN brings the strip back', async () => {
    stubBridge();
    freshStorage();
    const first = [cleared(2, 60)];
    const el = await renderBanner([], [], first);
    await act(async () => {
      strip(el)
        ?.querySelector<HTMLButtonElement>('button[aria-label="Dismiss this notice"]')
        ?.click();
    });
    expect(strip(el)).toBeNull();
    expect(orphanWarningChannels([], [], dismissedClearedOutside({}, first), first)).toEqual([]);

    container?.remove();
    __reloadForeignDismissalsForTest();
    const reloaded = await renderBanner([], [], first);
    expect(strip(reloaded), 'the dismissal survived the reload').toBeNull();

    container?.remove();
    const again = await renderBanner([], [], [cleared(2, 60, '2026-09-29T20:05:00.000Z')]);
    expect(strip(again)?.textContent).toContain('Layer 60 on CH 2 was cleared outside CG Control');
  });

  it('marks its channel while it stands', () => {
    const list = [cleared(2, 60)];
    expect(orphanWarningChannels([], [], {}, list)).toEqual([2]);
    expect(orphanWarningChannels([], [], dismissedClearedOutside({}, list), list)).toEqual([]);
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
            createElement(OrphanLayersBanner, {
              orphans: next,
              ownedOccupancy: [],
              clearedOutside: [],
            }),
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
