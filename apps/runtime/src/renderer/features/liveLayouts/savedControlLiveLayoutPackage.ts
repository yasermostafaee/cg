import { sha256Hex } from '@cg/vcg-format';
import { base64ToBytes } from '../library/packageBytes.js';

/** Editing and file export both use the exact archive verified at import. */
export async function readSavedControlLiveLayoutPackage(
  sha256: string | undefined,
): Promise<{ bytes: Uint8Array<ArrayBuffer>; sha256: string }> {
  if (sha256 === undefined) throw new Error('The editable layout package is unavailable.');
  const source = await window.cg.templates.source({ sha256 });
  if (!source.ok) throw new Error('CG Bridge no longer has this layout package.');
  const bytes = base64ToBytes(source.base64);
  if (sha256Hex(bytes) !== sha256)
    throw new Error('The saved layout package could not be verified.');
  return { bytes, sha256 };
}
