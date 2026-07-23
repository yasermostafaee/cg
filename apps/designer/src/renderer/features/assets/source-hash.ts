/**
 * D-128 — hash a picked SOURCE video file for PRE-convert dedupe (so re-importing
 * the same clip skips the minutes-long re-encode). The digest is the sha256 of
 * the source bytes; it is recorded in the converted asset's provenance
 * (`sourceSha256`) and matched — together with the crop + target fps — before a
 * new conversion starts.
 *
 * Bounded memory by construction: the file is read through `File.stream()` one
 * chunk at a time and folded into an INCREMENTAL sha256 (`sha256HexOfChunks`),
 * so a multi-GB source never lands in JS memory whole — the same principle as
 * the WORKERFS mount the converter uses. `onProgress` reports a 0..1 ratio for
 * the modal's affordance on a slow hash; an aborted signal stops the read
 * promptly (the modal's probe-effect cleanup shares its controller).
 */

import { sha256HexOfChunks } from '@cg/vcg-format';

export async function hashSourceFile(
  file: File,
  opts: {
    signal?: AbortSignal | undefined;
    onProgress?: ((ratio: number) => void) | undefined;
  } = {},
): Promise<string> {
  const { signal, onProgress } = opts;
  const total = file.size;
  const reader = file.stream().getReader();

  async function* chunks(): AsyncGenerator<Uint8Array> {
    try {
      for (;;) {
        if (signal?.aborted === true) {
          throw signal.reason instanceof Error
            ? signal.reason
            : new DOMException('The operation was aborted.', 'AbortError');
        }
        const { done, value } = await reader.read();
        if (done) break;
        yield value;
      }
    } finally {
      // Release (or cancel) the lock so the File can be re-read (the converter
      // re-reads it via WORKERFS) and the stream is not left dangling on abort.
      try {
        await reader.cancel();
      } catch {
        /* already closed */
      }
      reader.releaseLock();
    }
  }

  return sha256HexOfChunks(chunks(), (bytesHashed) => {
    onProgress?.(total > 0 ? Math.min(1, bytesHashed / total) : 1);
  });
}
