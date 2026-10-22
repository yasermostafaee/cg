import { PAGE_MAX_BYTES, PAGES_MAX_PER_ROW, pageRefusalMessage } from '@cg/shared-ipc';
import { naturalCompare } from '@cg/text-shaping';
import { fitLine, fitPicture, type Raster } from './fitPicture.js';
import { rememberPicture } from './pagePictures.js';
import type { PicturePage } from './bookPages.js';

/**
 * `R-100` / `RUN-NEXT-VERSION-03` — **PICK, FIT AND SEND A BOOK'S PICTURES**: the one loader the Inspector's
 * `Load pages… ▾` (`Pictures…` / `Folder…`) and `Manage pages…`' `Add pictures…` / `Add folder…` /
 * `Replace with folder…` share — and, since delta A, files or a folder DROPPED on the book block or on
 * `Manage pages…`. The files are put in natural order (the comparison the Designer uses too), each is
 * FITTED to the row's channel (1.2, `fitPicture`) and sent to CG Bridge one at a time; the bytes sent
 * are kept under the hash the bridge answered (1.1, `pagePictures`). A picture from a folder keeps its
 * folder in its name (`IN/MRN (1).jpg`), so the Inspector can say where the book came from on any
 * console, at any later time.
 */
const PICTURE_EXT = /\.(png|jpe?g|webp)$/i;

/** A picture to load, with its path from the folder it was picked or dropped in (`IN/MRN (1).jpg`). */
export interface PictureFile {
  readonly file: File;
  readonly path: string;
}

function picked(file: File): PictureFile {
  return { file, path: file.webkitRelativePath !== '' ? file.webkitRelativePath : file.name };
}

/** Open the browser's own picker: many files, or one folder. `[]` when dismissed. */
function pickPictures(folder: boolean): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    if (folder) input.webkitdirectory = true;
    else input.accept = 'image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp';
    let settled = false;
    const settle = (files: File[]): void => {
      if (settled) return;
      settled = true;
      resolve(files);
    };
    input.addEventListener('change', () => settle(input.files === null ? [] : [...input.files]), {
      once: true,
    });
    input.addEventListener('cancel', () => settle([]), { once: true });
    input.click();
  });
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

/** `notes.png, b.png` — the operator's own file names, in the order they were picked. */
function namesOf(names: readonly string[]): string {
  return names.join(', ');
}

/**
 * `RUN-NEXT-VERSION-03` 1.2 — the sentence naming the pictures that did not load: the ones still over
 * the cap after fitting, and the ones that are not pictures at all.
 */
export function notLoadedLine(
  tooLarge: readonly string[],
  notPictures: readonly string[],
): string | null {
  const parts: string[] = [];
  if (tooLarge.length > 0) {
    const mb = String(PAGE_MAX_BYTES / (1024 * 1024));
    parts.push(
      `${namesOf(tooLarge)} could not be made smaller than ${mb} MB and ${tooLarge.length === 1 ? 'was' : 'were'} not loaded.`,
    );
  }
  for (const name of notPictures) parts.push(pageRefusalMessage('page-not-a-picture', { name }));
  return parts.length === 0 ? null : parts.join(' ');
}

export interface LoadOutcome {
  /** The pictures that loaded, in natural order — empty when nothing was picked or all were refused. */
  readonly pages: PicturePage[];
  /** What fitting did (`12 pictures were resized to fit 1920×1080`), or `null`. */
  readonly fitted: string | null;
  /** The pictures that did not load, by name, or the bridge's own refusal — or `null`. */
  readonly refusal: string | null;
}

/**
 * 🔴 `RUN-NEXT-VERSION-03` delta A — **WHAT WAS DROPPED: files, a folder, or both.** Read from the drop
 * event's items while the event lasts (a `DataTransferItemList` is emptied when the handler returns);
 * a folder is read through its entry, every level down, each file keeping its path inside it. Where a
 * browser hands no entry (a file only), the item's file is taken as it is.
 */
export function droppedPictures(data: DataTransfer): Promise<PictureFile[]> {
  const reads: Promise<PictureFile[]>[] = [];
  for (const item of [...data.items]) {
    if (item.kind !== 'file') continue;
    const entry = item.webkitGetAsEntry();
    if (entry !== null && entry.isDirectory) {
      reads.push(readFolder(entry as FileSystemDirectoryEntry));
      continue;
    }
    const file = item.getAsFile();
    if (file !== null) reads.push(Promise.resolve([{ file, path: file.name }]));
  }
  return Promise.all(reads).then((lists) => lists.flat());
}

