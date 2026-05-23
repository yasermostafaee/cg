/**
 * Digit conversions between Latin (0-9), Persian (۰-۹, U+06F0..U+06F9), and
 * Arabic-Indic (٠-٩, U+0660..U+0669). These are pure-byte transformations —
 * they do not touch any other characters.
 */

const LATIN_ZERO = 0x30;
const PERSIAN_ZERO = 0x06f0;
const ARABIC_INDIC_ZERO = 0x0660;

/** Convert Latin digits (0-9) in `s` to Persian digits (۰-۹). */
export function persianDigits(s: string): string {
  return s.replace(/[0-9]/g, (d) =>
    String.fromCodePoint(PERSIAN_ZERO + (d.charCodeAt(0) - LATIN_ZERO)),
  );
}

/** Convert Latin digits (0-9) in `s` to Arabic-Indic digits (٠-٩). */
export function arabicIndicDigits(s: string): string {
  return s.replace(/[0-9]/g, (d) =>
    String.fromCodePoint(ARABIC_INDIC_ZERO + (d.charCodeAt(0) - LATIN_ZERO)),
  );
}

/**
 * Convert any non-Latin digits in `s` (Persian or Arabic-Indic) to Latin
 * (0-9). Other characters are preserved verbatim.
 */
export function latinDigits(s: string): string {
  return s
    .replace(/[۰-۹]/g, (d) => String.fromCodePoint(LATIN_ZERO + (d.charCodeAt(0) - PERSIAN_ZERO)))
    .replace(/[٠-٩]/g, (d) =>
      String.fromCodePoint(LATIN_ZERO + (d.charCodeAt(0) - ARABIC_INDIC_ZERO)),
    );
}
