import { computeIntegrityRoot, sha256Hex } from './integrity.js';
import { unpack } from './unpack.js';
import { verifyEd25519, type Ed25519KeyInput } from './sign.js';

export interface VerifyResult {
  ok: boolean;
  errors: string[];
  /** True iff the manifest carried a signing block. */
  signed: boolean;
  /**
   * True iff the signature was checked and passed. False when unsigned or
   * when no trusted key was provided (signature present but unchecked).
   * Unsigned + `requireSigned: false` is `ok: true` with `signatureVerified:
   * false` — the caller can distinguish "trusted" from "valid integrity".
   */
  signatureVerified: boolean;
}

export interface VerifyOptions {
  /**
   * If true, treat an unsigned package as a failure. Defaults false.
   */
  requireSigned?: boolean;
  /**
   * Trusted public keys by `publicKeyId`. When the manifest's signing block
   * references a known id, the signature is verified against that key. If
   * the manifest references an *unknown* id, that's an error.
   *
   * Keys are raw Ed25519 public keys as hex strings (or `Uint8Array`).
   */
  trustedPublicKeys?: Readonly<Record<string, Ed25519KeyInput>>;
}

/**
 * Full verification:
 *   - manifest.json and template.json parse and Zod-validate
 *   - every file listed in manifest.integrity.files is present, hashes
 *     to the declared sha256, and has the declared byte length
 *   - the Merkle root recomputes to the declared root
 *   - if manifest.signing is present and trustedPublicKeys are provided,
 *     the Ed25519 signature over `integrity.root` is checked
 *
 * Failure modes split between "broken bytes" (any integrity mismatch),
 * "broken trust" (signed by an unknown key, or signature doesn't verify),
 * and "policy" (requireSigned with no signing block).
 */
export async function verify(buf: Uint8Array, options: VerifyOptions = {}): Promise<VerifyResult> {
  const errors: string[] = [];

  let unpacked;
  try {
    unpacked = await unpack(buf);
  } catch (e) {
    return {
      ok: false,
      errors: [`Unpack failed: ${e instanceof Error ? e.message : String(e)}`],
      signed: false,
      signatureVerified: false,
    };
  }

  const { manifest, files } = unpacked;
  const signed = Boolean(manifest.signing);

  for (const file of manifest.integrity.files) {
    const content = files.get(file.path);
    if (!content) {
      errors.push(`Missing file declared in integrity: ${file.path}`);
      continue;
    }
    const actualHash = sha256Hex(content);
    if (actualHash !== file.sha256) {
      errors.push(`Hash mismatch for ${file.path}: expected ${file.sha256}, got ${actualHash}`);
    }
    if (content.byteLength !== file.bytes) {
      errors.push(
        `Byte length mismatch for ${file.path}: expected ${file.bytes}, got ${content.byteLength}`,
      );
    }
  }

  const recomputedRoot = computeIntegrityRoot(manifest.integrity.files);
  if (recomputedRoot !== manifest.integrity.root) {
    errors.push(
      `Integrity root mismatch: expected ${manifest.integrity.root}, got ${recomputedRoot}`,
    );
  }

  let signatureVerified = false;
  if (manifest.signing) {
    const { algorithm, publicKeyId, signature } = manifest.signing;
    if (algorithm !== 'ed25519') {
      errors.push(`Unsupported signing algorithm: ${algorithm}`);
    } else if (options.trustedPublicKeys) {
      const trustedKey = options.trustedPublicKeys[publicKeyId];
      if (!trustedKey) {
        errors.push(`Signature uses unknown publicKeyId: ${publicKeyId}`);
      } else if (!verifyEd25519(manifest.integrity.root, signature, trustedKey)) {
        errors.push(`Ed25519 signature does not verify for publicKeyId: ${publicKeyId}`);
      } else {
        signatureVerified = true;
      }
    }
    // No trustedPublicKeys provided → signature is *present but unchecked*.
    // ok stays true; the result reports `signed: true, signatureVerified: false`.
  }

  if (options.requireSigned && !signed) {
    errors.push('Package is not signed but signing is required by deployment policy');
  }

  return { ok: errors.length === 0, errors, signed, signatureVerified };
}
