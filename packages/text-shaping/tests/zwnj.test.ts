import { describe, expect, it } from 'vitest';
import { ZWJ, ZWNJ, containsZWNJ, insertZWNJ, removeZWNJ } from '../src/zwnj.js';

describe('ZWNJ constants', () => {
  it('exports U+200C', () => {
    expect(ZWNJ.charCodeAt(0)).toBe(0x200c);
  });
  it('exports U+200D', () => {
    expect(ZWJ.charCodeAt(0)).toBe(0x200d);
  });
});

describe('insertZWNJ', () => {
  it('inserts at the middle', () => {
    expect(insertZWNJ('میخواهم', 2)).toBe('می‌خواهم');
  });
  it('inserts at start (clamps lower bound)', () => {
    expect(insertZWNJ('abc', -5)).toBe(`${ZWNJ}abc`);
  });
  it('inserts at end (clamps upper bound)', () => {
    expect(insertZWNJ('abc', 99)).toBe(`abc${ZWNJ}`);
  });
  it('does not mutate input', () => {
    const orig = 'abc';
    insertZWNJ(orig, 1);
    expect(orig).toBe('abc');
  });
});

describe('removeZWNJ / containsZWNJ', () => {
  it('removes all ZWNJ instances', () => {
    expect(removeZWNJ('می‌خواهم نمی‌توانم')).toBe('میخواهم نمیتوانم');
  });
  it('no-op when no ZWNJ', () => {
    expect(removeZWNJ('abc')).toBe('abc');
  });
  it('containsZWNJ detects presence', () => {
    expect(containsZWNJ('می‌خواهم')).toBe(true);
    expect(containsZWNJ('میخواهم')).toBe(false);
  });
});
