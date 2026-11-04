import { fsaTextFileSource, type TextFileSource } from './textFileSource.js';

export function structuredWorkbookFilename(name: string, fallback = 'data'): string {
  const stem = name
    .trim()
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '');
  return `${stem || fallback}-rows.sample.xlsx`;
}

/** Save generated workbook bytes and return the re-readable handle used by Reload. */
export async function saveStructuredWorkbook(
  bytes: Uint8Array,
  suggestedName: string,
): Promise<TextFileSource | null> {
  const mime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  const picker = (
    window as typeof window & {
      showSaveFilePicker?: (options: {
        suggestedName: string;
        types: { description: string; accept: Record<string, string[]> }[];
      }) => Promise<FileSystemFileHandle>;
    }
  ).showSaveFilePicker;
  if (picker !== undefined) {
    let handle: FileSystemFileHandle;
    try {
      handle = await picker({
        suggestedName,
        types: [{ description: 'Excel workbook', accept: { [mime]: ['.xlsx'] } }],
      });
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === 'AbortError') return null;
      throw cause;
    }
    const writable = await handle.createWritable();
    await writable.write(new Blob([Uint8Array.from(bytes).buffer], { type: mime }));
    await writable.close();
    return fsaTextFileSource(handle);
  }
  const url = URL.createObjectURL(new Blob([Uint8Array.from(bytes).buffer], { type: mime }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = suggestedName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return null;
}