/** The drag carries files or folders from outside the page (not a page tile being reordered). */
export function dragCarriesFiles(data: DataTransfer | null): boolean {
  return data !== null && [...data.types].includes('Files');
}

async function readFolder(folder: FileSystemDirectoryEntry): Promise<PictureFile[]> {
  const reader = folder.createReader();
  const out: PictureFile[] = [];
  // `readEntries` answers in batches; an empty batch is the end.
  for (;;) {
    const batch = await new Promise<FileSystemEntry[]>((resolve, reject) =>
      reader.readEntries(resolve, reject),
    );
    if (batch.length === 0) break;
    for (const entry of batch) {
      if (entry.isDirectory) {
        out.push(...(await readFolder(entry as FileSystemDirectoryEntry)));
      } else {
        const file = await new Promise<File>((resolve, reject) =>
          (entry as FileSystemFileEntry).file(resolve, reject),
        );
        out.push({ file, path: entry.fullPath.replace(/^\/+/, '') });
      }
    }
  }
  return out;
}

/**
 * Pick pictures (or a folder), fit each, send each to CG Bridge. `progress` is told after every file;
 * `null` is answered when the operator dismissed the picker.
 */
export async function loadPictures(
  folder: boolean,
  raster: Raster,
  progress: (done: number, total: number) => void,
): Promise<LoadOutcome | null> {
  return loadPictureFiles((await pickPictures(folder)).map(picked), raster, progress);
}

/**
 * Fit and send pictures already in hand (picked, or dropped). `null` when none of them is a picture
 * file — nothing to load, nothing to say, as when a picker is dismissed.
 */
export async function loadPictureFiles(
  given: readonly PictureFile[],
  raster: Raster,
  progress: (done: number, total: number) => void,
): Promise<LoadOutcome | null> {
  const candidates = given.filter((f) => PICTURE_EXT.test(f.file.name));
  if (candidates.length === 0) return null;
  if (candidates.length > PAGES_MAX_PER_ROW) {
    return {
      pages: [],
      fitted: null,
      refusal: pageRefusalMessage('page-too-many', { count: candidates.length }),
    };
  }
  const files = [...candidates].sort((a, b) => naturalCompare(a.path, b.path));
  const pages: PicturePage[] = [];
  const tooLarge: string[] = [];
  const notPictures: string[] = [];
  let resized = 0;
  let reencoded = 0;
  progress(0, files.length);
  for (const [i, { file, path }] of files.entries()) {
    // `RUN-NEXT-VERSION-03` 1.2 — FITTED, not refused: a picture larger than the channel, or over the
    // cap, is scaled and re-encoded here; only what is still over the cap is named.
    const fit = await fitPicture(file, new Uint8Array(await file.arrayBuffer()), raster);
    progress(i + 1, files.length);
    if (!fit.ok) {
      (fit.reason === 'too-large-after-fit' ? tooLarge : notPictures).push(file.name);
      continue;
    }
    if (fit.resized) resized += 1;
    if (fit.reencoded) reencoded += 1;
    const put = await window.cg.pages.put({ name: file.name, base64: toBase64(fit.bytes) });
    if (!put.accepted || put.sha256 === undefined) {
      // The bridge's own check is the guard: its refusal stops the load, in its own words.
      return {
        pages: [],
        fitted: null,
        refusal: put.message ?? `${file.name} was not accepted by CG Bridge.`,
      };
    }
    // `RUN-NEXT-VERSION-03` 1.1 — the bytes just sent, kept under the hash the bridge answered, so PVW
    // and the page tools draw this picture without asking the bridge for it back.
    rememberPicture(put.sha256, fit.bytes);
    pages.push({
      id: `${String(pages.length + 1)}-${put.sha256.slice(0, 12)}`,
      kind: 'image',
      media: put.sha256,
      name: path,
    });
  }
  return {
    pages,
    fitted: fitLine(resized, reencoded, raster),
    refusal: notLoadedLine(tooLarge, notPictures),
  };
}
