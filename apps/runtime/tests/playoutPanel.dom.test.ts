// @vitest-environment jsdom
import { StrictMode, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PlayoutLayerState } from '@cg/shared-ipc';
import { PlayoutPanel } from '../src/renderer/features/layers/PlayoutPanel.js';
import {
  clearablePlayoutLayers,
  hasPlayoutOccupant,
  playoutOccupancy,
} from '../src/renderer/features/layers/playoutOccupancy.js';
import { onCommandError } from '../src/renderer/features/status/commandFeedback.js';
import { clearPortals, openDialog } from './support/dialog.js';

/**
 * R-028 part B — the PLAYOUT tab, and above all its CLEAR GATE.
 *
 * These are the tests that matter most in this change: the tab can take another
 * system's graphics off air, so every case where it must NOT offer that is
 * pinned here — a non-html producer, an unverifiable occupancy, and a dead
 * link — alongside the one case where it may.
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
  clearPortals();
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

const HTML_LAYER: PlayoutLayerState = {
  channel: 1,
  layer: 60,
  observed: { kind: 'producer', producer: 'html' },
};
const VIDEO_LAYER: PlayoutLayerState = {
  channel: 1,
  layer: 61,
  observed: { kind: 'producer', producer: 'ffmpeg' },
};
const UNKNOWN_LAYER: PlayoutLayerState = { channel: 1, layer: 62, observed: { kind: 'unknown' } };
const EMPTY_LAYER: PlayoutLayerState = { channel: 1, layer: 63, observed: { kind: 'empty' } };

function stubBridge(
  link: 'live' | 'disconnected',
  clearResult: unknown = { ok: true },
): {
  clear: ReturnType<typeof vi.fn>;
} {
  const clear = vi.fn(() => Promise.resolve(clearResult));
  const stub = {
    link: { status: () => link, onStatusChanged: () => () => undefined },
    playoutLayers: {
      clear,
      state: () => Promise.resolve([]),
      onStateChanged: () => () => undefined,
    },
  };
  (window as unknown as { cg: typeof stub }).cg = stub;
  return { clear };
}

async function render(
  layers: PlayoutLayerState[],
  link: 'live' | 'disconnected' = 'live',
  clearResult: unknown = { ok: true },
): Promise<{ el: HTMLDivElement; clear: ReturnType<typeof vi.fn> }> {
  const { clear } = stubBridge(link, clearResult);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  const r = root;
  await act(async () => {
    r.render(createElement(StrictMode, null, createElement(PlayoutPanel, { layers })));
  });
  return { el: container, clear };
}

/** The clear control for one layer row, or undefined when none is offered. */
function clearButtonFor(el: HTMLElement, layer: number): HTMLButtonElement | undefined {
  const row = el.querySelector(`[data-playout-layer="${String(layer)}"]`);
  return [...(row?.querySelectorAll('button') ?? [])].find((b) => b.textContent === 'CLEAR');
}

describe('the playout tab offers CLEAR for exactly one occupant kind', () => {
  it('an HTML producer IS clearable — the playout-graphics case the owner asked for', async () => {
    const { el } = await render([HTML_LAYER]);
    expect(clearButtonFor(el, 60)).toBeDefined();
    expect(el.textContent).toContain('Graphic on air');
  });

  it('a NON-HTML producer gets NO clear control at all, and the row says why', async () => {
    const { el } = await render([VIDEO_LAYER]);
    // Not a disabled button — no control. An operator must not be left
    // wondering whether it would work if they tried harder.
    expect(clearButtonFor(el, 61)).toBeUndefined();
    const row = el.querySelector('[data-playout-layer="61"]');
    expect(row?.textContent).toContain('ffmpeg');
    expect(row?.textContent).toContain('not a graphic');
    // The reason names the hazard the reservation exists to prevent.
    expect(row?.textContent).toContain('clearing a live video or channel feed');
  });

  it('UNKNOWN occupancy is never treated as empty, and offers no clear (fail closed)', async () => {
    const { el } = await render([UNKNOWN_LAYER]);
    expect(clearButtonFor(el, 62)).toBeUndefined();
    const row = el.querySelector('[data-playout-layer="62"]');
    expect(row?.textContent).toContain('Unknown');
    expect(row?.textContent).toContain('cannot be verified');
    // The distinction that matters: unknown must not read as "nothing here".
    expect(row?.textContent).not.toContain('Nothing on this layer');
  });

  it('an EMPTY layer offers nothing — there is nothing to clear', async () => {
    const { el } = await render([EMPTY_LAYER]);
    expect(clearButtonFor(el, 63)).toBeUndefined();
    expect(el.querySelector('[data-playout-layer="63"]')?.textContent).toContain('Empty');
  });

  it('with the bridge DOWN every layer reads unknown and nothing is clearable', async () => {
    const { el } = await render([HTML_LAYER, VIDEO_LAYER], 'disconnected');
    expect(clearButtonFor(el, 60)).toBeUndefined();
    expect(clearButtonFor(el, 61)).toBeUndefined();
    // A frozen snapshot is a claim the wire can no longer back.
    expect(el.textContent).toContain('Not connected');
  });
});

