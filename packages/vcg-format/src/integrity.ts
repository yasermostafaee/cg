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

/**
 * Streamed sha256 hex over an async sequence of byte chunks — the SAME digest as
 * `sha256Hex` over the concatenation, but computed incrementally so a huge input
 * (a multi-GB video source, D-128 pre-convert dedupe) is never held in memory
 * all at once: only one chunk plus the ~200-byte hasher state live at a time.
 *
 * `onProgress` reports cumulative bytes hashed after each chunk (for a UI
 * affordance on a slow hash). Isomorphic: an async iterable of `Uint8Array`
 * works over a browser `File.stream()` reader and a Node stream alike.
 */
export async function sha256HexOfChunks(
  chunks: AsyncIterable<Uint8Array>,
  onProgress?: (bytesHashed: number) => void,
): Promise<string> {
  const hasher = sha256.create();
  let total = 0;
  for await (const chunk of chunks) {
    hasher.update(chunk);
    total += chunk.byteLength;
    onProgress?.(total);
  }
  return bytesToHex(hasher.digest());
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
