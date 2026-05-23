import { describe, expect, it } from 'vitest';
import { truncate } from '../src/truncate.js';

describe('truncate', () => {
  it('no-op when shorter than max', () => {
    expect(truncate('abc', 10)).toBe('abc');
  });
  it('no-op when exactly max', () => {
    expect(truncate('abcdef', 6)).toBe('abcdef');
  });
  it('truncates with default ellipsis', () => {
    expect(truncate('abcdefghij', 5)).toBe('abcd…');
  });
  it('truncates with custom ellipsis', () => {
    expect(truncate('abcdefghij', 5, '...')).toBe('ab...');
  });
  it('suppresses ellipsis when max <= ellipsis length', () => {
    // Invariant: result.length <= max. With ellipsis '…' (1 unit) and max=1
    // there's no room, so we keep the first character verbatim.
    expect(truncate('abcdef', 1)).toBe('a');
  });
  it('returns empty for max=0', () => {
    expect(truncate('abc', 0)).toBe('');
  });
  it('returns empty for negative max', () => {
    expect(truncate('abc', -1)).toBe('');
  });
  it('works on Persian text (code-unit boundary)', () => {
    // Codepoints, not graphemes — accept that compound clusters may split.
    expect(truncate('خبر فوری', 4)).toBe('خبر…');
  });
});
