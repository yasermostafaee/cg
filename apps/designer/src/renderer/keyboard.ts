/**
 * True when a keyboard event is a Ctrl/Cmd + <physical key> combo, matched by the
 * layout-independent `code` (e.g. 'KeyC', 'KeyV', 'Digit0') — NOT the printable
 * `key`, so the shortcut fires the same on non-Latin keyboard layouts (e.g. a
 * Persian layout, where the `c` key reports `key: 'ع'` but still `code: 'KeyC'`).
 *
 * Convention (see CLAUDE.md): letter/digit shortcut handlers MUST match on `e.code`
 * via this helper; only keys whose `key` value is already layout-stable (Delete,
 * Backspace, Arrow*, Enter, Escape) should match on `e.key`.
 */
export function comboKey(e: KeyboardEvent, code: string): boolean {
  return (e.ctrlKey || e.metaKey) && e.code === code;
}
