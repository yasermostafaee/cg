import { describe, expect, it } from 'vitest';
import { comboKey } from '../src/renderer/keyboard.js';

// comboKey only reads ctrlKey / metaKey / code, so a plain stand-in is faithful — and it
// makes the point explicit that the printable `key` is irrelevant to the match.
const ev = (init: Partial<KeyboardEvent>): KeyboardEvent =>
  ({ ctrlKey: false, metaKey: false, ...init }) as unknown as KeyboardEvent;

describe('comboKey (D-077) — match the physical key, not the character', () => {
  it('matches Ctrl + the physical KeyC regardless of the printable character', () => {
    // US layout: the `c` key reports key 'c'
    expect(comboKey(ev({ ctrlKey: true, code: 'KeyC', key: 'c' }), 'KeyC')).toBe(true);
    // Persian layout: the SAME physical key reports key 'ع', but code stays 'KeyC'
    expect(comboKey(ev({ ctrlKey: true, code: 'KeyC', key: 'ع' }), 'KeyC')).toBe(true);
  });

  it('matches Cmd (metaKey) too, on a non-Latin key value', () => {
    expect(comboKey(ev({ metaKey: true, code: 'KeyV', key: 'ر' }), 'KeyV')).toBe(true);
  });

  it('does not match a different physical key, or a missing Ctrl/Cmd modifier', () => {
    expect(comboKey(ev({ ctrlKey: true, code: 'KeyX', key: 'x' }), 'KeyC')).toBe(false);
    expect(comboKey(ev({ code: 'KeyC', key: 'c' }), 'KeyC')).toBe(false); // no ctrl/meta
  });
});
