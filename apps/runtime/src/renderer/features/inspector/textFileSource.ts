/**
 * R-018 — a replaceable text-file source for field values.
 *
 * The Runtime is a browser SPA (no Node `fs`), so the ONLY real implementation
 * today wraps a File System Access API handle: `showOpenFilePicker` → keep the
 * `FileSystemFileHandle` → `getFile()` + `.text()` on every read, so a read
 * always sees the file's CURRENT bytes. The interface exists on purpose:
 * (a) the split/apply/error logic tests against a fake source with no DOM, and
 * (b) the future watch half (R-026) may source values from a BRIDGE-watched
 * path instead — an FSA handle cannot be converted to a filesystem path, so
 * that source is a different implementation, not a redesign.
 */
export interface TextFileSource {
  /** Operator-facing display name (the picked file's name). */
  readonly name: string;
  /**
   * The file's CURRENT content as text (UTF-8). Rejects when the file is
   * missing or unreadable — callers keep the previous value and surface the
   * error; they never blank a field because a share went away.
   */
  read(): Promise<string>;
}

/**
 * The slice of the File System Access API this feature uses. `showOpenFilePicker`
 * is Chromium-only and not yet in TypeScript's DOM lib, so it is declared here —
 * narrowly — instead of via a global ambient patch.
 */
interface FilePickerWindow {
  showOpenFilePicker?: (options?: {
    types?: { description?: string; accept: Record<string, string[]> }[];
    excludeAcceptAllOption?: boolean;
    multiple?: boolean;
  }) => Promise<FileSystemFileHandle[]>;
}

/** Operator-facing reason shown when the picker is unavailable (non-Chromium). */
export const FILE_SOURCE_UNSUPPORTED_MESSAGE =
  'Loading from a file needs a Chromium-based browser (File System Access API).';

/** True when this browser can open a file picker that returns a re-readable handle. */
export function fileSourceSupported(w: Window = window): boolean {
  return typeof (w as FilePickerWindow).showOpenFilePicker === 'function';
}

/** A {@link TextFileSource} over a File System Access handle (the only real one today). */
export function fsaTextFileSource(handle: FileSystemFileHandle): TextFileSource {
  return {
    name: handle.name,
    read: async (): Promise<string> => {
      const file = await handle.getFile();
      return file.text();
    },
  };
}

/**
 * Open the browser file picker and wrap the chosen file. Resolves `null` when
 * the operator cancels; rejects with {@link FILE_SOURCE_UNSUPPORTED_MESSAGE}
 * when the picker API is absent (the caller shows it verbatim). Must be called
 * from a user gesture (the button click) — the API requires activation.
 */
export async function pickTextFileSource(w: Window = window): Promise<TextFileSource | null> {
  const picker = (w as FilePickerWindow).showOpenFilePicker;
  if (picker === undefined) throw new Error(FILE_SOURCE_UNSUPPORTED_MESSAGE);
  let handles: FileSystemFileHandle[];
  try {
    handles = await picker({
      types: [{ description: 'Text', accept: { 'text/plain': ['.txt', '.text'] } }],
      multiple: false,
    });
  } catch (err) {
    // Cancelling the dialog rejects with an AbortError — that is not a failure.
    if (err instanceof DOMException && err.name === 'AbortError') return null;
    throw err;
  }
  const handle = handles[0];
  return handle === undefined ? null : fsaTextFileSource(handle);
}
