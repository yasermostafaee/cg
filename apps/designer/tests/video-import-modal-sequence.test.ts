/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { AssetMeta } from '@cg/shared-ipc';

/**
 * 🔴 `D-164` — **AN IMAGE SEQUENCE THROUGH THE SAME IMPORT MODAL AS A CLIP.** One video asset, the
 * provenance that says it was a sequence, progress counted in the sequence's own frames, the dedupe
 * key that knows the rate — and a cancel that stores nothing. The converter is mocked exactly as
 * `video-import-modal.test.ts` mocks it; the clip cases there are unchanged.
 */

const probeSource = vi.fn();
const convertToWebm = vi.fn();
const cancelConversion = vi.fn();
const verifyConvertedClip = vi.fn();
const verifyStoredReadback = vi.fn();
const lastConvertLogTail = vi.fn();
const sampleSourceAlpha = vi.fn();
const sampleOutputAlphaStats = vi.fn();
const formatAlphaStats = vi.fn(() => 'stats');
vi.mock('../src/renderer/features/assets/video-convert.js', () => ({
  probeSource,
  convertToWebm,
  cancelConversion,
  verifyConvertedClip,
  verifyStoredReadback,
  lastConvertLogTail,
  sampleSourceAlpha,
  sampleOutputAlphaStats,
  formatAlphaStats,
}));

const { hashSourceFile, probeStoredVideo, verifyStoredPoster } = vi.hoisted(() => ({
  hashSourceFile: vi.fn(),
  probeStoredVideo: vi.fn(),
  verifyStoredPoster: vi.fn(),
}));
vi.mock('../src/renderer/features/assets/source-hash.js', () => ({ hashSourceFile }));
vi.mock('../src/renderer/features/assets/video-asset-probe.js', () => ({
  probeStoredVideo,
  verifyStoredPoster,
}));

import { VideoImportModal } from '../src/renderer/features/assets/VideoImportModal.js';
import {
  CONVERTER_REVISION,
  type ImageSequenceSource,
} from '../src/renderer/features/assets/video-convert-args.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const HEALTHY_ALPHA = {
  maxA: 255,
  meanA: 90,
  nonTransparentFrac: 0.4,
  opaqueFrac: 0.25,
  sampled: 1,
};
const frame = (name: string, size: number) => ({ name, size }) as unknown as File;
const F1 = frame('f_1.png', 100);
const F2 = frame('f_2.png', 200);
const F4 = frame('f_4.png', 400);
/** f_3 was missing, so f_2 is held in its slot (`framesToConvert`). */
const SOURCE: ImageSequenceSource = {
  kind: 'image-sequence',
  frames: [F1, F2, F2, F4],
  ext: 'png',
  fps: 25,
  label: 'f_1.png … f_4.png (3 frames)',
  assetName: 'f.webm',
  firstFile: 'f_1.png',
  lastFile: 'f_4.png',
};
const SOURCE_BYTES = 100 + 200 + 200 + 400;
// The image2 input at 25 fps: 4 frames = 160 ms.
const PROBE = { fps: 25, width: 64, height: 64, durationMs: 160 };
const STORED: AssetMeta = {
  assetId: 'asset-seq',
  kind: 'video',
  filename: 'f.webm',
  sha256: 'c'.repeat(64),
  byteSize: 10,
  workingPath: 'projects/p/assets/video/f.webm',
};

const storeBytes = vi.fn();
const assetsList = vi.fn();
const assetUrl = vi.fn();
let root: Root | null = null;
let container: HTMLDivElement | null = null;
const onClose = vi.fn();
const onDone = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  probeSource.mockResolvedValue({ ok: true, probe: PROBE, posterUrl: 'blob:poster' });
  verifyConvertedClip.mockResolvedValue({ ok: true, durationMs: 160, width: 64, height: 64 });
  verifyStoredReadback.mockResolvedValue(null);
  lastConvertLogTail.mockReturnValue([]);
  sampleSourceAlpha.mockResolvedValue(HEALTHY_ALPHA);
  sampleOutputAlphaStats.mockResolvedValue(HEALTHY_ALPHA);
  hashSourceFile.mockResolvedValue('a'.repeat(64));
  probeStoredVideo.mockResolvedValue({ durationMs: 160, width: 64, height: 64 });
  verifyStoredPoster.mockResolvedValue(null);
  assetsList.mockResolvedValue([]);
  assetUrl.mockResolvedValue('blob:stored');
  storeBytes.mockResolvedValue({ asset: STORED });
  (window as unknown as { cg: unknown }).cg = {
    assets: { storeBytes, list: assetsList, url: assetUrl },
  };
});

afterEach(() => {
  if (root !== null) act(() => root!.unmount());
  root = null;
  container?.remove();
  container = null;
});

async function renderModal(): Promise<void> {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(VideoImportModal, { file: SOURCE, onClose, onDone }));
  });
  await act(async () => {
    await Promise.resolve();
  });
}

function button(label: string): HTMLButtonElement {
  const hit = [...document.querySelectorAll('button')].find((b) => b.textContent?.includes(label));
  if (hit === undefined) throw new Error(`no button "${label}"`);
  return hit;
}

