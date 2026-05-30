import JSZip from 'jszip';

/**
 * Fixed timestamp embedded in every zip entry. JSZip writes a per-file
 * date; pinning it to a constant is necessary (but not sufficient) for
 * byte-identical re-packs.
 */
const FIXED_DATE = new Date('2024-01-01T00:00:00.000Z');

/**
 * File extensions that are already compressed at the file-format level —
 * deflating them again wastes bytes for no compression gain. We STORE those.
 */
const ALREADY_COMPRESSED = /\.(png|jpe?g|webp|gif|woff2?|mp4|mov|m4a|mp3|ogg|opus|webm|zip)$/i;

function shouldStore(path: string): boolean {
  return ALREADY_COMPRESSED.test(path);
}

/**
 * Write a deterministic zip from a path → content map. Determinism is
 * achieved by sorting paths, pinning each entry's date, and writing as a
 * UNIX-platform archive (avoids any host-OS bit leakage).
 *
 * Returns a `Uint8Array` so the same code path works in Node and the
 * browser. Callers that need a Node `Buffer` can wrap with `Buffer.from`.
 */
export async function writeZip(files: ReadonlyMap<string, Uint8Array>): Promise<Uint8Array> {
  const zip = new JSZip();
  const sortedPaths = [...files.keys()].sort();
  for (const path of sortedPaths) {
    const content = files.get(path);
    if (!content) continue;
    zip.file(path, content, {
      date: FIXED_DATE,
      compression: shouldStore(path) ? 'STORE' : 'DEFLATE',
      compressionOptions: { level: 9 },
    });
  }
  const out = await zip.generateAsync({
    type: 'uint8array',
    platform: 'UNIX',
    streamFiles: false,
  });
  return out;
}

/**
 * Read a zip into a path → content map. Directory entries are skipped.
 * Returned in sorted-path order for predictable iteration on the consumer.
 */
export async function readZip(buf: Uint8Array): Promise<Map<string, Uint8Array>> {
  const zip = await JSZip.loadAsync(buf);
  const out = new Map<string, Uint8Array>();
  const paths = Object.keys(zip.files).sort();
  for (const path of paths) {
    const entry = zip.files[path];
    if (!entry || entry.dir) continue;
    const content = await entry.async('uint8array');
    out.set(path, content);
  }
  return out;
}
