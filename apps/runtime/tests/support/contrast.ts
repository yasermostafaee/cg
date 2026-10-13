/**
 * 🔴 THE ONE CONTRAST HELPER — `CONSOLE-LOOK-06` DELTA R ADDENDUM B §B3.
 *
 * It was local to `emptiedAirRowContrast.dom.test.ts`, and the second test that needed it was
 * about to copy it. Golden rule 6's shape one level out: a second copy of a measurement is how
 * two guards come to disagree about what "clears AA" means, and a contrast guard that can
 * disagree with another contrast guard is worse than one guard.
 *
 * WCAG 2.x, unchanged in behaviour from the copy it replaces.
 */

export type Rgb = readonly [number, number, number];

/** `#rrggbb`, `rgb(r g b)` and `rgb(r, g, b)` — the three spellings this app's tokens use. */
export function parseColour(text: string): Rgb {
  const hex = /^#([0-9a-f]{6})$/i.exec(text.trim());
  if (hex !== null) {
    const n = Number.parseInt(hex[1] ?? '', 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const rgb = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/i.exec(text.trim());
  if (rgb === null) throw new Error(`not a colour this helper can read: ${text}`);
  return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
}

/** WCAG 2.x relative luminance. */
export function luminance([r, g, b]: Rgb): number {
  const channel = (v: number): number => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** The ratio between two colours, order-independent. */
export function contrast(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** Ratio from two colour STRINGS, which is what a token or a computed style hands you. */
export function contrastOf(ink: string, ground: string): number {
  return contrast(parseColour(ink), parseColour(ground));
}

/**
 * WCAG AA for body text. The threshold this repo's message guards cite.
 *
 * ⚠ 4.5 and not 3.0: a message is a SENTENCE, read at body size. The 3.0 floor is for GRAPHICS
 * and large text — `LayerTableHeader` used it correctly for an 11 px warning triangle, which is
 * a mark rather than a word. Picking the graphic floor for a paragraph is how an illegible
 * sentence passes a guard that looks strict.
 */
export const AA_TEXT = 4.5;
