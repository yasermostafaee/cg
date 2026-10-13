import { describe, expect, it } from 'vitest';
import {
  followLetter,
  isKeyboardLanguage,
  keyboardDigits,
  languageOfLetter,
  writeEnteredDigits,
  type EnteredText,
} from '../src/keyboard-digits.js';

/** Text typed at the end of `value`: the last `length` characters. */
const typedAtEnd = (value: string, length: number): EnteredText => ({
  how: 'typed',
  start: value.length - length,
  end: value.length,
});

describe('keyboardDigits (TEXT-DIGITS-01)', () => {
  it('names the digits each keyboard language types, and nothing for unknown', () => {
    expect(keyboardDigits('persian')).toBe('persian');
    expect(keyboardDigits('arabic')).toBe('arabic-indic');
    expect(keyboardDigits('latin')).toBe('latin');
    expect(keyboardDigits('unknown')).toBeNull();
  });

  it('believes only the four answers (a shell reply is data)', () => {
    for (const ok of ['persian', 'arabic', 'latin', 'unknown'])
      expect(isKeyboardLanguage(ok)).toBe(true);
    for (const bad of ['fa', 'Persian', '', null, undefined, 42])
      expect(isKeyboardLanguage(bad)).toBe(false);
  });
});

describe('languageOfLetter (TEXT-DIGITS-01) — what one typed letter proves', () => {
  it('a letter only a Persian layout types proves Persian', () => {
    for (const letter of ['پ', 'چ', 'ژ', 'ک', 'گ', 'ی', 'ۀ'])
      expect(languageOfLetter(letter)).toBe('persian');
  });

  it('ى — the one letter only Arabic layouts type — proves Arabic', () => {
    expect(languageOfLetter('ى')).toBe('arabic');
  });

  it('a letter both layouts type proves neither — the language is never guessed', () => {
    // The Persian layout types ة and ي too, and Persian (Standard) ك (measured, design §0.3).
    for (const letter of ['ا', 'س', 'ع', 'ت', 'ة', 'ي', 'ك'])
      expect(languageOfLetter(letter)).toBeNull();
  });

  it('a Latin letter proves Latin; a digit, a mark, a key name or two characters prove nothing', () => {
    expect(languageOfLetter('q')).toBe('latin');
    expect(languageOfLetter('Q')).toBe('latin');
    expect(languageOfLetter('é')).toBe('latin');
    for (const key of ['1', '۱', '١', ' ', '.', 'Shift', 'Alt', 'Enter', 'ab', '']) {
      expect(languageOfLetter(key)).toBeNull();
    }
  });
});

describe('followLetter (TEXT-DIGITS-01) — the letters so far', () => {
  it('a proving letter replaces what came before', () => {
    expect(followLetter(null, 'ک')).toBe('persian');
    expect(followLetter('latin', 'ی')).toBe('persian');
    expect(followLetter('persian', 'q')).toBe('latin');
    expect(followLetter('persian', 'ى')).toBe('arabic');
  });

  it('a shared Arabic-script letter keeps a Persian or Arabic proof and forgets a Latin one', () => {
    expect(followLetter('persian', 'س')).toBe('persian');
    expect(followLetter('arabic', 'س')).toBe('arabic');
    expect(followLetter('latin', 'س')).toBeNull();
    expect(followLetter(null, 'س')).toBeNull();
  });

  it('a digit, a mark or a key name changes nothing (the control)', () => {
    for (const key of ['1', '۱', ' ', 'Shift', 'Backspace']) {
      expect(followLetter('persian', key)).toBe('persian');
      expect(followLetter(null, key)).toBeNull();
    }
  });
});

describe('writeEnteredDigits (TEXT-DIGITS-01)', () => {
  it('a digit set writes the WHOLE value, a paste included', () => {
    expect(
      writeEnteredDigits('اخبار ساعت 14', typedAtEnd('اخبار ساعت 14', 2), 'persian', null),
    ).toBe('اخبار ساعت ۱۴');
    expect(writeEnteredDigits('۱۲ and 12', { how: 'other', start: 0, end: 9 }, 'latin', null)).toBe(
      '12 and 12',
    );
    expect(writeEnteredDigits('12', typedAtEnd('12', 1), 'arabic-indic', 'persian')).toBe('١٢');
  });

  it('Keyboard: a typed digit follows the keyboard language — persian ۱, latin 1, unknown as sent', () => {
    expect(writeEnteredDigits('1', typedAtEnd('1', 1), 'as-typed', keyboardDigits('persian'))).toBe(
      '۱',
    );
    expect(writeEnteredDigits('1', typedAtEnd('1', 1), 'as-typed', keyboardDigits('arabic'))).toBe(
      '١',
    );
    expect(writeEnteredDigits('1', typedAtEnd('1', 1), 'as-typed', keyboardDigits('latin'))).toBe(
      '1',
    );
    expect(writeEnteredDigits('1', typedAtEnd('1', 1), 'as-typed', keyboardDigits('unknown'))).toBe(
      '1',
    );
  });

  it('Keyboard: only the TYPED text changes — a switch mid-typing, 12 then 34, reads 12۳۴', () => {
    const first = writeEnteredDigits(
      '12',
      typedAtEnd('12', 2),
      'as-typed',
      keyboardDigits('latin'),
    );
    expect(first).toBe('12');
    const second = writeEnteredDigits(
      `${first}34`,
      typedAtEnd(`${first}34`, 2),
      'as-typed',
      'persian',
    );
    expect(second).toBe('12۳۴');
  });

  it('Keyboard: a paste keeps its digits (the control: the same text typed is written)', () => {
    const pasted = '۱۲ and 12';
    expect(
      writeEnteredDigits(
        pasted,
        { how: 'other', start: 0, end: pasted.length },
        'as-typed',
        'persian',
      ),
    ).toBe(pasted);
    expect(
      writeEnteredDigits(
        pasted,
        { how: 'typed', start: 0, end: pasted.length },
        'as-typed',
        'persian',
      ),
    ).toBe('۱۲ and ۱۲');
  });

  it('Keyboard: a digit typed mid-text is written where it sits, and nothing else moves', () => {
    // `ساعت 1|0` → the caret after the `1` typed between `ساعت ` and `0`.
    const value = 'ساعت 10';
    const entered: EnteredText = { how: 'typed', start: 5, end: 6 };
    expect(writeEnteredDigits(value, entered, 'as-typed', 'persian')).toBe('ساعت ۱0');
  });

  it('one character for one, so a caret index holds', () => {
    const value = 'F-16 at 12:30';
    for (const keyboard of ['persian', 'arabic-indic', 'latin', null] as const) {
      expect(writeEnteredDigits(value, typedAtEnd(value, 5), 'as-typed', keyboard)).toHaveLength(
        value.length,
      );
    }
  });

  it('a number keeps its decimal-mark rule in a digit set', () => {
    expect(writeEnteredDigits('12.5', typedAtEnd('12.5', 1), 'persian', null, 'number')).toBe(
      '۱۲٫۵',
    );
  });
});
