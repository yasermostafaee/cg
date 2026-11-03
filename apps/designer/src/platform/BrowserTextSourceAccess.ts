import type {
  DesignerStructuredRowsFile,
  DesignerTextSourceFile,
} from '../shared/designer-bridge.js';
import { pickFiles } from './pickFiles.js';

const MAX_TEXT_SOURCE_BYTES = 1024 * 1024;
const MAX_STRUCTURED_ROWS_BYTES = 10 * 1024 * 1024;
const TEXT_SOURCE_ACCEPT =
  '.txt,.text,.csv,.tsv,.json,.log,text/plain,text/csv,application/json,text/tab-separated-values';
const STRUCTURED_ROWS_ACCEPT =
  '.csv,.json,.xlsx,text/csv,application/json,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** MIME essence accepted by Chromium's File System Access picker. */
export function textSourceSampleMimeType(
  format: 'csv' | 'json' | 'xlsx',
):
  | 'text/csv'
  | 'application/json'
  | 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' {
  if (format === 'csv') return 'text/csv';
  if (format === 'xlsx') {
    return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  }
  return 'application/json';
}

/**
 * Session-scoped browser access to the text file selected by the author.
 *
 * A File returned by an `<input>` is only a snapshot. Chromium may invalidate
 * it later (notably on Windows shares), which turns Reload into a
 * `NotReadableError`. A File System Access handle can produce a fresh snapshot
 * for every read and retains the user grant for the life of this page.
 */
export class BrowserTextSourceAccess {
  readonly #files = new Map<string, File>();
  readonly #handles = new Map<string, FileSystemFileHandle>();

  /** Keep a generated row-data workbook readable through Reload for this session. */
  rememberStructuredRowsHandle(handle: FileSystemFileHandle): void {
    this.#handles.set(handle.name, handle);
    this.#files.delete(handle.name);
  }

  async pick(): Promise<DesignerTextSourceFile | null> {
    const openPicker = window.showOpenFilePicker;
    if (openPicker !== undefined) {
      let handles: FileSystemFileHandle[];
      try {
        handles = await openPicker({
          multiple: false,
          types: [
            {
              description: 'Text and structured data files',
              accept: {
                'text/plain': ['.txt', '.text', '.log'],
                'text/csv': ['.csv'],
                'application/json': ['.json'],
                'text/tab-separated-values': ['.tsv'],
              },
            },
          ],
        });
      } catch (cause) {
        if (cause instanceof DOMException && cause.name === 'AbortError') return null;
        throw cause;
      }
      const handle = handles[0];
      if (handle === undefined) return null;
      const file = await handle.getFile();
      this.#assertSize(file);
      const sourcePath = file.name;
      this.#handles.set(sourcePath, handle);
      this.#files.delete(sourcePath);
      return this.#selection(file, sourcePath);
    }

    const picked = await pickFiles(undefined, {
      accept: TEXT_SOURCE_ACCEPT,
      multiple: false,
    });
    const file = picked[0];
    if (file === undefined) return null;
    this.#assertSize(file);
    const sourcePath =
      ((file as File & { path?: string }).path ?? file.webkitRelativePath) || file.name;
    this.#files.set(sourcePath, file);
    return this.#selection(file, sourcePath);
  }

  async reload(sourcePath: string): Promise<string> {
    const handle = this.#handles.get(sourcePath);
    if (handle !== undefined) {
      const file = await handle.getFile();
      this.#assertSize(file, 'The selected text file is now larger than 1 MiB.');
      return file.text();
    }

    const file = this.#files.get(sourcePath);
    if (file === undefined) throw new Error('Choose this file again before reloading it.');
    try {
      return await file.text();
    } catch {
      throw new Error(
        'The browser released access to this file. Choose the shared file again to restore Reload access.',
      );
    }
  }

  async pickStructuredRows(): Promise<DesignerStructuredRowsFile | null> {
    const openPicker = window.showOpenFilePicker;
    if (openPicker !== undefined) {
      let handles: FileSystemFileHandle[];
      try {
        handles = await openPicker({
          multiple: false,
          types: [
            {
              description: 'Sequence row data',
              accept: {
                'text/csv': ['.csv'],
                'application/json': ['.json'],
                'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
              },
            },
          ],
        });
      } catch (cause) {
        if (cause instanceof DOMException && cause.name === 'AbortError') return null;
        throw cause;
      }
      const handle = handles[0];
      if (handle === undefined) return null;
      const file = await handle.getFile();
      this.#assertSize(
        file,
        'Choose a CSV, JSON or Excel file of 10 MiB or smaller.',
        MAX_STRUCTURED_ROWS_BYTES,
      );
      const sourcePath = file.name;
      this.#handles.set(sourcePath, handle);
      this.#files.delete(sourcePath);
      return this.#structuredSelection(file, sourcePath);
    }

    const picked = await pickFiles(undefined, {
      accept: STRUCTURED_ROWS_ACCEPT,
      multiple: false,
    });
    const file = picked[0];
    if (file === undefined) return null;
    this.#assertSize(
      file,
      'Choose a CSV, JSON or Excel file of 10 MiB or smaller.',
      MAX_STRUCTURED_ROWS_BYTES,
    );
    const sourcePath =
      ((file as File & { path?: string }).path ?? file.webkitRelativePath) || file.name;
    this.#files.set(sourcePath, file);
    return this.#structuredSelection(file, sourcePath);
  }

  async reloadStructuredRows(sourcePath: string): Promise<string | Uint8Array> {
    const handle = this.#handles.get(sourcePath);
    const file = handle === undefined ? this.#files.get(sourcePath) : await handle.getFile();
    if (file === undefined) throw new Error('Choose this file again before reloading it.');
    this.#assertSize(
      file,
      'The selected data file is now larger than 10 MiB.',
      MAX_STRUCTURED_ROWS_BYTES,
    );
    return new Uint8Array(await file.arrayBuffer());
  }

  #assertSize(
    file: Pick<File, 'size'>,
    message = 'Choose a supported text file of 1 MiB or smaller.',
    maxBytes = MAX_TEXT_SOURCE_BYTES,
  ): void {
    if (file.size > maxBytes) throw new Error(message);
  }

  async #selection(file: File, sourcePath: string): Promise<DesignerTextSourceFile> {
    return {
      name: file.name,
      bridgePath: file.name,
      sourcePath,
      content: await file.text(),
    };
  }

  async #structuredSelection(file: File, sourcePath: string): Promise<DesignerStructuredRowsFile> {
    return {
      name: file.name,
      bridgePath: file.name,
      sourcePath,
      content: new Uint8Array(await file.arrayBuffer()),
    };
  }
}
