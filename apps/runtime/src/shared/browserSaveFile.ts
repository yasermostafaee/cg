type BrowserSaveTarget =
  | { kind: 'picked'; handle: FileSystemFileHandle }
  | { kind: 'unavailable' }
  | { kind: 'cancelled' };

/** Open the picker while the original click still grants browser user activation. */
export async function chooseBrowserSaveTarget(
  suggestedName: string,
  description: string,
  mimeType: string,
  extension: string,
): Promise<BrowserSaveTarget> {
  const browser = window as typeof window & {
    showSaveFilePicker?: (options: {
      suggestedName: string;
      types: { description: string; accept: Record<string, string[]> }[];
    }) => Promise<FileSystemFileHandle>;
  };
  if (browser.showSaveFilePicker === undefined || navigator.userActivation?.isActive === false) {
    return { kind: 'unavailable' };
  }
  try {
    const handle = await browser.showSaveFilePicker({
      suggestedName,
      types: [{ description, accept: { [mimeType]: [extension] } }],
    });
    return { kind: 'picked', handle };
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      return { kind: 'cancelled' };
    }
    throw error;
  }
}

/** Close commits the write. Abort leaves the previous contents intact on failure. */
export async function writeBrowserSaveTarget(
  handle: FileSystemFileHandle,
  blob: Blob,
): Promise<void> {
  const writable = await handle.createWritable();
  try {
    await writable.write(blob);
    await writable.close();
  } catch (error) {
    await writable.abort().catch(() => undefined);
    throw error;
  }
}
