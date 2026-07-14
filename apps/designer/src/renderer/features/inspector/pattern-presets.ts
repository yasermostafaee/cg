/**
 * D-059 — named validation presets over a text/multiline field's raw `pattern`
 * regex (the D-018 "Dynamic / Data" section). A preset is just a VETTED regex
 * SOURCE string written to the SAME `pattern` field, so the schema, the runtime,
 * and the export are untouched. The select shows `none` when there is no
 * pattern, the preset a stored pattern spells, or `custom` otherwise — the raw
 * regex box (today's UI) stays reachable through Custom, so every regex remains
 * authorable and an existing hand-written pattern loads unchanged (the
 * EasingEditor / sequence-presets Preset-with-custom-escape idiom). Pure module
 * so the mapping is unit-testable.
 *
 * Every preset is ANCHORED (`^…$`): the consumers test with
 * `new RegExp(src).test(value)`, which is a SUBSTRING match, so an unanchored
 * `[0-9]+` would happily accept "abc1abc". They also build the regex with NO
 * flags — hence explicit `\uXXXX` ranges rather than `\p{L}`, which needs the
 * `u` flag and would otherwise match a literal "p".
 *
 * Only FREE-TEXT shapes are covered: numeric range, constrained choice, and
 * length are already the `number` / `select` / `boolean` field types +
 * `minLength` / `maxLength`.
 */

/** No pattern at all — the field accepts any value (clears `pattern`). */
export const NO_PATTERN = 'none';
/** The escape hatch: the raw regex box, pre-filled with the current pattern. */
export const CUSTOM_PATTERN = 'custom';

// Persian (۰-۹) and Arabic-Indic (٠-٩) digits alongside ASCII — an operator on a
// Persian layout types ۱۲۳, and a digits-only field must accept them.
const DIGIT = '0-9\\u06F0-\\u06F9\\u0660-\\u0669';
// Latin letters plus the Arabic/Persian LETTER blocks: ء-ٟ (Arabic
// letters + harakat) and ٮ-ۓ (the Persian letters — پ چ ژ گ ک ی). Both
// ranges deliberately skip ٠-٩ (Arabic-Indic digits) and ٪-٭
// (punctuation), so "letters only" really means letters. ‌ is the ZWNJ that
// Persian compounds need (می‌رود).
const LETTER = 'A-Za-z\\u0621-\\u065F\\u066E-\\u06D3\\u200C';

export interface PatternPreset {
  /** Dropdown label. */
  label: string;
  /** The anchored regex SOURCE this preset writes to the field's `pattern`. */
  pattern: string;
  /** A value the pattern accepts — shown under the select so the shape is obvious. */
  example: string;
}

/** Insertion order is the dropdown order (between None and Custom). */
export const PATTERN_PRESETS: Record<string, PatternPreset> = {
  email: {
    label: 'Email',
    pattern: '^[^\\s@]+@[^\\s@]+\\.[^\\s@]{2,}$',
    example: 'news@channel.tv',
  },
  phone: {
    label: 'Phone',
    // An optional +, an optional opening paren, then digits and the separators a
    // phone number is written with (space, parens, dash). It must START and END
    // on a digit, so a string of bare separators is not a phone number.
    pattern: `^\\+?\\(?[${DIGIT}][${DIGIT} ()-]{3,18}[${DIGIT}]$`,
    example: '+98 21 1234 5678',
  },
  digits: { label: 'Digits only', pattern: `^[${DIGIT}]+$`, example: '۱۴۰۳' },
  letters: { label: 'Letters only', pattern: `^[${LETTER} ]+$`, example: 'مجری' },
  'upper-code': { label: 'Uppercase code', pattern: '^[A-Z0-9]{2,}$', example: 'IRN2' },
  time: { label: 'Time (HH:MM)', pattern: '^([01][0-9]|2[0-3]):[0-5][0-9]$', example: '21:30' },
  url: { label: 'URL', pattern: '^https?:\\/\\/[^\\s]+$', example: 'https://irib.ir' },
};

/** Dropdown order: no validation, the named shapes, then the raw-regex escape. */
export const PATTERN_PRESET_ORDER: readonly { key: string; label: string }[] = [
  { key: NO_PATTERN, label: 'None' },
  ...Object.entries(PATTERN_PRESETS).map(([key, preset]) => ({ key, label: preset.label })),
  { key: CUSTOM_PATTERN, label: 'Custom (advanced)' },
];

/**
 * The preset key a stored `pattern` spells — `none` for an absent/empty pattern,
 * the matching preset for a vetted regex, `custom` for anything else (an
 * existing hand-written pattern therefore loads as Custom, unchanged).
 */
export function patternPresetKeyFor(pattern: string | undefined): string {
  const src = pattern?.trim() ?? '';
  if (src === '') return NO_PATTERN;
  for (const [key, preset] of Object.entries(PATTERN_PRESETS)) {
    if (preset.pattern === src) return key;
  }
  return CUSTOM_PATTERN;
}

/**
 * The `pattern` a chosen preset key writes: `''` clears it (None), a preset
 * writes its regex. `null` means "write nothing" — Custom is a DISPLAY state
 * (it reveals the raw box over the current pattern), not a stored value, exactly
 * as Custom is a no-op in the EasingEditor / sequence presets.
 */
export function patternForPresetKey(key: string): string | null {
  if (key === NO_PATTERN) return '';
  return PATTERN_PRESETS[key]?.pattern ?? null;
}
