import { describe, expect, it } from 'vitest';
import { computeIntegrity, computeIntegrityRoot, sha256Hex } from '../src/integrity.js';

const enc = (s: string): Uint8Array => new TextEncoder().encode(s);

describe('sha256Hex', () => {
  it('matches a known empty-string digest', () => {
    expect(sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });
  it('matches a known string digest', () => {
    expect(sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });
  it('accepts a Uint8Array', () => {
    expect(sha256Hex(enc('abc'))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });
});

describe('computeIntegrityRoot', () => {
  it('is stable regardless of input order', () => {
    const files = [
      { path: 'a', sha256: 'a'.repeat(64), bytes: 1 },
      { path: 'b', sha256: 'b'.repeat(64), bytes: 1 },
      { path: 'c', sha256: 'c'.repeat(64), bytes: 1 },
    ];
    const r1 = computeIntegrityRoot(files);
    const r2 = computeIntegrityRoot([...files].reverse());
    expect(r1).toBe(r2);
  });
  it('changes when any sha256 changes', () => {
    const baseline = [
      { path: 'a', sha256: 'a'.repeat(64), bytes: 1 },
      { path: 'b', sha256: 'b'.repeat(64), bytes: 1 },
    ];
    const tampered = [
      { path: 'a', sha256: 'a'.repeat(64), bytes: 1 },
      { path: 'b', sha256: 'd'.repeat(64), bytes: 1 },
    ];
    expect(computeIntegrityRoot(baseline)).not.toBe(computeIntegrityRoot(tampered));
  });
});

describe('computeIntegrity', () => {
  it('emits sorted, fully-hashed entries', () => {
    const files = new Map<string, Uint8Array>([
      ['z.txt', enc('zz')],
      ['a.txt', enc('aa')],
      ['m.txt', enc('mmm')],
    ]);
    const { files: out, root } = computeIntegrity(files);
    expect(out.map((f) => f.path)).toEqual(['a.txt', 'm.txt', 'z.txt']);
    expect(out[0]?.bytes).toBe(2);
    expect(out[1]?.bytes).toBe(3);
    expect(root).toMatch(/^[0-9a-f]{64}$/);
  });
});
