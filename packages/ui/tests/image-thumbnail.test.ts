import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearImageThumbnailCache, imageThumbnailUrl } from '../src/image-thumbnail.js';

function pngHeader(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(24);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  bytes.set([0x49, 0x48, 0x44, 0x52], 12);
  new DataView(bytes.buffer).setUint32(16, width);
  new DataView(bytes.buffer).setUint32(20, height);
  return bytes;
}

afterEach(() => {
  clearImageThumbnailCache();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('imageThumbnailUrl', () => {
  it('uses a real Blob WebP derivative in the desktop renderer instead of the original data URL', async () => {
    const bytes = pngHeader(1433, 804);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(new Blob([bytes]))));
    class FakeImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_value: string) {
        queueMicrotask(() => this.onload?.());
      }
    }
    vi.stubGlobal('Image', FakeImage);
    const drawImage = vi.fn();
    const toBlob = vi.fn((done: (blob: Blob | null) => void) =>
      done(new Blob([new Uint8Array([1, 2, 3])], { type: 'image/webp' })),
    );
    const canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => ({ drawImage })),
      toBlob,
    };
    vi.stubGlobal('document', { createElement: vi.fn(() => canvas) });
    vi.spyOn(URL, 'createObjectURL')
      .mockReturnValueOnce('blob:thumbnail-input')
      .mockReturnValueOnce('blob:thumbnail-output');
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);

    const sourceUrl = `data:image/png;base64,${btoa(String.fromCharCode(...bytes))}`;
    await expect(imageThumbnailUrl(sourceUrl)).resolves.toBe('blob:thumbnail-output');
    expect(canvas).toMatchObject({ width: 320, height: 180 });
    expect(drawImage).toHaveBeenCalledTimes(1);
    expect(toBlob).toHaveBeenCalledWith(expect.any(Function), 'image/webp', 0.78);
    expect(revoke).toHaveBeenCalledWith('blob:thumbnail-input');
  });

  it('decodes a large raster at card size and caches the WebP derivative', async () => {
    const bytes = pngHeader(1920, 1080);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(new Blob([bytes]))));
    const close = vi.fn();
    const create = vi.fn().mockResolvedValue({ width: 320, height: 180, close });
    vi.stubGlobal('createImageBitmap', create);
    const drawImage = vi.fn();
    const convertToBlob = vi.fn().mockResolvedValue(new Blob([new Uint8Array([1, 2, 3])]));
    vi.stubGlobal(
      'OffscreenCanvas',
      class {
        getContext(): { drawImage: typeof drawImage } {
          return { drawImage };
        }
        convertToBlob = convertToBlob;
      },
    );
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:thumbnail');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);

    await expect(imageThumbnailUrl('blob:original')).resolves.toBe('blob:thumbnail');
    await expect(imageThumbnailUrl('blob:original')).resolves.toBe('blob:thumbnail');
    expect(create).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith(
      expect.any(Blob),
      expect.objectContaining({ resizeWidth: 320, resizeHeight: 180 }),
    );
    expect(drawImage).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(1);
  });
});
