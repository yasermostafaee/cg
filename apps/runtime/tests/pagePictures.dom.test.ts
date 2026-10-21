/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ensurePicture,
  holdsPicture,
  pageExtOf,
  pictureDataUrl,
  pictureMissing,
  rememberPicture,
  resetPicturesForTest,
} from '../src/renderer/features/book/pagePictures.js';

/**
 * 🔴 `RUN-NEXT-VERSION-03` 1.1 — the console's book pictures: the bytes it sent, else the bridge's own
 * copy read back once (`pages.get`), else a page that cannot be shown. Drawn by PVW as `data:` URLs.
 */

/** A PNG header the probe reads (24 bytes + a tail), so `rememberPicture` knows its type. */
function png(seed: number): Uint8Array {
  return new Uint8Array([
    0x89,
    0x50,
    0x4e,
    0x47,
    0x0d,
    0x0a,
    0x1a,
    0x0a,
    0,
    0,
    0,
    13,
    0x49,
    0x48,
    0x44,
    0x52,
    0,
    0,
    0,
    64,
    0,
    0,
    0,
    36,
    8,
    2,
    0,
    0,
    0,
    seed,
  ]);
}
const SHA = (n: number): string => n.toString(16).padStart(64, '0');
const get = vi.fn();

function stubBridge(): void {
  (window as unknown as { cg: unknown }).cg = { pages: { get } };
}

afterEach(() => {
  resetPicturesForTest();
  get.mockReset();
});

describe('1.1 — a picture this console sent is drawn without asking the bridge', () => {
  it('the bytes sent are held under the bridge’s hash, as a data: URL of their own type', async () => {
    stubBridge();
    rememberPicture(SHA(1), png(1));
    expect(holdsPicture(SHA(1))).toBe(true);
    const url = await pictureDataUrl(SHA(1));
    expect(url?.startsWith('data:image/png;base64,')).toBe(true);
    expect(get).not.toHaveBeenCalled();
    expect(pageExtOf(url ?? '')).toBe('png');
  });
});

describe('1.1 — a picture this console did not send is read back from CG Bridge once', () => {
  it('🔴 read back by its hash, then held: a second ask does not go to the bridge', async () => {
    stubBridge();
    get.mockResolvedValue({
      ok: true,
      base64: btoa(String.fromCharCode(...png(2))),
      mime: 'image/png',
    });
    expect(await ensurePicture(SHA(2))).toBe(true);
    expect(get).toHaveBeenCalledWith({ sha256: SHA(2) });
    expect(await pictureDataUrl(SHA(2))).toMatch(/^data:image\/png;base64,/);
    expect(get).toHaveBeenCalledTimes(1);
  });

  it('a picture the bridge does not hold is missing — asked once, and never drawn', async () => {
    stubBridge();
    get.mockResolvedValue({ ok: false, reason: 'no-page' });
    expect(await pictureDataUrl(SHA(3))).toBeNull();
    expect(pictureMissing(SHA(3))).toBe(true);
    expect(await ensurePicture(SHA(3))).toBe(false);
    expect(get).toHaveBeenCalledTimes(1);
  });

  it('a dropped socket is not "missing": the next ask tries again', async () => {
    stubBridge();
    get.mockRejectedValueOnce(new Error('socket closed'));
    expect(await ensurePicture(SHA(4))).toBe(false);
    expect(pictureMissing(SHA(4))).toBe(false);
    get.mockResolvedValue({
      ok: true,
      base64: btoa(String.fromCharCode(...png(4))),
      mime: 'image/png',
    });
    expect(await ensurePicture(SHA(4))).toBe(true);
  });
});
