// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { colors } from '../src/renderer/theme.js';
import { itemWith, renderLayerRow, type RenderedRow } from './support/layerRow.js';

/**
 * R-022 — **the REHEARSING row's DOM appearance, asserted for the first time.**
 *
 * Session BR made this state reachable from the harness (the required `rehearsing`
 * prop was never passed, so every spec rendered with it falsy) and deliberately did
 * NOT invent an appearance for it. This file does not invent one either: it asserts
 * the appearance the row already ships — `rowState`'s R-022 branch — which is
 * coherent with the REHEARSING mark everywhere else on the surface (the Inspector
 * badge, the PVW rail's "ON PVW" verb):
 *
 *   - the state cell says the WORD (`ON PVW` — the same words as the verb that
 *     turns it on),
 *   - wears the rehearse hue — pinned to the theme TOKEN (`colors.rehearsing`,
 *     the single source `--r-rehearsing` derives from), never to a hex, so a
 *     palette tune moves this test with it,
 *   - and carries `tone: 'idle'`, not `attention`: rehearse is a deliberate, safe
 *     operator choice.
 *
 * And the shipped PRIORITY: an AIR claim outranks the rehearse claim. The
 * operator's one urgent question is "what is on air", so a row that claims air
 * while we believe it is rehearsing wears ON AIR, never ON PVW.
 */

let rendered: RenderedRow | null = null;

afterEach(async () => {
  await rendered?.unmount();
  rendered = null;
  vi.restoreAllMocks();
});

/** The row's one state cell — the `status …` aria-label is its stable hook. */
function stateCell(container: HTMLElement): HTMLElement {
  const el = container.querySelector('[aria-label^="status "]');
  if (!(el instanceof HTMLElement)) throw new Error('state cell not found');
  return el;
}

/** The token's value as jsdom normalizes it, so the assertion never states a hex. */
function normalized(color: string): string {
  const probe = document.createElement('span');
  probe.style.color = color;
  return probe.style.color;
}

describe('R-022 — the rehearsing row wears ON PVW, in the rehearse hue', () => {
  it('an off-air rehearsing row: the word is ON PVW, the colour is the token, the tone is idle', async () => {
    rendered = await renderLayerRow({ item: itemWith('loaded'), rehearsing: true });
    const cell = stateCell(rendered.container);
    expect(cell.getAttribute('aria-label')).toBe('status ON PVW');
    expect(cell.style.color).toBe(normalized(colors.rehearsing));
    expect(cell.getAttribute('data-row-state')).toBe('idle');
  });

  it('the same row NOT rehearsing shows no ON PVW — the mark is the prop, not a default', async () => {
    rendered = await renderLayerRow({ item: itemWith('loaded'), rehearsing: false });
    const cell = stateCell(rendered.container);
    expect(cell.getAttribute('aria-label')).not.toBe('status ON PVW');
    expect(cell.style.color).not.toBe(normalized(colors.rehearsing));
  });

  it('an AIR claim outranks the rehearse claim — the row wears ON AIR, never ON PVW', async () => {
    rendered = await renderLayerRow({ item: itemWith('on-air'), rehearsing: true });
    const cell = stateCell(rendered.container);
    expect(cell.getAttribute('aria-label')).toBe('status ON AIR');
    expect(cell.getAttribute('data-row-state')).toBe('onair');
    expect(cell.style.color).not.toBe(normalized(colors.rehearsing));
  });
});
