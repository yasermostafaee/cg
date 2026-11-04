/**
 * R-018 — a replaceable text-file source for field values.
 *
 * The Runtime is a browser SPA (no Node `fs`), so the ONLY real implementation
 * has two real implementations: an operator-owned File System Access handle,
 * and an authored relative path read by CG Bridge. Both read CURRENT bytes on
 * demand. The interface also keeps split/apply/error logic testable without a
 * DOM; automatic watching remains the separate R-026 concern.
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
  /** Binary read used by the Sequence-row Excel importer. */
  readBytes?(): Promise<Uint8Array>;
  /**
   * B-113 — the underlying handle, when there is one, so the attachment can be
   * PERSISTED (a handle is structured-cloneable; a closure is not). Absent on
   * the test fake and on any future non-FSA source, which is why it is optional
   * rather than part of the contract every source must satisfy.
   */
  readonly handle?: FileSystemFileHandle;
  /** R-102 — present only for a source whose bytes come from CG Bridge. */
  readonly bridgePath?: string;
  /** Full path returned by CG Bridge after a successful read, or the browser-visible file name. */
  readonly displayPath?: string;
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

/** A {@link TextFileSource} over an operator-owned File System Access handle. */
export function fsaTextFileSource(handle: FileSystemFileHandle): TextFileSource {
  return {
    name: handle.name,
    handle,
    displayPath: handle.name,
    read: async (): Promise<string> => {
      const file = await handle.getFile();
      return file.text();
    },
    readBytes: async (): Promise<Uint8Array> => {
      const file = await handle.getFile();
      return new Uint8Array(await file.arrayBuffer());
    },
  };
}

/** R-102 — a live source read on the Bridge host under its configured safe root. */
export function bridgeTextFileSource(bridgePath: string): TextFileSource {
  let sourcePath: string | undefined;
  const readAnswer = async (): Promise<Awaited<ReturnType<typeof window.cg.textSources.read>>> => {
    const answer = await window.cg.textSources.read({ path: bridgePath });
    sourcePath = answer.sourcePath ?? bridgePath;
    return answer;
  };
  return {
    name: bridgePath,
    bridgePath,
    get displayPath(): string {
      return sourcePath ?? bridgePath;
    },
    read: async (): Promise<string> => (await readAnswer()).content,
    readBytes: async (): Promise<Uint8Array> => {
      const answer = await readAnswer();
      if (answer.base64 === undefined) {
        // Older Bridge compatibility. This remains exact for UTF-8 CSV/JSON; an
        // XLSX from an older Bridge fails workbook validation with a clear error.
        return new TextEncoder().encode(answer.content);
      }
      const decoded = atob(answer.base64);
      return Uint8Array.from(decoded, (character) => character.charCodeAt(0));
    },
  };
}

/**
 * Open the browser file picker and wrap the chosen file. Resolves `null` when
 * the operator cancels; rejects with {@link FILE_SOURCE_UNSUPPORTED_MESSAGE}
 * when the picker API is absent (the caller shows it verbatim). Must be called
 * from a user gesture (the button click) — the API requires activation.
 */
export async function pickTextFileSource(
  w: Window = window,
  options: { includeExcel?: boolean } = {},
): Promise<TextFileSource | null> {
  const picker = (w as FilePickerWindow).showOpenFilePicker;
  if (picker === undefined) throw new Error(FILE_SOURCE_UNSUPPORTED_MESSAGE);
  let handles: FileSystemFileHandle[];
  try {
    handles = await picker({
      types: [
        {
          description: 'Text and structured data',
          accept: {
            'text/plain': ['.txt', '.text', '.log'],
            'text/csv': ['.csv'],
            'application/json': ['.json'],
            ...(options.includeExcel === true
              ? {
                  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
                }
              : {}),
          },
        },
      ],
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
