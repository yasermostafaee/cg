import type { DesignerTextSourceFile } from '../shared/designer-bridge.js';
import { pickFiles } from './pickFiles.js';

const MAX_TEXT_SOURCE_BYTES = 1024 * 1024;
const TEXT_SOURCE_ACCEPT =
  '.txt,.text,.csv,.tsv,.log,text/plain,text/csv,text/tab-separated-values';

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

  async pick(): Promise<DesignerTextSourceFile | null> {
    const openPicker = window.showOpenFilePicker;
    if (openPicker !== undefined) {
      let handles: FileSystemFileHandle[];
      try {
        handles = await openPicker({
          multiple: false,
          types: [
            {
              description: 'Text files',
              accept: {
                'text/plain': ['.txt', '.text', '.log'],
                'text/csv': ['.csv'],
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

  #assertSize(
    file: Pick<File, 'size'>,
    message = 'Choose a supported text file of 1 MiB or smaller.',
  ): void {
    if (file.size > MAX_TEXT_SOURCE_BYTES) throw new Error(message);
  }

  async #selection(file: File, sourcePath: string): Promise<DesignerTextSourceFile> {
    return {
      name: file.name,
      bridgePath: file.name,
      sourcePath,
      content: await file.text(),
    };
  }
}
