import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils';

/**
 * sha256 hex digest of bytes or a UTF-8 string.
 *
 * Isomorphic: backed by `@noble/hashes` so the same code runs in Node,
 * the browser, and inside an exported broadcast template — no `node:crypto`.
 */
export function sha256Hex(input: Uint8Array | string): string {
  const bytes = typeof input === 'string' ? utf8ToBytes(input) : input;
  return bytesToHex(sha256(bytes));
}

export interface IntegrityFile {
  path: string;
  sha256: string;
  bytes: number;
}

/**
 * Merkle-style root over the integrity table. The canonical concatenation
 * sorts by path so the root is reproducible regardless of insertion order.
 *
 *   sort(paths).map(`${path}:${sha256}\n`).join() → sha256 → root
 */
export function computeIntegrityRoot(files: readonly IntegrityFile[]): string {
  const sorted = [...files].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const concat = sorted.map((f) => `${f.path}:${f.sha256}\n`).join('');
  return sha256Hex(concat);
}

/** Build the full integrity block for a file map. */
export function computeIntegrity(files: ReadonlyMap<string, Uint8Array>): {
  files: IntegrityFile[];
  root: string;
} {
  const entries: IntegrityFile[] = [];
  for (const [path, content] of files) {
    entries.push({
      path,
      sha256: sha256Hex(content),
      bytes: content.byteLength,
    });
  }
  entries.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return { files: entries, root: computeIntegrityRoot(entries) };
}
