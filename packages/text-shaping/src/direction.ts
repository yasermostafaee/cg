/**
 * Coarse bidi detection. Not the full Unicode Bidirectional Algorithm —
 * a pragmatic heuristic counting strong-LTR vs strong-RTL codepoints.
 * Sufficient for the operator-UI level (deciding input direction); the
 * actual layout is delegated to the browser/CEF.
 */

export type Direction = 'ltr' | 'rtl' | 'mixed' | 'neutral';

const RTL_RANGES: readonly (readonly [number, number])[] = [
  [0x0590, 0x05ff], // Hebrew
  [0x0600, 0x06ff], // Arabic
  [0x0700, 0x074f], // Syriac
  [0x0750, 0x077f], // Arabic Supplement
  [0x0780, 0x07bf], // Thaana
  [0x07c0, 0x07ff], // NKo
  [0x0800, 0x083f], // Samaritan
  [0x0840, 0x085f], // Mandaic
  [0x0860, 0x086f], // Syriac Supplement
  [0x0870, 0x089f], // Arabic Extended-B
  [0x08a0, 0x08ff], // Arabic Extended-A
  [0xfb1d, 0xfb4f], // Hebrew Presentation Forms
  [0xfb50, 0xfdff], // Arabic Presentation Forms-A
  [0xfe70, 0xfeff], // Arabic Presentation Forms-B
];

function inRange(cp: number, ranges: readonly (readonly [number, number])[]): boolean {
  for (const [lo, hi] of ranges) {
    if (cp >= lo && cp <= hi) return true;
  }
  return false;
}

/** True if codepoint is a strong RTL letter (Arabic, Hebrew, etc.). */
export function isRtlStrong(cp: number): boolean {
  return inRange(cp, RTL_RANGES);
}

/**
 * True if codepoint is a strong LTR letter. Limited to Latin and a few
 * common scripts; we don't need exhaustive coverage for direction detection.
 */
export function isLtrStrong(cp: number): boolean {
  // Basic Latin letters
  if ((cp >= 0x41 && cp <= 0x5a) || (cp >= 0x61 && cp <= 0x7a)) return true;
  // Latin-1 Supplement letters
  if (cp >= 0xc0 && cp <= 0xff && cp !== 0xd7 && cp !== 0xf7) return true;
  // Latin Extended-A and -B
  if (cp >= 0x0100 && cp <= 0x024f) return true;
  // IPA Extensions through Greek/Cyrillic letters
  if (cp >= 0x0250 && cp <= 0x04ff) return true;
  return false;
}

/**
 * Returns `'rtl'` / `'ltr'` / `'mixed'` / `'neutral'` based on strong-script
 * codepoint counts. Digits, punctuation, whitespace, and emoji are neutral.
 */
export function detectDirection(text: string): Direction {
  let rtl = 0;
  let ltr = 0;
  for (const ch of text) {
    const cp = ch.codePointAt(0);
    if (cp === undefined) continue;
    if (isRtlStrong(cp)) rtl += 1;
    else if (isLtrStrong(cp)) ltr += 1;
  }
  if (rtl === 0 && ltr === 0) return 'neutral';
  if (rtl > 0 && ltr === 0) return 'rtl';
  if (ltr > 0 && rtl === 0) return 'ltr';
  return 'mixed';
}

/** Convenience: true iff the string contains any Arabic/Hebrew letter. */
export function containsRtl(text: string): boolean {
  for (const ch of text) {
    const cp = ch.codePointAt(0);
    if (cp !== undefined && isRtlStrong(cp)) return true;
  }
  return false;
}

/** Convenience: true iff the string contains any Latin/Cyrillic/Greek letter. */
export function containsLtr(text: string): boolean {
  for (const ch of text) {
    const cp = ch.codePointAt(0);
    if (cp !== undefined && isLtrStrong(cp)) return true;
  }
  return false;
}
