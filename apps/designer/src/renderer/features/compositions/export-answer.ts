import type { ExportResult } from '../../../shared/designer-bridge.js';

/**
 * 🔴 `BOOK-EXPORT-01` (`B-349`) — **WHAT THE AUTHOR IS TOLD WHEN AN EXPORT ENDS.** The owner's
 * export of a book ended in nothing at all: no word, and a `telavat.vcg` of 0 bytes that CG Control
 * later called a "Corrupted zip". Every outcome now ends in one of these sentences.
 */

/** A size as Windows Explorer shows it: binary units, written KB / MB. */
export function sizeLabel(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${String(Math.max(1, Math.round(bytes / 1024)))} KB`;
}

/** Success: the file's name and its size. */
export function exportWrittenLine(filename: string, bytes: number): string {
  return `Exported ${filename} · ${sizeLabel(bytes)}`;
}

/**
 * Failure: the cause, then what became of the file the save dialog made — removed, left empty (the
 * author is asked to delete it), or not changed. BOOK-EXPORT Q4 — a Save into a file the save dialog
 * made is answered in the same sentences, with its own verb.
 */
export function exportFailedLine(
  result: Pick<Extract<ExportResult, { outcome: 'failed' }>, 'cause' | 'filename' | 'file'>,
  verb: 'Export' | 'Save' = 'Export',
): string {
  const what = `${verb} failed: ${result.cause.replace(/[.\s]+$/, '')}.`;
  const name = result.filename ?? 'The file';
  switch (result.file) {
    case 'removed':
      return `${what} ${name} was removed; nothing was saved.`;
    case 'left-empty':
      return `${what} ${name} was left empty; delete it.`;
    case 'unchanged':
      return `${what} ${name} was not changed.`;
    case 'none':
      return `${what} Nothing was saved.`;
  }
}
