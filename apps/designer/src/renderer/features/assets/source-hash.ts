/**
 * D-128 — hash a picked SOURCE video file for PRE-convert dedupe (so re-importing
 * the same clip skips the minutes-long re-encode). The digest is the sha256 of
 * the source bytes; it is recorded in the converted asset's provenance
 * (`sourceSha256`) and matched — together with the crop + target fps + the
 * correction set + converter revision — before a new conversion starts.
 *
 * OFF THE MAIN THREAD (owner bug, 2026-07-25): the incremental sha256 is pure
 * JS — hashing hundreds of megabytes on the main thread yields only microtasks
 * between chunks, so paint starves, the modal's "0%" never repaints, and Chrome
 * declares the page unresponsive (the client's archive clips are 150–740 MB).
 * `hashSourceFile` therefore runs {@link hashSourceStream} inside a dedicated
 * Worker (the File is structured-clonable; the stream is read worker-side), with
 * progress posted back so the percentage actually advances and the page stays
 * interactive. Cancel is `worker.terminate()` — immediate, and the File is
 * untouched (the converter re-reads it independently via WORKERFS).
 *
 * Bounded memory as before: the file streams one chunk at a time into the
 * incremental sha256 — a multi-GB source never lands in memory whole.
 */

import { sha256HexOfChunks } from '@cg/vcg-format';

/**
 * The PURE streaming hash — chunked read → incremental sha256. Runs inside the
 * worker in the app; exported (and unit-tested) directly because the worker
 * shell is environment-bound while this logic is not.
 */
export async function hashSourceStream(
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

/** Worker → main messages. */
export type SourceHashWorkerOut =
  | { kind: 'progress'; ratio: number }
  | { kind: 'done'; hex: string }
  | { kind: 'error'; message: string };

/**
 * Hash `file` in a dedicated Worker. Same contract as the old main-thread
 * implementation: resolves the hex digest, reports 0..1 progress, rejects
 * promptly on abort (the worker is terminated — nothing keeps grinding).
 */
export function hashSourceFile(
  file: File,
  opts: {
    signal?: AbortSignal | undefined;
    onProgress?: ((ratio: number) => void) | undefined;
  } = {},
): Promise<string> {
  const { signal, onProgress } = opts;
  return new Promise<string>((resolve, reject) => {
    const worker = new Worker(new URL('./source-hash.worker.ts', import.meta.url), {
      type: 'module',
    });
    let settled = false;
    const finish = (act: () => void): void => {
      if (settled) return;
      settled = true;
      if (signal !== undefined) signal.removeEventListener('abort', onAbort);
      worker.terminate();
      act();
    };
    const onAbort = (): void => {
      finish(() =>
        reject(
          signal?.reason instanceof Error
            ? signal.reason
            : new DOMException('The operation was aborted.', 'AbortError'),
        ),
      );
    };
    if (signal !== undefined) {
      if (signal.aborted) {
        onAbort();
        return;
      }
      signal.addEventListener('abort', onAbort);
    }
    worker.onmessage = (e: MessageEvent<SourceHashWorkerOut>) => {
      const msg = e.data;
      if (msg.kind === 'progress') onProgress?.(msg.ratio);
      else if (msg.kind === 'done') finish(() => resolve(msg.hex));
      else finish(() => reject(new Error(msg.message)));
    };
    worker.onerror = (e) => {
      finish(() => reject(new Error(e.message !== '' ? e.message : 'source-hash worker failed')));
    };
    worker.postMessage({ file });
  });
}
