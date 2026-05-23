import { generateKeyPairSync } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { generateEd25519KeyPair, signEd25519, verifyEd25519 } from '../src/sign.js';

describe('generateEd25519KeyPair', () => {
  it('returns two PEM blocks', () => {
    const { privateKey, publicKey } = generateEd25519KeyPair();
    expect(privateKey).toMatch(/^-----BEGIN PRIVATE KEY-----/);
    expect(privateKey).toMatch(/-----END PRIVATE KEY-----\n?$/);
    expect(publicKey).toMatch(/^-----BEGIN PUBLIC KEY-----/);
    expect(publicKey).toMatch(/-----END PUBLIC KEY-----\n?$/);
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

  it('round-trips a Buffer payload', () => {
    const { privateKey, publicKey } = generateEd25519KeyPair();
    const data = Buffer.from('abc def');
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
    expect(verifyEd25519('hello', 'not-base64-but-also-not-thrown', publicKey)).toBe(false);
  });

  it('signs a real integrity root (64 hex chars)', () => {
    const { privateKey, publicKey } = generateEd25519KeyPair();
    const root = 'a'.repeat(64);
    const sig = signEd25519(root, privateKey);
    expect(sig).toMatch(/^[A-Za-z0-9+/=]+$/); // base64
    expect(verifyEd25519(root, sig, publicKey)).toBe(true);
  });

  it('rejects non-ed25519 keys at sign time', () => {
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    expect(() => signEd25519('hello', privateKey)).toThrow(/ed25519/);
  });
});
