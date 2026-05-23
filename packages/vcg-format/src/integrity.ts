import { createHash } from 'node:crypto';

/** sha256 hex digest of a Buffer or string. */
export function sha256Hex(input: Buffer | string): string {
  return createHash('sha256').update(input).digest('hex');
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
export function computeIntegrity(files: ReadonlyMap<string, Buffer>): {
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
