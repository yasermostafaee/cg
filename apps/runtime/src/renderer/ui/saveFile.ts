import { chooseBrowserSaveTarget, writeBrowserSaveTarget } from '../../shared/browserSaveFile.js';

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
  const target = await chooseBrowserSaveTarget(suggestedName, description, blob.type, extension);
  if (target.kind === 'cancelled') return target;
  if (target.kind === 'picked') {
    await writeBrowserSaveTarget(target.handle, blob);
    return { kind: 'saved', handle: target.handle };
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
