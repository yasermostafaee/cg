import { describe, expect, it } from 'vitest';
import {
  CUSTOM_PATTERN,
  NO_PATTERN,
  PATTERN_PRESET_ORDER,
  PATTERN_PRESETS,
  patternForPresetKey,
  patternPresetKeyFor,
} from '../src/renderer/features/inspector/pattern-presets.js';

/**
 * D-059 — the vetted regexes behind the named validation presets for text /
 * multiline dynamic fields, and the stored-pattern → preset-key round trip that
 * drives the select (the sequence-presets / EasingEditor idiom).
 */

describe('field validation presets (D-059)', () => {
  it('every preset regex compiles, is anchored, and accepts its own example', () => {
    for (const [key, preset] of Object.entries(PATTERN_PRESETS)) {
      expect(preset.pattern.startsWith('^'), `${key} starts anchored`).toBe(true);
      expect(preset.pattern.endsWith('$'), `${key} ends anchored`).toBe(true);
      const re = new RegExp(preset.pattern); // no flags — as the preview form / runtime build it
      expect(re.test(preset.example), `${key} accepts ${preset.example}`).toBe(true);
    }
  });

  it('the anchors reject a substring match (the unanchored-regex gotcha)', () => {
    // Unanchored, `new RegExp('[0-9]+').test('abc1abc')` is true — the whole
    // point of ^…$ is that the WHOLE value must have the shape.
    expect(new RegExp(PATTERN_PRESETS['digits']!.pattern).test('abc1abc')).toBe(false);
    expect(new RegExp(PATTERN_PRESETS['time']!.pattern).test('at 21:30 sharp')).toBe(false);
    expect(new RegExp(PATTERN_PRESETS['upper-code']!.pattern).test('go IRN2 go')).toBe(false);
  });

  it('each preset accepts its shape and rejects the obvious near-miss', () => {
    const accepts = (key: string, v: string): boolean =>
      new RegExp(PATTERN_PRESETS[key]!.pattern).test(v);

    expect(accepts('email', 'anchor@irib.ir')).toBe(true);
    expect(accepts('email', 'anchor@irib')).toBe(false); // no TLD
    expect(accepts('email', 'two words@irib.ir')).toBe(false);

    expect(accepts('phone', '021-1234567')).toBe(true);
    expect(accepts('phone', '(021) 123 4567')).toBe(true);
    expect(accepts('phone', '021-CALL-NOW')).toBe(false);
    expect(accepts('phone', '--- --- ---')).toBe(false); // separators alone are not a number

    expect(accepts('digits', '1403')).toBe(true);
    expect(accepts('digits', '1403/06/22')).toBe(false);

    expect(accepts('letters', 'Anchor Name')).toBe(true);
    expect(accepts('letters', 'Studio 2')).toBe(false); // a digit is not a letter

    expect(accepts('upper-code', 'IRIB3')).toBe(true);
    expect(accepts('upper-code', 'Irib3')).toBe(false); // lowercase

    expect(accepts('time', '00:00')).toBe(true);
    expect(accepts('time', '23:59')).toBe(true);
    expect(accepts('time', '24:00')).toBe(false); // out of range
    expect(accepts('time', '9:30')).toBe(false); // not HH:MM

    expect(accepts('url', 'https://irib.ir/live')).toBe(true);
    expect(accepts('url', 'irib.ir')).toBe(false); // no scheme
  });

  it('Persian digits and letters are accepted (RTL is a first-class value shape)', () => {
    const digits = new RegExp(PATTERN_PRESETS['digits']!.pattern);
    const letters = new RegExp(PATTERN_PRESETS['letters']!.pattern);
    expect(digits.test('۱۴۰۳')).toBe(true); // Persian digits
    expect(digits.test('١٤٠٣')).toBe(true); // Arabic-Indic digits
    expect(letters.test('گزارش خبری')).toBe(true); // Persian letters + space
    expect(letters.test('می‌رود')).toBe(true); // ZWNJ compound
    expect(letters.test('گزارش ۲')).toBe(false); // a Persian DIGIT is still not a letter
  });

  it('a stored pattern round-trips to the preset that wrote it', () => {
    for (const [key, preset] of Object.entries(PATTERN_PRESETS)) {
      expect(patternPresetKeyFor(preset.pattern)).toBe(key);
      expect(patternForPresetKey(key)).toBe(preset.pattern);
    }
  });

  it('an empty pattern is None; an arbitrary regex is Custom (existing patterns load unchanged)', () => {
    expect(patternPresetKeyFor(undefined)).toBe(NO_PATTERN);
    expect(patternPresetKeyFor('')).toBe(NO_PATTERN);
    expect(patternPresetKeyFor('   ')).toBe(NO_PATTERN);
    expect(patternPresetKeyFor('^[A-Z]{3}-[0-9]{4}$')).toBe(CUSTOM_PATTERN); // hand-written
    expect(patternPresetKeyFor('[0-9]+')).toBe(CUSTOM_PATTERN); // unanchored → not our digits preset
  });

  it('None clears the pattern; Custom writes nothing (it only reveals the raw box)', () => {
    expect(patternForPresetKey(NO_PATTERN)).toBe('');
    expect(patternForPresetKey(CUSTOM_PATTERN)).toBeNull();
    expect(patternForPresetKey('not-a-preset')).toBeNull();
  });

  it('the dropdown order covers None, every preset exactly once, and the Custom escape', () => {
    const keys = PATTERN_PRESET_ORDER.map((p) => p.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys[0]).toBe(NO_PATTERN);
    expect(keys[keys.length - 1]).toBe(CUSTOM_PATTERN);
    for (const key of Object.keys(PATTERN_PRESETS)) expect(keys).toContain(key);
  });
});
