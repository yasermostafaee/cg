// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { colors } from '../src/renderer/theme.js';
import { itemWith, renderLayerRow } from './support/layerRow.js';

/**
 * `B-232` / `STATION-SETUP-02` §R2 — **a MARKED row's muted texts are READABLE on the
 * owner's amber, and the ratio is measured against the real colours.**
 *
 * `emptiedAirRowMark.dom.test.ts` asserts the HOOK and deliberately never a colour. This
 * file is the other half, and it names colours on purpose: the mark's fill is
 * `rgb(145 93 5)` (the owner's opaque amber, tuned by hand), and on it `colors.textMuted`
 * measured 2.19:1 — the bank number on exactly the rows the notice is pointing at was
 * unreadable. Raising those texts on a marked row is the remedy; the fill is not moved.
 *
 * ── WHY THE FILL IS PARSED FROM THE STYLESHEET, NOT TYPED HERE ─────────────────
 *
 * The ratio is a property of TWO values. Pinning both by hand would let the CSS change under
 * the test while it kept passing against the old number. So the fill and the edge-bar colour
 * are read from the `.cg-row.is-emptied-air` rule itself, and the ink from the rendered row's
 * inline style — the same two things a browser composites. The fill is opaque, so composited
 * it IS itself; nothing has to be blended.
 *
 * ── THE POSITIVE CONTROL ────────────────────────────────────────────────────────
 *
 * `colors.textMuted` on that fill must measure BELOW 3:1. If it did not, the instrument would
 * be measuring nothing that ever failed, and "the marked ink clears 4.5:1" would be true of
 * any grey at all.
 */

// From the WORKSPACE ROOT, not `import.meta.url`: under vitest's jsdom transform that is not a
// `file:` URL (the derived census in `modalMessageRegion.dom.test.ts` records the same trap).
const css = readFileSync(join(process.cwd(), 'src', 'renderer', 'ui', 'controls.css'), 'utf8');

type Rgb = readonly [number, number, number];

/** `#rrggbb`, `rgb(r g b)` and `rgb(r, g, b)` — the three spellings the row and the CSS use. */
function parseColour(text: string): Rgb {
  const hex = /^#([0-9a-f]{6})$/i.exec(text.trim());
  if (hex !== null) {
    const n = Number.parseInt(hex[1] ?? '', 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const rgb = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/i.exec(text.trim());
  if (rgb === null) throw new Error(`not a colour this test can read: ${text}`);
  return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
}

/** WCAG 2.x relative luminance. */
function luminance([r, g, b]: Rgb): number {
  const channel = (v: number): number => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrast(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** The marked-row rule's gradient, as the two colours it is made of. */
function markedRowColours(): { fill: Rgb; bar: Rgb } {
  const rule = /\.cg-row\.is-emptied-air,[\s\S]*?\{([\s\S]*?)\}/.exec(css);
  if (rule === null) throw new Error('the .cg-row.is-emptied-air rule is gone from controls.css');
  const gradient = /linear-gradient\(([\s\S]*?)\);/.exec(rule[1] ?? '');
  if (gradient === null) throw new Error('the marked row no longer paints a gradient');
  // `90deg, <bar> 0 3px, <fill> 3px calc(100% - 3px), <bar> calc(100% - 3px)` — the colour
  // is the first token of each stop; `rgb(145 93 5)` carries no comma of its own.
  const stops = (gradient[1] ?? '')
    .split(',')
    .map((s) => s.trim())
    .slice(1)
    .map((stop) => {
      const colour = /^(#[0-9a-f]{6}|rgba?\([^)]*\))/i.exec(stop);
      if (colour === null) throw new Error(`a gradient stop without a colour: ${stop}`);
      return parseColour(colour[1] ?? '');
    });
  const [bar, fill] = stops as [Rgb, Rgb, Rgb];
  return { fill, bar };
}

describe('§R2 — the marked row’s muted texts clear AA on the owner’s amber', () => {
  const { fill, bar } = markedRowColours();

  it('the fill is the owner’s value, untouched', () => {
    // `rgb(145 93 5)` is his decision (see the rule’s own note). If it is ever re-tuned on
    // purpose, this line changes with it and the ratios below are re-measured against the
    // new value automatically — which is the point of parsing it.
    expect(fill).toEqual([145, 93, 5]);
  });

  it('POSITIVE CONTROL: the ordinary muted grey really is unreadable on that fill', () => {
    const ratio = contrast(parseColour(colors.textMuted), fill);
    expect(ratio).toBeLessThan(3);
    // The number the report quotes — 2.19:1 — so a reader can check the instrument.
    expect(ratio).toBeCloseTo(2.19, 1);
  });

  it('the bank number and the missing-template marker measure at least 4.5:1 on a MARKED row', async () => {
    // A bound row whose template is NOT in this browser: both muted texts are on screen.
    const { container, unmount } = await renderLayerRow({
      emptiedAir: true,
      item: itemWith('loaded'),
      template: null,
    });
    const row = container.querySelector<HTMLElement>('.cg-row');
    expect(row?.className).toContain('is-emptied-air');

    const number = row?.children[0] as HTMLElement | undefined;
    expect(number?.textContent).toBe('1');
    // The INNERMOST span: the template cell's own textContent contains the marker's, and the
    // cell is `colors.text` — which measures 4.497:1 here, the hair-under-AA figure the
    // theme note quotes. Matching on the exact trimmed text picks the marker itself.
    const marker = [...(row?.querySelectorAll<HTMLElement>('span') ?? [])].find(
      (s) => (s.textContent ?? '').trim() === '(not in this browser)',
    );
    expect(marker, 'the missing-template marker is rendered').toBeDefined();

    for (const [name, el] of [
      ['bank number', number],
      ['missing-template marker', marker],
    ] as const) {
      const ink = parseColour(el?.style.color ?? '');
      expect(contrast(ink, fill), `${name} on the marked fill`).toBeGreaterThanOrEqual(4.5);
    }
    await unmount();
  });

  it('…and NOTHING ELSE moved: an unmarked row keeps the muted grey', async () => {
    const { container, unmount } = await renderLayerRow({
      emptiedAir: false,
      item: itemWith('loaded'),
      template: null,
    });
    const row = container.querySelector<HTMLElement>('.cg-row');
    const number = row?.children[0] as HTMLElement | undefined;
    expect(parseColour(number?.style.color ?? '')).toEqual(parseColour(colors.textMuted));
    await unmount();
  });

  it('the edge bars are visible against the fill — at least the 3:1 graphic floor', () => {
    // They were the strip’s BORDER colour and measured 1.11:1 on the opaque fill: gone in
    // all but name. They now take the strip’s INK, so the “same object as the notice” link
    // survives AND the bar beside the verbs actually reads as one.
    expect(contrast(bar, fill)).toBeGreaterThanOrEqual(3);
  });
});
