/**
 * D-059 — the named validation presets a text/multiline field's `pattern` can spell. Each is a VETTED,
 * ANCHORED (`^…$`) regex SOURCE written to the field's ordinary `pattern`: the schema, the runtime and
 * the export know nothing of presets. The consumers test with `new RegExp(src).test(value)` (a
 * SUBSTRING match, hence the anchors) and with NO flags (hence explicit `\uXXXX` ranges rather than
 * `\p{L}`, which needs `u`).
 *
 * `R-101` — moved here from the Designer's `pattern-presets.ts` (which re-exports it) so CG Control
 * can NAME the form a refused value should take — "Time (HH:MM), e.g. 21:30" — in the operator's
 * words rather than print the regex (golden rule 11). Data only: the Designer's select keeps its
 * None / Custom states and the mapping functions.
 */

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
  /** Dropdown label — and the form's name in a refusal. */
  label: string;
  /** The anchored regex SOURCE this preset writes to the field's `pattern`. */
  pattern: string;
  /** A value the pattern accepts — shown under the select, and in a refusal. */
  example: string;
}

/** Insertion order is the Designer's dropdown order (between None and Custom). */
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
  // `DELTA-RUN-NEXT-VERSION-01-C` §2 — a countdown's target field: the seconds are optional, as
  // the countdown's own time of day takes them.
  'time-seconds': {
    label: 'Time (HH:MM[:SS])',
    pattern: '^([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$',
    example: '21:30:15',
  },
  // An ISO date and time with its offset — what the date and time control stores, in any calendar.
  datetime: {
    label: 'Date & time (ISO)',
    pattern:
      '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}(:[0-9]{2}(\\.[0-9]{1,3})?)?(Z|[+-][0-9]{2}:[0-9]{2})$',
    example: '2026-10-15T21:30:00+03:30',
  },
  url: { label: 'URL', pattern: '^https?:\\/\\/[^\\s]+$', example: 'https://irib.ir' },
};

/** `R-101` — the preset a stored `pattern` spells, or `undefined` for a hand-written one. */
export function patternPresetOf(pattern: string | undefined): PatternPreset | undefined {
  const src = pattern?.trim() ?? '';
  return Object.values(PATTERN_PRESETS).find((p) => p.pattern === src);
}
