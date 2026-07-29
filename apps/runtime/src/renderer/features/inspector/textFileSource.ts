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
  /**
   * B-113 — the underlying handle, when there is one, so the attachment can be
   * PERSISTED (a handle is structured-cloneable; a closure is not). Absent on
   * the test fake and on any future non-FSA source, which is why it is optional
   * rather than part of the contract every source must satisfy.
   */
  readonly handle?: FileSystemFileHandle;
}

/**
 * B-113 — whether a RESTORED source may be read without asking the operator.
 *
 * A handle survives a reload; the READ PERMISSION attached to it may not.
 * Chromium can return it already granted (persistent permissions), and often
 * does for a file the operator has used before — but it may equally return
 * `prompt`, and `requestPermission` then needs a user gesture, which a page
 * doing its boot restore does not have. So restoration reports the state rather
 * than guessing, and the control offers the gesture when one is needed.
 */
export type FileSourcePermission = 'granted' | 'needs-gesture' | 'denied';

interface PermissionCapableHandle extends FileSystemFileHandle {
  queryPermission?: (d: { mode: 'read' | 'readwrite' }) => Promise<PermissionState>;
  requestPermission?: (d: { mode: 'read' | 'readwrite' }) => Promise<PermissionState>;
}

/** Ask, without prompting, whether this handle can currently be read. */
export async function queryReadPermission(
  handle: FileSystemFileHandle,
): Promise<FileSourcePermission> {
  const query = (handle as PermissionCapableHandle).queryPermission;
  // No permissions API on the handle means the browser does not gate reads this
  // way — treat it as readable and let an actual read report any real failure.
  if (query === undefined) return 'granted';
  try {
    const state = await query.call(handle, { mode: 'read' });
    if (state === 'granted') return 'granted';
    return state === 'denied' ? 'denied' : 'needs-gesture';
  } catch {
    return 'needs-gesture';
  }
}

/**
 * Ask the operator to re-grant read access. MUST be called from a user gesture;
 * the caller wires it to a button click for exactly that reason.
 */
export async function requestReadPermission(
  handle: FileSystemFileHandle,
): Promise<FileSourcePermission> {
  const request = (handle as PermissionCapableHandle).requestPermission;
  if (request === undefined) return 'granted';
  try {
    const state = await request.call(handle, { mode: 'read' });
    if (state === 'granted') return 'granted';
    return state === 'denied' ? 'denied' : 'needs-gesture';
  } catch {
    return 'denied';
  }
}

/** Operator-facing reason shown while a restored attachment is not yet readable. */
export const FILE_SOURCE_NEEDS_PERMISSION_MESSAGE =
  'This file was reattached from your last session. Grant access to read it again.';

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
    handle,
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
