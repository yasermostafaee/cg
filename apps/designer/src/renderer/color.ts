/**
 * Normalize a typed hex colour for the color inputs (timeline track row + inspector
 * ColorField), so the two behave identically. Repeats the typed body to 6 chars for
 * shorthand (1 → ×6, 2 → ×3, 3 → ×2); 6 / 8 are used as-is. Returns "#RRGGBB" /
 * "#RRGGBBAA" (uppercase) or null when invalid (empty, non-hex, or length 4/5/7/>8).
 */
export function normalizeHexColor(raw: string): string | null {
  const body = raw.trim().replace(/^#/, '');
  if (body.length === 0 || !/^[0-9a-fA-F]+$/.test(body)) return null;
  const up = body.toUpperCase();
  let full: string;
  switch (up.length) {
    case 1:
      full = up.repeat(6); // F -> FFFFFF
      break;
    case 2:
      full = up.repeat(3); // F0 -> F0F0F0
      break;
    case 3:
      full = up.repeat(2); // FE2 -> FE2FE2
      break;
    case 6:
      full = up; // RRGGBB
      break;
    case 8:
      full = up; // RRGGBBAA (alpha)
      break;
    default:
      return null; // 4, 5, 7, >8 -> invalid
  }
  return `#${full}`;
}
