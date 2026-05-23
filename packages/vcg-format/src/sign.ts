import {
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  sign as nodeSign,
  verify as nodeVerify,
  type KeyObject,
} from 'node:crypto';

/**
 * Ed25519 signing for the .vcg manifest's `integrity.root`.
 *
 * Spec (Phase 4 §7 step 6): "Ed25519 sign integrity.root". The signature
 * covers the sha256-hex root string — equivalent to signing the entire
 * archive's contents since the root is itself the Merkle root over per-file
 * hashes.
 *
 * Keys are accepted as PEM strings (SPKI for public, PKCS#8 for private)
 * or as Node `KeyObject`s. The signature wire format is base64.
 */

export type Ed25519KeyInput = string | KeyObject;

/**
 * Sign data with an Ed25519 private key. Returns a base64-encoded signature.
 */
export function signEd25519(data: Buffer | string, privateKey: Ed25519KeyInput): string {
  const key = asPrivateKey(privateKey);
  if (key.asymmetricKeyType !== 'ed25519') {
    throw new Error(`Expected ed25519 private key, got ${String(key.asymmetricKeyType)}`);
  }
  const buf = typeof data === 'string' ? Buffer.from(data, 'utf-8') : data;
  // For Ed25519, the algorithm parameter must be null (Node convention).
  return nodeSign(null, buf, key).toString('base64');
}

/**
 * Verify an Ed25519 signature against `data` using the given public key.
 * Returns true iff the signature is valid. Never throws on bad signatures —
 * returns false instead.
 */
export function verifyEd25519(
  data: Buffer | string,
  signatureBase64: string,
  publicKey: Ed25519KeyInput,
): boolean {
  let key: KeyObject;
  try {
    key = asPublicKey(publicKey);
  } catch {
    return false;
  }
  if (key.asymmetricKeyType !== 'ed25519') return false;
  const buf = typeof data === 'string' ? Buffer.from(data, 'utf-8') : data;
  let sigBytes: Buffer;
  try {
    sigBytes = Buffer.from(signatureBase64, 'base64');
  } catch {
    return false;
  }
  try {
    return nodeVerify(null, buf, key, sigBytes);
  } catch {
    return false;
  }
}

/**
 * Generate a fresh Ed25519 key pair. Returns PEM strings — convenient for
 * tests, CLI tooling, and one-time key provisioning. Production keys should
 * be generated out-of-band and stored in a secrets manager.
 */
export function generateEd25519KeyPair(): {
  privateKey: string;
  publicKey: string;
} {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519', {
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });
  return { privateKey, publicKey };
}

function asPrivateKey(input: Ed25519KeyInput): KeyObject {
  if (typeof input === 'string') return createPrivateKey({ key: input, format: 'pem' });
  return input;
}

function asPublicKey(input: Ed25519KeyInput): KeyObject {
  if (typeof input === 'string') return createPublicKey({ key: input, format: 'pem' });
  return input;
}
