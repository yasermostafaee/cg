import { ed25519 } from '@noble/curves/ed25519';
import { bytesToHex, hexToBytes, utf8ToBytes } from '@noble/hashes/utils';

/**
 * Ed25519 signing for the .vcg manifest's `integrity.root`.
 *
 * Spec (Phase 4 §7 step 6): "Ed25519 sign integrity.root". The signature
 * covers the sha256-hex root string — equivalent to signing the entire
 * archive's contents since the root is itself the Merkle root over per-file
 * hashes.
 *
 * Isomorphic: backed by `@noble/curves` so signing/verification work in
 * Node and the browser alike. Keys and signatures are exchanged as raw
 * hex strings (or `Uint8Array`) — no PEM, no `node:crypto`. A private key
 * is 32 bytes (64 hex chars); a public key is 32 bytes; a signature is
 * 64 bytes (128 hex chars).
 */

export type Ed25519KeyInput = string | Uint8Array;

function asBytes(key: Ed25519KeyInput): Uint8Array {
  return typeof key === 'string' ? hexToBytes(key) : key;
}

function asMessage(data: Uint8Array | string): Uint8Array {
  return typeof data === 'string' ? utf8ToBytes(data) : data;
}

/**
 * Sign data with an Ed25519 private key. Returns a hex-encoded signature.
 */
export function signEd25519(data: Uint8Array | string, privateKey: Ed25519KeyInput): string {
  const sig = ed25519.sign(asMessage(data), asBytes(privateKey));
  return bytesToHex(sig);
}

/**
 * Verify an Ed25519 signature against `data` using the given public key.
 * Returns true iff the signature is valid. Never throws on bad input —
 * returns false instead.
 */
export function verifyEd25519(
  data: Uint8Array | string,
  signatureHex: string,
  publicKey: Ed25519KeyInput,
): boolean {
  try {
    return ed25519.verify(hexToBytes(signatureHex), asMessage(data), asBytes(publicKey));
  } catch {
    return false;
  }
}

/**
 * Generate a fresh Ed25519 key pair. Returns hex strings — convenient for
 * tests, CLI tooling, and one-time key provisioning. Production keys should
 * be generated out-of-band and stored in a secrets manager.
 */
export function generateEd25519KeyPair(): {
  privateKey: string;
  publicKey: string;
} {
  const priv = ed25519.utils.randomPrivateKey();
  const pub = ed25519.getPublicKey(priv);
  return { privateKey: bytesToHex(priv), publicKey: bytesToHex(pub) };
}
