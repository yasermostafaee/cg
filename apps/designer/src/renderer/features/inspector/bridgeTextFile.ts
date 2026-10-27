import { isSafeBridgeTextSourcePath } from '@cg/shared-schema';

/** Keep Designer preview and CG Bridge's bounded UTF-8 reader on the same ceiling. */
export const MAX_BRIDGE_TEXT_SOURCE_BYTES = 1024 * 1024;

const TEXT_EXTENSIONS = new Set(['txt', 'text', 'csv', 'tsv', 'log']);
const NATURAL = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

export interface BridgeTextSourceFile {
  readonly file: File;
  /** Portable path stored in the template, relative to CG Bridge `textSourceRoot`. */
  readonly path: string;
}

function isTextFile(file: File): boolean {
  if (file.type.startsWith('text/')) return true;
  const dot = file.name.lastIndexOf('.');
  return dot >= 0 && TEXT_EXTENSIONS.has(file.name.slice(dot + 1).toLowerCase());
}

/**
 * Turn a native text-file pick into a portable Bridge-relative source.
 *
 * Browsers intentionally do not expose the selected Windows/UNC absolute path.
 * Therefore a file chosen directly from the configured `textSourceRoot` is stored
 * by its basename. Invalid, non-text and over-limit files are omitted.
 */
export function bridgeTextSourceFiles(files: readonly File[]): BridgeTextSourceFile[] {
  const result: BridgeTextSourceFile[] = [];
  for (const file of files) {
    if (!isTextFile(file) || file.size > MAX_BRIDGE_TEXT_SOURCE_BYTES) continue;
    const relative = file.name;
    if (!isSafeBridgeTextSourcePath(relative)) continue;
    result.push({ file, path: relative });
  }
  return result.sort((a, b) => NATURAL.compare(a.path, b.path));
}

/** Read the author's current bytes for preview; no bytes are embedded in the template. */
export async function readBridgeTextPreview(file: File): Promise<string> {
  if (file.size > MAX_BRIDGE_TEXT_SOURCE_BYTES) {
    throw new Error('Text files must be 1 MiB or smaller.');
  }
  return file.text();
}

/** Browsers expose only a name/relative hint; the installed Windows shell returns a drive/UNC path. */
export function isVisibleWindowsSourcePath(path: string): boolean {
  return /^[a-z]:[\\/]/i.test(path) || /^\\\\[^\\]+\\[^\\]+/.test(path);
}
