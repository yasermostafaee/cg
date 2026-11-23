import { chooseBrowserSaveTarget, writeBrowserSaveTarget } from '../shared/browserSaveFile.js';
import { nativeBridgeArchiveSaver } from './desktop.js';

const FALLBACK_ARCHIVE_NAME = 'cg-bridge-logs.zip';

type ArchiveDownloadOutcome =
  | { kind: 'saved'; location: string }
  | { kind: 'download' }
  | { kind: 'cancelled' };

function safeArchiveName(disposition: string | null): string {
  const matched = disposition?.match(/filename="([^"]+)"/i)?.[1]?.trim();
  if (matched === undefined || matched === '' || !matched.toLowerCase().endsWith('.zip')) {
    return FALLBACK_ARCHIVE_NAME;
  }
  return matched.replace(/[\\/:*?"<>|]/g, '-');
}

/**
 * Download a ticketed CG Bridge archive without navigating to its HTTP URL.
 *
 * A normal anchor to `/logs.zip` is intercepted by browser download managers such as IDM. The
 * ticket is one-use, so that interception can consume it without saving anything. Reading the
 * archive here first and downloading a local Blob keeps the ticket exchange inside CG Control.
 */
export async function downloadBridgeArchive(
  ticketUrl: () => Promise<string>,
): Promise<ArchiveDownloadOutcome> {
  const nativeSave = nativeBridgeArchiveSaver();
  // A browser picker needs the click's activation, which a slow archive fetch can outlast.
  const target =
    nativeSave === null
      ? await chooseBrowserSaveTarget(
          FALLBACK_ARCHIVE_NAME,
          'CG Bridge log archive',
          'application/zip',
          '.zip',
        )
      : undefined;
  if (target?.kind === 'cancelled') return target;

  const url = await ticketUrl();
  let response: Response;
  try {
    response = await fetch(url, { cache: 'no-store' });
  } catch {
    throw new Error(
      'CG Control could not reach the log archive. Restart CG Bridge with the matching build, then try Download logs again.',
    );
  }
  if (!response.ok) {
    const detail = (await response.text()).trim();
    throw new Error(
      `CG Bridge did not provide the log archive (HTTP ${String(response.status)}${detail === '' ? '' : `: ${detail}`}). Try Download logs again.`,
    );
  }

  const blob = await response.blob();
  const filename = safeArchiveName(response.headers.get('content-disposition'));
  if (nativeSave !== null) {
    const location = await nativeSave(blob, filename);
    return location === null ? { kind: 'cancelled' } : { kind: 'saved', location };
  }

  if (target?.kind === 'picked') {
    await writeBrowserSaveTarget(target.handle, blob);
    return { kind: 'saved', location: target.handle.name };
  }

  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = filename;
  link.rel = 'noopener';
  document.body.append(link);
  try {
    link.click();
  } finally {
    link.remove();
    // The browser opens the object URL asynchronously.
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1_000);
  }
  return { kind: 'download' };
}
