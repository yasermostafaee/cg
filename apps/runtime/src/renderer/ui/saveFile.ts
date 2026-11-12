type SaveFileOutcome =
  | { kind: 'saved'; handle: FileSystemFileHandle }
  | { kind: 'download' }
  | { kind: 'cancelled' };

/** Choose and write a file in Chromium, or request a download where the picker is unavailable. */
export async function saveFile(
  blob: Blob,
  suggestedName: string,
  description: string,
  extension: string,
): Promise<SaveFileOutcome> {
  const fileWindow = window as typeof window & {
    showSaveFilePicker?: (options: {
      suggestedName: string;
      types: { description: string; accept: Record<string, string[]> }[];
    }) => Promise<FileSystemFileHandle>;
  };
  if (fileWindow.showSaveFilePicker !== undefined) {
    let handle: FileSystemFileHandle;
    try {
      handle = await fileWindow.showSaveFilePicker({
        suggestedName,
        types: [{ description, accept: { [blob.type]: [extension] } }],
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError')
        return { kind: 'cancelled' };
      throw error;
    }
    const writable = await handle.createWritable();
    try {
      await writable.write(blob);
      await writable.close();
    } catch (error) {
      await writable.abort().catch(() => undefined);
      throw error;
    }
    return { kind: 'saved', handle };
  }

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = suggestedName;
  document.body.append(anchor);
  try {
    anchor.click();
  } finally {
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }
  return { kind: 'download' };
}
