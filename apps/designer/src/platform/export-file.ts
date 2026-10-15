import type { ExportFileFate } from '../shared/designer-bridge.js';
import { ExportBlockedError, ExportUnreadableError } from './Exporter.js';

/**
 * 🔴 `BOOK-EXPORT-01` (`B-349`) — **WRITING A PACKAGE INTO THE FILE THE SAVE DIALOG MADE, AND
 * ANSWERING FOR THAT FILE WHEN THE EXPORT FAILS.**
 *
 * Chrome creates the chosen file, EMPTY, the moment the author picks a name — before the package
 * exists. Until this, a failure after that moment was an unhandled rejection: the author saw nothing,
 * and a 0-byte `.vcg` stayed on disk until CG Control refused it as a "Corrupted zip".
 */

/** One write's worth: small enough for the write to show progress and to keep memory flat. */
export const WRITE_CHUNK_BYTES = 8 * 1024 * 1024;

/**
 * Write `bytes` into the file, a chunk at a time, reporting the share written (0..1) after each.
 * On a throw the writable is ABORTED: Chrome writes into a swap file until `close()`, so an aborted
 * write leaves the file as it was.
 */
export async function writeInChunks(
  handle: FileSystemFileHandle,
  bytes: Uint8Array,
  onProgress: (share: number) => void,
): Promise<void> {
  const writable = await handle.createWritable();
  try {
    for (let at = 0; at < bytes.byteLength; at += WRITE_CHUNK_BYTES) {
      const end = Math.min(at + WRITE_CHUNK_BYTES, bytes.byteLength);
      await writable.write(bytes.subarray(at, end) as Uint8Array<ArrayBuffer>);
      onProgress(end / bytes.byteLength);
    }
    await writable.close();
  } catch (err) {
    await writable.abort().catch(() => undefined);
    throw err;
  }
}

/**
 * What becomes of the chosen file after an export that failed. **Only an EMPTY file is removed** —
 * one that still holds bytes is the author's earlier file, which Chrome kept, and is never deleted.
 * The removal is CHECKED by reading the file back: `remove()` is not in every browser, and a claim
 * that it worked is made only when the file is really gone.
 */
export async function settleFailedFile(handle: FileSystemFileHandle): Promise<ExportFileFate> {
  let size: number;
  try {
    size = (await handle.getFile()).size;
  } catch (err) {
    return isNotFound(err) ? 'removed' : 'left-empty';
  }
  if (size > 0) return 'unchanged';
  const remove = (handle as { remove?: () => Promise<void> }).remove;
  if (typeof remove !== 'function') return 'left-empty';
  try {
    await remove.call(handle);
  } catch {
    return 'left-empty';
  }
  try {
    await handle.getFile();
    return 'left-empty';
  } catch (err) {
    return isNotFound(err) ? 'removed' : 'left-empty';
  }
}

function isNotFound(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'NotFoundError';
}

/**
 * The cause of a failed export, in the author's words, with the element at fault when there is one.
 * A fault this code did not foresee keeps its own text in brackets: it is what a report needs.
 */
export function exportFailureOf(err: unknown): { cause: string; elementId?: string } {
  if (err instanceof ExportBlockedError) {
    return {
      cause: err.issue.message,
      ...(err.issue.elementId !== undefined && { elementId: err.issue.elementId }),
    };
  }
  if (err instanceof ExportUnreadableError) return { cause: err.message, elementId: err.elementId };
  if (err instanceof DOMException) {
    switch (err.name) {
      case 'QuotaExceededError':
        return { cause: 'there is not enough space on the disk for the file' };
      case 'NoModificationAllowedError':
        return { cause: 'the file is open in another program' };
      case 'NotAllowedError':
        return { cause: 'the browser did not allow writing the file' };
      case 'NotReadableError':
        return {
          cause: `the browser could not read the package while writing it (${err.message})`,
        };
      case 'SecurityError':
        return { cause: `the browser would not open the save dialog (${err.message})` };
    }
  }
  const message = err instanceof Error ? err.message : String(err);
  return { cause: `the Designer hit an error (${message})` };
}
