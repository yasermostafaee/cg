/**
 * Join class names, dropping falsy entries — the tiny `clsx` we need for
 * combining a base vanilla-extract class with conditional modifier classes:
 *
 *   className={cx(s.cell, isSelected && s.selected)}
 */
export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}
