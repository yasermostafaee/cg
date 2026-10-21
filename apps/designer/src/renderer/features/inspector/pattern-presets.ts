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

import { PATTERN_PRESETS, type PatternPreset } from '@cg/shared-schema';

/** No pattern at all — the field accepts any value (clears `pattern`). */
export const NO_PATTERN = 'none';
/** The escape hatch: the raw regex box, pre-filled with the current pattern. */
export const CUSTOM_PATTERN = 'custom';

/*
  `R-101` — the presets THEMSELVES live in `@cg/shared-schema` (`field-patterns.ts`) since CG Control
  names a refused value's form from them; re-exported here so every Designer consumer keeps its path.
*/
export { PATTERN_PRESETS, type PatternPreset };

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
