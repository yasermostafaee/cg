import { describe, expect, it } from 'vitest';
import { escape, quote } from '../src/amcp/escape.js';

describe('escape', () => {
  it('passes plain ASCII through unchanged', () => {
    expect(escape('hello')).toBe('hello');
  });

  it('escapes a literal backslash', () => {
    expect(escape('a\\b')).toBe('a\\\\b');
  });

  it('escapes a literal quote', () => {
    expect(escape('a"b')).toBe('a\\"b');
  });

  it('escapes both quote and backslash in one pass', () => {
    expect(escape('\\"')).toBe('\\\\\\"');
  });

  it('replaces \\r with a space', () => {
    expect(escape('a\rb')).toBe('a b');
  });

  it('replaces \\n with a space', () => {
    expect(escape('a\nb')).toBe('a b');
  });

  it('preserves UTF-8 / Persian text', () => {
    expect(escape('خبر فوری')).toBe('خبر فوری');
  });

  it('handles an empty string', () => {
    expect(escape('')).toBe('');
  });
});

describe('quote', () => {
  it('wraps a plain string in double quotes', () => {
    expect(quote('hello')).toBe('"hello"');
  });

  it('escapes inner quotes inside the wrapper', () => {
    expect(quote('say "hi"')).toBe('"say \\"hi\\""');
  });

  it('escapes inner backslashes inside the wrapper', () => {
    expect(quote('C:\\Path')).toBe('"C:\\\\Path"');
  });

  it('preserves Persian content inside the wrapper', () => {
    expect(quote('{"title":"خبر فوری"}')).toBe('"{\\"title\\":\\"خبر فوری\\"}"');
  });

  it('quotes an empty string as a pair of quotes', () => {
    expect(quote('')).toBe('""');
  });
});
