// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { renderLayerRow } from './support/layerRow.js';

/**
 * `B-232` (owner) — **THE ROWS THE NOTICE IS TALKING ABOUT, MARKED ON THE ROWS.**
 *
 * The emptied-air strip names its rows and offers ONE PRESS to put them back. Until this,
 * the layer list below said nothing, so the operator had to carry two or three row names
 * in his head from the strip down to the table to see which rows the press would touch.
 *
 * ⚠ These assert the HOOK, never the amber. Same rule as `data-row-state`: the claim is
 * "this row is one the notice is about", and a spec matching a hex value would fail the
 * next time the palette is tuned while saying nothing about the property that matters.
 * The colour itself is one `background-image` in `controls.css`, where the three
 * constraints it has to satisfy are written down.
 */
describe('B-232 — a row the emptied-air notice names is marked', () => {
  it('carries the mark when the notice names it', async () => {
    const { container, unmount } = await renderLayerRow({ emptiedAir: true });
    const row = container.querySelector<HTMLElement>('.cg-row');
    expect(row?.hasAttribute('data-emptied-air')).toBe(true);
    expect(row?.className).toContain('is-emptied-air');
    await unmount();
  });

  it('carries NO mark by default — a row nobody is talking about is not marked', async () => {
    const { container, unmount } = await renderLayerRow({});
    const row = container.querySelector<HTMLElement>('.cg-row');
    expect(row?.hasAttribute('data-emptied-air')).toBe(false);
    expect(row?.className).not.toContain('is-emptied-air');
    await unmount();
  });

  it('🔴 does not displace the selection cue — a row can be both, and shows both', async () => {
    /*
      The two say different things and the operator needs both at once: SELECTED is "the
      Inspector is showing this", MARKED is "one press would put this back on air". The
      mark is a background LAYER precisely so it cannot clobber selection's ring; this
      pins that they coexist rather than one winning.
    */
    const { container, unmount } = await renderLayerRow({ emptiedAir: true, selected: true });
    const row = container.querySelector<HTMLElement>('.cg-row');
    expect(row?.className).toContain('is-emptied-air');
    expect(row?.className).toContain('is-selected');
    await unmount();
  });
});
