import { computeIntegrityRoot, sha256Hex } from './integrity.js';
import { unpack } from './unpack.js';

export interface VerifyResult {
  ok: boolean;
  errors: string[];
  /** Bypassed = no errors but no signing was requested/found. */
  signed: boolean;
}

export interface VerifyOptions {
  /**
   * If true, treat an unsigned package as a failure. Defaults false.
   * Signing is implemented in M3.1b — for now, this option is accepted
   * and reported, but the underlying signature check is a no-op.
   */
  requireSigned?: boolean;
}

/**
 * Integrity-only verification:
 *   - manifest.json and template.json parse and Zod-validate
 *   - every file listed in manifest.integrity.files is present, hashes
 *     to the declared sha256, and has the declared byte length
 *   - the Merkle root recomputes to the declared root
 *
 * Signing is reported but not verified yet (M3.1b).
 */
export async function verify(buf: Buffer, options: VerifyOptions = {}): Promise<VerifyResult> {
  const errors: string[] = [];

  let unpacked;
  try {
    unpacked = await unpack(buf);
  } catch (e) {
    return {
      ok: false,
      errors: [`Unpack failed: ${e instanceof Error ? e.message : String(e)}`],
      signed: false,
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

  if (options.requireSigned && !signed) {
    errors.push('Package is not signed but signing is required by deployment policy');
  }

  return { ok: errors.length === 0, errors, signed };
}
