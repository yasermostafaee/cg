/**
 * Truncate `s` to at most `max` UTF-16 code units, appending `ellipsis` if
 * truncation occurred. When `max` is smaller than `ellipsis.length`, the
 * ellipsis is suppressed and only the first `max` characters are returned —
 * the invariant is "result.length <= max".
 *
 * Code-unit based, not grapheme-cluster based — Persian text with combining
 * diacritics or ZWNJ-joined compounds may still split at inconvenient
 * boundaries. Adequate for v1; M9 may refine to graphemes via
 * `Intl.Segmenter`.
 */
export function truncate(s: string, max: number, ellipsis = '…'): string {
  if (max < 0) return '';
  if (s.length <= max) return s;
  if (max <= ellipsis.length) return s.slice(0, max);
  return s.slice(0, max - ellipsis.length) + ellipsis;
}
