/** U+200C — zero-width non-joiner. Prevents medial joining in Arabic script. */
export const ZWNJ = '‌';

/** U+200D — zero-width joiner. Forces joining where it wouldn't apply. */
export const ZWJ = '‍';

/**
 * Insert a ZWNJ at the given UTF-16 code-unit index. Out-of-range indices
 * clamp to either end. Returns the new string; never mutates the input.
 */
export function insertZWNJ(text: string, at: number): string {
  const idx = Math.max(0, Math.min(at, text.length));
  return text.slice(0, idx) + ZWNJ + text.slice(idx);
}

/** Remove all ZWNJ characters. */
export function removeZWNJ(text: string): string {
  return text.replace(/‌/g, '');
}

/** True if the string contains at least one ZWNJ. */
export function containsZWNJ(text: string): boolean {
  return text.includes(ZWNJ);
}
