import { describe, expect, it } from 'vitest';
import { chrome, cn, fontStack, tokens } from '../src/index.js';

describe('@cg/ui tokens', () => {
  it('exposes the shared chrome palette', () => {
    expect(chrome.background).toMatch(/^#[0-9a-f]{6}$/i);
    expect(tokens.chrome).toBe(chrome);
  });

  it('puts a shaping-capable Persian face first in the font stack', () => {
    expect(fontStack.startsWith('Vazirmatn')).toBe(true);
  });
});

describe('cn', () => {
  it('joins truthy class names and drops falsy ones', () => {
    expect(cn('a', false, null, undefined, 'b')).toBe('a b');
    expect(cn()).toBe('');
  });
});