async function flush(): Promise<void> {
  for (let i = 0; i < 4; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

function existing(over: Partial<NonNullable<AssetMeta['provenance']>> = {}): AssetMeta {
  return {
    ...STORED,
    assetId: 'asset-prior',
    provenance: {
      sourceFilename: SOURCE.label,
      sourceFps: 25,
      targetFps: 50,
      sourceWidth: 64,
      sourceHeight: 64,
      sourceSha256: 'a'.repeat(64),
      sourceBytes: SOURCE_BYTES,
      converterRevision: CONVERTER_REVISION,
      premultipliedAlpha: false,
      alphaBleed: false,
      sequence: { firstFile: 'f_1.png', lastFile: 'f_4.png', frameCount: 4, fps: 25 },
      ...over,
    },
  };
}

describe('D-164 — an image sequence in the video import modal', () => {
  it('🔴 the SAME modal: probed as a source, titled and named as a sequence', async () => {
    await renderModal();
    expect(probeSource).toHaveBeenCalledWith(SOURCE, expect.anything());
    expect(document.body.textContent).toContain('Import image sequence');
    expect(document.body.textContent).not.toContain('Import video');
    expect(document.querySelector('[data-testid="video-probe-meta"]')?.textContent ?? '').toContain(
      'f_1.png … f_4.png (3 frames) — 64×64, 25 fps',
    );
  });

  it('🔴 ONE video asset, whose provenance says it was a sequence — first, last, count, rate', async () => {
    convertToWebm.mockResolvedValue(new Uint8Array([1, 2, 3]));
    await renderModal();
    await act(async () => {
      button('Convert & import').click();
    });
    await flush();
    expect(convertToWebm).toHaveBeenCalledWith(expect.objectContaining({ file: SOURCE }));
    // The provenance hash reads the frames IN ORDER, the held frame included.
    expect(hashSourceFile).toHaveBeenCalledWith(SOURCE.frames, expect.anything());
    expect(storeBytes).toHaveBeenCalledTimes(1);
    const req = storeBytes.mock.calls[0]![0] as {
      filename: string;
      kind: string;
      provenance: Record<string, unknown>;
    };
    expect(req.filename).toBe('f.webm');
    expect(req.kind).toBe('video');
    expect(req.provenance).toMatchObject({
      sourceFilename: 'f_1.png … f_4.png (3 frames)',
      sourceFps: 25,
      targetFps: 50,
      sourceBytes: SOURCE_BYTES,
      sourceSha256: 'a'.repeat(64),
      sequence: { firstFile: 'f_1.png', lastFile: 'f_4.png', frameCount: 4, fps: 25 },
    });
    await act(async () => {
      button('Place element').click();
    });
    expect(onDone).toHaveBeenCalledWith(
      expect.objectContaining({ asset: STORED, width: 64, height: 64 }),
    );
  });

  it("🔴 progress is counted in the SEQUENCE's frames, not in encoded ones", async () => {
    let onFrame: ((n: number) => void) | undefined;
    convertToWebm.mockImplementation(
      (opts: { onFrame?: (n: number) => void }) =>
        new Promise(() => {
          onFrame = opts.onFrame;
        }),
    );
    await renderModal();
    await act(async () => {
      button('Convert & import').click();
    });
    await flush();
    expect(onFrame).toBeTypeOf('function');
    expect(document.body.textContent).toContain('frame 0 of 4');
    // ffmpeg has ENCODED 4 frames at the project's 50 fps = 2 of the sequence's 25 fps frames.
    act(() => onFrame?.(4));
    expect(document.body.textContent).toContain('frame 2 of 4');
    act(() => onFrame?.(999));
    expect(document.body.textContent).toContain('frame 4 of 4'); // never past the last
  });

  it('🔴 dedupe: the same frames at the same rate are offered back — no second encode', async () => {
    assetsList.mockResolvedValue([existing()]);
    await renderModal();
    await act(async () => {
      button('Convert & import').click();
    });
    await flush();
    expect(convertToWebm).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain('already imported');
    expect(button('Use existing')).toBeTruthy();
  });

  it('the same frames at ANOTHER rate are a different clip — no up-front hash, straight to converting', async () => {
    convertToWebm.mockResolvedValue(new Uint8Array([1]));
    assetsList.mockResolvedValue([
      existing({ sequence: { firstFile: 'f_1.png', lastFile: 'f_4.png', frameCount: 4, fps: 50 } }),
    ]);
    await renderModal();
    await act(async () => {
      button('Convert & import').click();
    });
    await flush();
    expect(convertToWebm).toHaveBeenCalled();
    expect(document.body.textContent).not.toContain('Checking for a previous import');
    expect(hashSourceFile).toHaveBeenCalledTimes(1); // the deferred provenance hash only
  });

  it('🔴 Cancel during the conversion stores NOTHING and returns to the convert step', async () => {
    let resolveConvert!: (v: Uint8Array | null) => void;
    convertToWebm.mockImplementation(
      () =>
        new Promise((res) => {
          resolveConvert = res;
        }),
    );
    await renderModal();
    await act(async () => {
      button('Convert & import').click();
    });
    await flush();
    act(() => {
      button('Cancel conversion').click();
    });
    expect(cancelConversion).toHaveBeenCalled();
    await act(async () => {
      resolveConvert(null);
    });
    expect(storeBytes).not.toHaveBeenCalled();
    expect(onDone).not.toHaveBeenCalled();
    expect(button('Convert & import').disabled).toBe(false);
  });
});
