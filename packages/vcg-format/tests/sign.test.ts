import { describe, expect, it } from 'vitest';
import { generateEd25519KeyPair, signEd25519, verifyEd25519 } from '../src/sign.js';

const enc = (s: string): Uint8Array => new TextEncoder().encode(s);

describe('generateEd25519KeyPair', () => {
  it('returns raw 32-byte keys as hex', () => {
    const { privateKey, publicKey } = generateEd25519KeyPair();
    expect(privateKey).toMatch(/^[0-9a-f]{64}$/);
    expect(publicKey).toMatch(/^[0-9a-f]{64}$/);
  });

  it('generates distinct key pairs on each call', () => {
    const a = generateEd25519KeyPair();
    const b = generateEd25519KeyPair();
    expect(a.privateKey).not.toBe(b.privateKey);
    expect(a.publicKey).not.toBe(b.publicKey);
  });
});

describe('signEd25519 / verifyEd25519', () => {
  it('round-trips a sign + verify of a string', () => {
    const { privateKey, publicKey } = generateEd25519KeyPair();
    const sig = signEd25519('hello', privateKey);
    expect(verifyEd25519('hello', sig, publicKey)).toBe(true);
  });

  it('round-trips a Uint8Array payload', () => {
    const { privateKey, publicKey } = generateEd25519KeyPair();
    const data = enc('abc def');
    const sig = signEd25519(data, privateKey);
    expect(verifyEd25519(data, sig, publicKey)).toBe(true);
  });

  it('fails verify when the data is tampered', () => {
    const { privateKey, publicKey } = generateEd25519KeyPair();
    const sig = signEd25519('hello', privateKey);
    expect(verifyEd25519('hello!', sig, publicKey)).toBe(false);
  });

  it('fails verify with the wrong public key', () => {
    const a = generateEd25519KeyPair();
    const b = generateEd25519KeyPair();
    const sig = signEd25519('hello', a.privateKey);
    expect(verifyEd25519('hello', sig, b.publicKey)).toBe(false);
  });

  it('fails verify on a malformed signature', () => {
    const { publicKey } = generateEd25519KeyPair();
    expect(verifyEd25519('hello', 'not-hex-but-also-not-thrown', publicKey)).toBe(false);
  });

  it('signs a real integrity root (128 hex chars signature)', () => {
    const { privateKey, publicKey } = generateEd25519KeyPair();
    const root = 'a'.repeat(64);
    const sig = signEd25519(root, privateKey);
    expect(sig).toMatch(/^[0-9a-f]{128}$/); // 64-byte signature, hex
    expect(verifyEd25519(root, sig, publicKey)).toBe(true);
  });

  it('throws when the private key is the wrong length', () => {
    // '00' is valid hex but decodes to a single byte — not a 32-byte key.
    expect(() => signEd25519('hello', '00')).toThrow();
  });
});
