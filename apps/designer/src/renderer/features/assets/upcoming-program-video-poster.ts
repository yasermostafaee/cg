import type { AssetMeta } from '@cg/shared-ipc';
import { attachRobustVideoPoster } from '../../../shared/video-poster.js';

/** Capture the middle of the stored, conformed clip for reuse in Preview and export. */
export async function captureUpcomingProgramVideoPoster(
  asset: AssetMeta,
  signal: AbortSignal,
): Promise<File | null> {
  const url = await window.cg.assets.url(asset.assetId);
  if (url === null || signal.aborted) return null;
  const video = document.createElement('video');
  try {
    const frame = await attachRobustVideoPoster(video, url, undefined, signal);
    if (!frame.ok || signal.aborted || video.videoWidth === 0 || video.videoHeight === 0)
      return null;
    const scale = Math.min(1, 960 / Math.max(video.videoWidth, video.videoHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
    canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
    const context = canvas.getContext('2d');
    if (context === null) return null;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const png = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    return png === null || signal.aborted
      ? null
      : new File([png], `${asset.filename.replace(/\.[^.]+$/, '')} — poster.png`, {
          type: 'image/png',
        });
  } finally {
    video.pause();
    video.removeAttribute('src');
    video.load();
  }
}
