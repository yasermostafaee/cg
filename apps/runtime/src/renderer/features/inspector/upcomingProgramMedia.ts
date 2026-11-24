import {
  UPCOMING_MEDIA_MAX_BYTES,
  UpcomingMediaMimeSchema,
  type UpcomingMediaMime,
} from '@cg/shared-ipc';
import { upcomingProgramMediaAssetId } from '@cg/shared-schema';
import { bytesToBase64 } from '../library/packageBytes.js';
import type { UpcomingProgramsMediaOption } from './UpcomingProgramsEditor.js';

const MIME_BY_EXTENSION: Readonly<Record<string, UpcomingMediaMime>> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  mp4: 'video/mp4',
  webm: 'video/webm',
};

const cached = new Map<string, string>();
const pending = new Map<string, Promise<string | undefined>>();
const CACHE_CHARACTERS = 48 * 1024 * 1024;
let characters = 0;

function remember(hash: string, dataUrl: string): void {
  characters -= cached.get(hash)?.length ?? 0;
  cached.delete(hash);
  cached.set(hash, dataUrl);
  characters += dataUrl.length;
  for (const [oldHash, oldUrl] of cached) {
    if (characters <= CACHE_CHARACTERS) break;
    cached.delete(oldHash);
    characters -= oldUrl.length;
  }
}

export function upcomingProgramMediaDataUrl(hash: string): Promise<string | undefined> {
  const known = cached.get(hash);
  if (known !== undefined) {
    remember(hash, known);
    return Promise.resolve(known);
  }
  const inFlight = pending.get(hash);
  if (inFlight !== undefined) return inFlight;
  const read = window.cg.upcomingMedia
    .get({ sha256: hash })
    .then((result) => {
      if (result.kind !== 'media') return undefined;
      const dataUrl = `data:${result.mime};base64,${result.base64}`;
      remember(hash, dataUrl);
      return dataUrl;
    })
    .catch(() => undefined)
    .finally(() => pending.delete(hash));
  pending.set(hash, read);
  return read;
}

async function upload(bytes: Blob, name: string, mime: UpcomingMediaMime) {
  const base64 = bytesToBase64(new Uint8Array(await bytes.arrayBuffer()));
  const result = await window.cg.upcomingMedia.put({ name: name.slice(0, 512), mime, base64 });
  if (!result.ok) throw new Error(result.errorCode);
  const dataUrl = `data:${result.mime};base64,${base64}`;
  remember(result.sha256, dataUrl);
  return { assetId: upcomingProgramMediaAssetId(result.sha256), dataUrl };
}

/** Decode an opening frame before accepting an operator clip, and reuse it as the still. */
async function videoPoster(file: File): Promise<Blob> {
  const video = document.createElement('video');
  const url = URL.createObjectURL(file);
  try {
    video.preload = 'auto';
    video.muted = true;
    await new Promise<void>((resolve, reject) => {
      const settled = (error?: Error): void => {
        window.clearTimeout(timer);
        if (error === undefined) resolve();
        else reject(error);
      };
      const timer = window.setTimeout(() => settled(new Error('Video decode timed out')), 8000);
      video.onloadeddata = () => settled();
      video.onerror = () => settled(new Error('Video could not be decoded'));
      video.src = url;
    });
    if (video.videoWidth === 0 || video.videoHeight === 0) throw new Error('Video has no picture');
    const scale = Math.min(1, 640 / Math.max(video.videoWidth, video.videoHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
    canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
    const context = canvas.getContext('2d');
    if (context === null) throw new Error('Could not create video poster');
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (poster) => {
          if (poster === null) reject(new Error('Could not encode video poster'));
          else resolve(poster);
        },
        'image/jpeg',
        0.85,
      );
    });
  } finally {
    video.onloadeddata = null;
    video.onerror = null;
    video.removeAttribute('src');
    URL.revokeObjectURL(url);
  }
}

export async function importUpcomingProgramMedia(file: File): Promise<UpcomingProgramsMediaOption> {
  const mime =
    UpcomingMediaMimeSchema.safeParse(file.type).data ??
    MIME_BY_EXTENSION[file.name.split('.').at(-1)?.toLowerCase() ?? ''];
  if (mime === undefined || file.size === 0 || file.size > UPCOMING_MEDIA_MAX_BYTES) {
    throw new Error('Unsupported program media');
  }
  if (mime.startsWith('image/')) {
    const picture = await createImageBitmap(file);
    picture.close();
    const stored = await upload(file, file.name, mime);
    return {
      assetId: stored.assetId,
      kind: 'image',
      label: file.name,
      thumbnailUrl: stored.dataUrl,
    };
  }
  const poster = await videoPoster(file);
  const [stored, still] = await Promise.all([
    upload(file, file.name, mime),
    upload(poster, `${file.name} poster`, 'image/jpeg'),
  ]);
  return {
    assetId: stored.assetId,
    kind: 'video',
    label: file.name,
    posterAssetId: still.assetId,
    thumbnailUrl: still.dataUrl,
  };
}