describe('clear-all is gated, and can only ever touch what the single clears could', () => {
  it('names how many and WHICH layers, and says they are not our layers', async () => {
    const { el, clear } = await render([HTML_LAYER, VIDEO_LAYER, UNKNOWN_LAYER, EMPTY_LAYER]);
    const all = [...el.querySelectorAll('button')].find((b) => b.textContent === 'CLEAR ALL');
    expect(all).toBeDefined();
    await act(async () => {
      all?.click();
      await Promise.resolve();
    });
    const dialog = openDialog();
    expect(dialog?.textContent).toContain('NOT our layers');
    // Only the ONE html layer is in scope — the count and the list say so.
    expect(dialog?.textContent).toContain('60');
    expect(dialog?.textContent).not.toContain('61');
    expect(dialog?.textContent).toContain('are NOT included');
    // Nothing dispatched until the operator confirms.
    expect(clear).not.toHaveBeenCalled();
  });

  it('clears ONLY the html subset when confirmed', async () => {
    const { el, clear } = await render([HTML_LAYER, VIDEO_LAYER, UNKNOWN_LAYER]);
    const all = [...el.querySelectorAll('button')].find((b) => b.textContent === 'CLEAR ALL');
    await act(async () => {
      all?.click();
      await Promise.resolve();
    });
    const confirmBtn = [...(openDialog()?.querySelectorAll('button') ?? [])].find((b) =>
      b.textContent?.startsWith('Clear 1 layer'),
    );
    await act(async () => {
      confirmBtn?.click();
      await Promise.resolve();
    });
    expect(clear).toHaveBeenCalledTimes(1);
    expect(clear).toHaveBeenCalledWith({ channel: 1, layer: 60 });
  });

  it('is not offered at all when nothing is clearable', async () => {
    const { el } = await render([VIDEO_LAYER, UNKNOWN_LAYER, EMPTY_LAYER]);
    expect([...el.querySelectorAll('button')].some((b) => b.textContent === 'CLEAR ALL')).toBe(
      false,
    );
  });
});

describe('a bridge-side refusal is surfaced with the rule that fired', () => {
  it('names the observed kind when the bridge refuses a non-html clear', async () => {
    const errors: string[] = [];
    const off = onCommandError((m) => errors.push(m));
    // The renderer would not offer this, but the bridge holds the same gate
    // INDEPENDENTLY — this pins that its refusal is reported, not swallowed.
    const { el } = await render([HTML_LAYER], 'live', {
      ok: false,
      reason: 'not-html',
      observedProducer: 'decklink',
    });
    const btn = clearButtonFor(el, 60);
    await act(async () => {
      btn?.click();
      await Promise.resolve();
    });
    const confirmed = [...(openDialog()?.querySelectorAll('button') ?? [])];
    void confirmed;
    off();
    expect(errors.join(' ')).toContain('decklink');
  });
});

describe('the pure gate (playoutOccupancy) — the safety boundary, without a DOM', () => {
  it('clearable ONLY for html on a live link', () => {
    expect(playoutOccupancy(HTML_LAYER, false).clearable).toBe(true);
    expect(playoutOccupancy(VIDEO_LAYER, false).clearable).toBe(false);
    expect(playoutOccupancy(UNKNOWN_LAYER, false).clearable).toBe(false);
    expect(playoutOccupancy(EMPTY_LAYER, false).clearable).toBe(false);
    // Link down masks everything, including the html case.
    expect(playoutOccupancy(HTML_LAYER, true).clearable).toBe(false);
  });

  it('any producer kind other than exactly "html" fails safe', () => {
    for (const producer of ['ffmpeg', 'decklink', 'route', 'image', 'HTML', 'html ', '']) {
      const layer: PlayoutLayerState = {
        channel: 1,
        layer: 60,
        observed: { kind: 'producer', producer },
      };
      expect(playoutOccupancy(layer, false).clearable, producer).toBe(false);
    }
  });

  it('the bulk subset is exactly the union of the individually-clearable rows', () => {
    const layers = [HTML_LAYER, VIDEO_LAYER, UNKNOWN_LAYER, EMPTY_LAYER];
    const bulk = clearablePlayoutLayers(layers, false);
    const individually = layers.filter((l) => playoutOccupancy(l, false).clearable);
    expect(bulk).toEqual(individually);
    expect(bulk).toEqual([HTML_LAYER]);
  });

  it('the tab badge means "something IS here" — an unknown never raises it', () => {
    expect(hasPlayoutOccupant([HTML_LAYER])).toBe(true);
    expect(hasPlayoutOccupant([VIDEO_LAYER])).toBe(true);
    // Unknown is the ABSENCE of a claim, not a claim that something is there.
    expect(hasPlayoutOccupant([UNKNOWN_LAYER, EMPTY_LAYER])).toBe(false);
  });
});
