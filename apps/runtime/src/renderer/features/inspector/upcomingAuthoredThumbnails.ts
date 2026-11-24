import type { UpcomingProgramsTemplateMetadata } from '@cg/shared-schema';
import { imageThumbnailUrl } from '@cg/ui';
import { authoredMediaUrls } from '../book/authoredPictures.js';

const VIDEO_DECODE_TIMEOUT_MS = 5000;

/** Capture a still from an older packaged clip that did not include a poster. */
function videoThumbnail(url: string): Promise<string | undefined> {
  const video = document.createElement('video');
  video.muted = true;
  video.preload = 'auto';
  return new Promise((resolve) => {
    const settle = (thumbnail?: string): void => {
      window.clearTimeout(timeout);
      video.onloadeddata = null;
      video.onerror = null;
      video.removeAttribute('src');
      video.load();
      resolve(thumbnail);
    };
    const timeout = window.setTimeout(() => settle(), VIDEO_DECODE_TIMEOUT_MS);
    video.onerror = () => settle();
    video.onloadeddata = () => {
      try {
        const { videoWidth, videoHeight } = video;
        if (videoWidth === 0 || videoHeight === 0) return settle();
        const scale = Math.min(1, 320 / videoWidth, 180 / videoHeight);
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(videoWidth * scale));
        canvas.height = Math.max(1, Math.round(videoHeight * scale));
        const context = canvas.getContext('2d');
        if (context === null) return settle();
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        settle(canvas.toDataURL('image/jpeg', 0.8));
      } catch {
        settle();
      }
    };
    video.src = url;
  });
}

/** Use the exact media already baked into the template, downsampled for the picker only. */
export async function readUpcomingAuthoredThumbnails(
  html: string,
  metadata: UpcomingProgramsTemplateMetadata,
  current: () => boolean,
  publish: (assetId: string, thumbnail: string) => void,
): Promise<void> {
  const urls = authoredMediaUrls(html);
  const posters = new Map<string, string>();
  for (const { preparedItems } of metadata.elements) {
    for (const { mediaAssetId, posterAssetId } of preparedItems) {
      if (mediaAssetId === undefined || posterAssetId === undefined) continue;
      const poster = urls[posterAssetId];
      if (
        typeof poster === 'string' &&
        poster.startsWith('data:image/') &&
        !posters.has(mediaAssetId)
      ) {
        posters.set(mediaAssetId, poster);
      }
    }
  }

  const images: Promise<void>[] = [];
  const videos: { id: string; source: string }[] = [];
  for (const { id, kind } of metadata.assets) {
    const poster = kind === 'video' ? posters.get(id) : undefined;
    if (poster !== undefined) {
      images.push(imageThumbnailUrl(poster).then((thumbnail) => publish(id, thumbnail)));
      continue;
    }
    const source = urls[id];
    if (typeof source !== 'string') continue;
    if (kind === 'image' && source.startsWith('data:image/')) {
      images.push(imageThumbnailUrl(source).then((thumbnail) => publish(id, thumbnail)));
    } else if (kind === 'video' && source.startsWith('data:video/')) {
      videos.push({ id, source });
    }
  }
  // Prepared posters and pictures arrive first. Legacy video decode is limited to one at a time.
  for (const { id, source } of videos) {
    if (!current()) break;
    const thumbnail = await videoThumbnail(source);
    if (thumbnail !== undefined && current()) publish(id, thumbnail);
  }
  await Promise.all(images);
}
