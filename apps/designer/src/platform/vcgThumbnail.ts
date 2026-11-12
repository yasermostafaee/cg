import { activeRangeOf, type AssetEntry, type Scene } from '@cg/shared-schema';
import {
  BASELINE_CSS,
  buildThumbnailScene,
  vcgThumbnailFrame,
} from '@cg/template-runtime/static-scene';
import { attachRobustVideoPoster } from '../shared/video-poster.js';

export { vcgThumbnailFrame };

const WIDTH = 320;
const HEIGHT = 180;
const MAX_VIDEO_BYTES = 8 * 1024 * 1024;
const MAX_RASTER_ASSETS = 8;
const FALLBACK_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAUAAAAC0AQMAAADfKmdSAAAABlBMVEUWICyFn7n4VyNdAAAATUlEQVR4nO3WoRGAQAxFwXRAA8zQxvVfERL3GUo4lQN2RdRTiUkVAAAfcCTJ1RLuzxjCX4RbcjaF9YL1NIYus2roMkLhVNj4zgAAsLwbatNKaBRCkdkAAAAASUVORK5CYII=';

function bytesFromBase64(encoded: string): Uint8Array {
  return Uint8Array.from(atob(encoded), (byte) => byte.charCodeAt(0));
}

function visibleInStill(node: HTMLElement, root: HTMLElement): boolean {
  for (
    let part: HTMLElement | null = node;
    part !== null && part !== root;
    part = part.parentElement
  ) {
    if (part.style.display === 'none' || part.style.opacity === '0' || part.hidden) return false;
  }
  return true;
}

async function decodeImage(url: string): Promise<HTMLImageElement | null> {
  const image = new Image();
  image.src = url;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      image.decode().then(
        () => image,
        () => null,
      ),
      new Promise<null>((resolve) => {
        timeout = setTimeout(() => resolve(null), 400);
      }),
    ]);
  } finally {
    clearTimeout(timeout);
  }
}

function rasterStill(
  media: HTMLImageElement | HTMLVideoElement,
  width: number,
  height: number,
): string | null {
  if (width < 1 || height < 1) return null;
  const scale = Math.min(1, WIDTH / width, HEIGHT / height);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const ctx = canvas.getContext('2d');
  if (ctx === null) return null;
  ctx.drawImage(media, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/png');
}

async function assetStill(
  entry: AssetEntry,
  bytes: Uint8Array,
  atMs: number,
): Promise<string | null> {
  if (entry.kind === 'video' && bytes.byteLength > MAX_VIDEO_BYTES) return null;
  const url = URL.createObjectURL(new Blob([Uint8Array.from(bytes).buffer], { type: entry.mime }));
  try {
    if (entry.kind === 'image') {
      const image = await decodeImage(url);
      return image === null ? null : rasterStill(image, image.naturalWidth, image.naturalHeight);
    }
    const video = document.createElement('video');
    const cancel = new AbortController();
    const timeout = setTimeout(() => cancel.abort(), 650);
    try {
      const poster = await attachRobustVideoPoster(video, url, Math.max(1, atMs), cancel.signal);
      return poster.ok ? rasterStill(video, video.videoWidth, video.videoHeight) : null;
    } finally {
      clearTimeout(timeout);
      video.removeAttribute('src');
      video.load();
    }
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function embedMedia(
  root: HTMLElement,
  assetIndex: readonly AssetEntry[],
  assets: ReadonlyMap<string, Uint8Array>,
  atMs: number,
): Promise<void> {
  const sources = new Map(assetIndex.map((entry) => [entry.id, entry]));
  const rendered = new Map<string, string | null>();
  let usedVideo = false;
  for (const media of Array.from(
    root.querySelectorAll<HTMLImageElement | HTMLVideoElement>('img, video'),
  )) {
    const id = media.dataset['cgAssetId'];
    const entry = id === undefined ? undefined : sources.get(id);
    const bytes = entry === undefined ? undefined : assets.get(entry.path);
    if (entry === undefined || bytes === undefined || !visibleInStill(media, root)) {
      media.remove();
      continue;
    }
    if (
      !rendered.has(entry.id) &&
      rendered.size < MAX_RASTER_ASSETS &&
      (entry.kind === 'image' || (entry.kind === 'video' && !usedVideo))
    ) {
      if (entry.kind === 'video') usedVideo = true;
      rendered.set(entry.id, await assetStill(entry, bytes, atMs));
    }
    const src = rendered.get(entry.id);
    if (src == null) {
      media.remove();
    } else if (media.localName === 'img') {
      media.setAttribute('src', src);
    } else {
      const still = root.ownerDocument.createElement('img');
      still.className = media.className;
      still.style.cssText = media.style.cssText;
      still.alt = '';
      still.src = src;
      media.replaceWith(still);
    }
  }
  root.querySelectorAll('audio').forEach((media) => media.remove());
}

/** Rasterize the authored still. A canvas-less export still gets the standard PNG placeholder. */
export async function renderVcgThumbnail(
  scene: Scene,
  assetIndex: readonly AssetEntry[],
  assets: ReadonlyMap<string, Uint8Array>,
  css: string,
): Promise<Uint8Array> {
  const fallback = () => bytesFromBase64(FALLBACK_PNG);
  if (typeof document === 'undefined' || typeof Image === 'undefined') return fallback();
  try {
    const canvas = document.createElement('canvas');
    canvas.width = WIDTH;
    canvas.height = HEIGHT;
    const context = canvas.getContext('2d');
    if (context === null) return fallback();

    const doc = document.implementation.createHTMLDocument('');
    const container = buildThumbnailScene(scene, doc);
    const frame = vcgThumbnailFrame(scene);
    await embedMedia(
      container,
      assetIndex,
      assets,
      ((frame - activeRangeOf(scene).in) / scene.frameRate) * 1000,
    );

    const stage = doc.createElement('div');
    const sheet = doc.createElement('style');
    sheet.textContent = `* { box-sizing: border-box } ${BASELINE_CSS}\n${css}`;
    stage.append(sheet, container);
    const { width, height } = scene.resolution;
    const artwork = new XMLSerializer().serializeToString(stage);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${width} ${height}"><foreignObject width="${width}" height="${height}">${artwork}</foreignObject></svg>`;
    const picture = await decodeImage(
      `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
    );
    if (picture === null) return fallback();
    context.drawImage(picture, 0, 0, WIDTH, HEIGHT);
    const pixels = context.getImageData(0, 0, WIDTH, HEIGHT).data;
    if (!pixels.some((alpha, i) => i % 4 === 3 && alpha > 0)) return fallback();
    const png = canvas.toDataURL('image/png').split(',')[1];
    return png ? bytesFromBase64(png) : fallback();
  } catch {
    return fallback();
  }
}
