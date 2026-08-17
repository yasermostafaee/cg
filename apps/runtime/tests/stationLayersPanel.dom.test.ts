// @vitest-environment jsdom
import { StrictMode, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PlayoutLayerState } from '@cg/shared-ipc';
import { StationLayersPanel } from '../src/renderer/features/layers/StationLayersPanel.js';
import {
  clearableStationLayers,
  hasStationLayerOccupant,
  stationLayerOccupancy,
} from '../src/renderer/features/layers/stationLayerOccupancy.js';
import { onCommandError } from '../src/renderer/features/status/commandFeedback.js';
import { clearPortals, openDialog } from './support/dialog.js';
import { connectionsStub, type Reachability } from './support/reachability.js';

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
  reach: Reachability = 'both-up',
): {
  clear: ReturnType<typeof vi.fn>;
} {
  const clear = vi.fn(() => Promise.resolve(clearResult));
  const stub = {
    link: { status: () => link, onStatusChanged: () => () => undefined },
    // §1 — the panel reads the SECOND hop now, so the stub must answer it. A stub
    // that omits a channel does not fail where it is written; it fails in
    // whichever spec first renders a component that reaches for it.
    connections: connectionsStub(reach),
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
  reach: Reachability = 'both-up',
): Promise<{ el: HTMLDivElement; clear: ReturnType<typeof vi.fn> }> {
  const { clear } = stubBridge(link, clearResult, reach);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  const r = root;
  await act(async () => {
    r.render(createElement(StrictMode, null, createElement(StationLayersPanel, { layers })));
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

/**
 * §1 — THE OTHER CLEAR THE GATE MISSED, and the comment that had to be read
 * before touching it.
 *
 * `StationLayersPanel` carries an explicit "deliberately NOT a disabled button". It
 * governs the LAYER-STATE gate — a video occupant, an unverifiable occupancy, an
 * empty layer — where the reason is permanent, printed in the row, and a disabled
 * control would invite the operator to keep trying. That decision is UNCHANGED and
 * is re-pinned by the specs above: those cases still have NO control at all.
 *
 * Reachability is a different fact: transient, nothing to do with this layer, and
 * gone the instant the link returns. There the control stays present and goes
 * DISABLED with the reason, because a clear that cannot leave the browser is a
 * dead button whatever the policy — and this one takes ANOTHER system's graphic
 * off air, so believing it worked is expensive.
 */
describe('the playout CLEAR is gated on reachability — present but disabled, never absent', () => {
  it('with CasparCG unreachable the control is still THERE, disabled, and says why', async () => {
    const { el } = await render([HTML_LAYER], 'live', { ok: true }, 'caspar-down');
    const btn = clearButtonFor(el, 60);
    // PRESENT — this is the distinction from the layer-state gate above.
    expect(btn).toBeDefined();
    expect(btn?.disabled).toBe(true);
    expect(btn?.title).toMatch(/CasparCG cannot be reached/i);
  });

  it('CLEAR ALL is gated the same way, and for the same reason', async () => {
    const { el } = await render([HTML_LAYER], 'live', { ok: true }, 'caspar-down');
    const all = [...el.querySelectorAll('button')].find((b) => b.textContent === 'CLEAR ALL');
    expect(all).toBeDefined();
    expect(all?.disabled).toBe(true);
    expect(all?.title).toMatch(/CasparCG cannot be reached/i);
  });

  it('the BOOT WINDOW says connecting, not a playout server nothing reported down', async () => {
    const { el } = await render([HTML_LAYER], 'live', { ok: true }, 'unknown');
    const btn = clearButtonFor(el, 60);
    expect(btn?.disabled).toBe(true);
    expect(btn?.title).toMatch(/connecting/i);
    expect(btn?.title).not.toMatch(/cannot be reached/i);
  });

  it('and with both hops up it is enabled again — a gate, not a removal', async () => {
    const { el } = await render([HTML_LAYER]);
    expect(clearButtonFor(el, 60)?.disabled).toBe(false);
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
    // The per-layer clear is confirm-gated too — it takes another system's
    // graphic off air, so it asks first.
    const confirmBtn = [...(openDialog()?.querySelectorAll('button') ?? [])].find((b) =>
      b.textContent?.startsWith('Clear layer 60'),
    );
    expect(confirmBtn).toBeDefined();
    await act(async () => {
      confirmBtn?.click();
      await Promise.resolve();
    });
    off();
    // The SPECIFIC rule that fired survives — it must not be overwritten by a
    // generic "Not accepted." from the button's own error path.
    expect(errors.join(' ')).toContain('decklink');
    expect(errors.join(' ')).not.toContain('Not accepted.');
  });

  it('the per-layer CLEAR asks before it acts, and sends nothing if declined', async () => {
    const { el, clear } = await render([HTML_LAYER]);
    await act(async () => {
      clearButtonFor(el, 60)?.click();
      await Promise.resolve();
    });
    const dialog = openDialog();
    expect(dialog?.textContent).toContain('NOT our layer');
    expect(clear).not.toHaveBeenCalled();
    const cancel = [...(dialog?.querySelectorAll('button') ?? [])].find(
      (b) => b.textContent === 'Cancel',
    );
    await act(async () => {
      cancel?.click();
      await Promise.resolve();
    });
    expect(clear).not.toHaveBeenCalled();
  });
});

describe('the pure gate (stationLayerOccupancy) — the safety boundary, without a DOM', () => {
  it('clearable ONLY for html on a live link', () => {
    expect(stationLayerOccupancy(HTML_LAYER, false).clearable).toBe(true);
    expect(stationLayerOccupancy(VIDEO_LAYER, false).clearable).toBe(false);
    expect(stationLayerOccupancy(UNKNOWN_LAYER, false).clearable).toBe(false);
    expect(stationLayerOccupancy(EMPTY_LAYER, false).clearable).toBe(false);
    // Link down masks everything, including the html case.
    expect(stationLayerOccupancy(HTML_LAYER, true).clearable).toBe(false);
  });

  it('any producer kind other than exactly "html" fails safe', () => {
    for (const producer of ['ffmpeg', 'decklink', 'route', 'image', 'HTML', 'html ', '']) {
      const layer: PlayoutLayerState = {
        channel: 1,
        layer: 60,
        observed: { kind: 'producer', producer },
      };
      expect(stationLayerOccupancy(layer, false).clearable, producer).toBe(false);
    }
  });

  it('the bulk subset is exactly the union of the individually-clearable rows', () => {
    const layers = [HTML_LAYER, VIDEO_LAYER, UNKNOWN_LAYER, EMPTY_LAYER];
    const bulk = clearableStationLayers(layers, false);
    const individually = layers.filter((l) => stationLayerOccupancy(l, false).clearable);
    expect(bulk).toEqual(individually);
    expect(bulk).toEqual([HTML_LAYER]);
  });

  it('the tab badge means "something IS here" — an unknown never raises it', () => {
    expect(hasStationLayerOccupant([HTML_LAYER])).toBe(true);
    expect(hasStationLayerOccupant([VIDEO_LAYER])).toBe(true);
    // Unknown is the ABSENCE of a claim, not a claim that something is there.
    expect(hasStationLayerOccupant([UNKNOWN_LAYER, EMPTY_LAYER])).toBe(false);
  });
});
