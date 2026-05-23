import { describe, expect, it } from 'vitest';
import { containsLtr, containsRtl, detectDirection } from '../src/direction.js';

describe('detectDirection', () => {
  it('returns neutral for empty', () => {
    expect(detectDirection('')).toBe('neutral');
  });
  it('returns neutral for digits/punctuation only', () => {
    expect(detectDirection('1234')).toBe('neutral');
    expect(detectDirection('   ?!')).toBe('neutral');
  });
  it('detects pure Latin as ltr', () => {
    expect(detectDirection('Hello, world')).toBe('ltr');
  });
  it('detects pure Persian as rtl', () => {
    expect(detectDirection('خبر فوری')).toBe('rtl');
  });
  it('detects pure Arabic as rtl', () => {
    expect(detectDirection('مرحبا بالعالم')).toBe('rtl');
  });
  it('detects pure Hebrew as rtl', () => {
    expect(detectDirection('שלום עולם')).toBe('rtl');
  });
  it('detects mixed Persian+English as mixed', () => {
    expect(detectDirection('OpenAI نسخه جدید منتشر کرد')).toBe('mixed');
  });
  it('detects Cyrillic as ltr', () => {
    expect(detectDirection('Привет мир')).toBe('ltr');
  });
  it('treats emoji as neutral', () => {
    expect(detectDirection('🌞🚀💻')).toBe('neutral');
  });
});

describe('containsRtl / containsLtr', () => {
  it('flags Persian as RTL-bearing', () => {
    expect(containsRtl('hello خبر')).toBe(true);
    expect(containsLtr('hello خبر')).toBe(true);
  });
  it('false for digit-only strings', () => {
    expect(containsRtl('1234')).toBe(false);
    expect(containsLtr('1234')).toBe(false);
  });
  it('flags Arabic-Indic digits as not strong-RTL on their own', () => {
    // Arabic-Indic *digits* (U+0660..0669) sit in the Arabic block but are
    // weak in BiDi. Our heuristic counts the Arabic block as RTL strong,
    // so we *do* include them — document the behavior here.
    expect(containsRtl('٠١٢٣')).toBe(true);
  });
});
