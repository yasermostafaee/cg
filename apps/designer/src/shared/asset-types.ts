/**
 * B-021 — single source of truth for which file types each import context accepts.
 *
 * The picker's `accept` attribute is only a UI HINT and is trivially bypassable: the
 * native dialog lets the operator switch to "All files" and pick anything (pdf / mp3 /
 * mp4), which then imported as a broken tile. So selected files MUST be validated AFTER
 * selection. This module drives BOTH the `accept` hint (see {@link acceptAttr}) and the
 * post-pick validation (see {@link partitionSupported}), so the hint and the enforced
 * rule can never drift. The allowed extensions mirror the store's `KIND_BY_EXT`
 * (`apps/designer/src/platform/AssetStore.ts`).
 */
export type PickKind = 'image' | 'font' | 'lottie' | 'video';

interface KindSpec {
  /** The picker's `accept` hint (UI only — NOT a security boundary). */
  readonly accept: string;
  /** Canonical allowed extensions (lowercase, no dot). The primary validation gate. */
  readonly extensions: readonly string[];
  /** Canonical MIME types — a secondary gate for files whose extension is missing. */
  readonly mimes: readonly string[];
}

const SPEC: Record<PickKind, KindSpec> = {
  image: {
    accept: 'image/*',
    extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'],
    mimes: ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml'],
  },
  font: {
    accept: '.ttf,.otf,.woff,.woff2,font/ttf,font/otf,font/woff,font/woff2',
    extensions: ['ttf', 'otf', 'woff', 'woff2'],
    mimes: ['font/ttf', 'font/otf', 'font/woff', 'font/woff2'],
  },
  lottie: {
    accept: 'application/json,.json',
    extensions: ['json'],
    mimes: ['application/json'],
  },
  video: {
    accept: 'video/*',
    extensions: ['mp4', 'webm'],
    mimes: ['video/mp4', 'video/webm'],
  },
};

/** The picker `accept` hint for a context. */
export function acceptAttr(kind: PickKind): string {
  return SPEC[kind].accept;
}

/** Lowercased file extension without the leading dot, or `''` if there is none. */
export function fileExtension(filename: string): string {
  const dot = filename.lastIndexOf('.');
  return dot === -1 ? '' : filename.slice(dot + 1).toLowerCase();
}

/**
 * Is `file` an accepted type for this import context? Matches by EXTENSION (primary —
 * the dialog/MIME is unreliable and `type` is often empty) OR by canonical MIME (for a
 * file whose name carries no/odd extension). A pdf/mp3/mp4 picked into an image context
 * matches neither, so it is rejected before it can become a broken tile.
 */
export function isSupportedFile(kind: PickKind, file: { name: string; type?: string }): boolean {
  const spec = SPEC[kind];
  if (spec.extensions.includes(fileExtension(file.name))) return true;
  return file.type !== undefined && file.type !== '' && spec.mimes.includes(file.type);
}

/**
 * Concise message for files rejected by {@link partitionSupported}, for the app's
 * toast. Lists up to the first few names; for a larger batch it leads with the count and
 * appends "+N more" so the toast stays short.
 */
export function skippedFilesMessage(names: readonly string[]): string {
  const MAX = 3;
  const noun = names.length === 1 ? 'file' : 'files';
  const count = names.length > MAX ? `${String(names.length)} ` : '';
  const shown = names.slice(0, MAX).join(', ');
  const more = names.length > MAX ? `, +${String(names.length - MAX)} more` : '';
  return `Skipped ${count}unsupported ${noun}: ${shown}${more}`;
}

/** Split picked files into the ones this context accepts and the ones to skip. */
export function partitionSupported<T extends { name: string; type?: string }>(
  kind: PickKind,
  files: readonly T[],
): { valid: T[]; rejected: T[] } {
  const valid: T[] = [];
  const rejected: T[] = [];
  for (const file of files) (isSupportedFile(kind, file) ? valid : rejected).push(file);
  return { valid, rejected };
}
