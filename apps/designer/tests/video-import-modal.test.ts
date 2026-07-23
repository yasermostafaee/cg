/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StrictMode, act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { AssetMeta } from '@cg/shared-ipc';

/**
 * D-128 Phase 2 — the video import modal's state machine
 * (probing → ready → converting → done/cancelled/error), the crop-rect ↔ numeric
 * two-way sync, decision (d)'s fps warning, and the store-before-element order
 * (a half-converted asset can never be committed: `storeBytes` is only reached
 * from a successful convert, and `onDone` only after `storeBytes` resolves).
 */

// The wasm-touching converter module is mocked wholesale — the modal lazy-imports
// it, and vitest serves this mock for both static and dynamic imports.
const probeSource = vi.fn();
const convertToWebm = vi.fn();
const cancelConversion = vi.fn();
const measureDurationMs = vi.fn();
vi.mock('../src/renderer/features/assets/video-convert.js', () => ({
  probeSource,
  convertToWebm,
  cancelConversion,
  measureDurationMs,
}));

import { VideoImportModal } from '../src/renderer/features/assets/VideoImportModal.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const PROBE = { fps: 29.97, width: 640, height: 360, durationMs: 4000 };
const FILE = { name: 'archive-clip.avi' } as unknown as File;
const STORED_ASSET: AssetMeta = {
  assetId: 'asset-new',
  kind: 'video',
  filename: 'archive-clip.webm',
  sha256: 'c'.repeat(64),
  byteSize: 10,
  workingPath: 'projects/p/assets/video/z.webm',
};

const storeBytes = vi.fn();

let root: Root | null = null;
let container: HTMLDivElement | null = null;
const onClose = vi.fn();
const onDone = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  probeSource.mockResolvedValue({ ok: true, probe: PROBE, posterUrl: 'blob:poster' });
  measureDurationMs.mockResolvedValue(4000);
  storeBytes.mockResolvedValue({ asset: STORED_ASSET });
  (window as unknown as { cg: unknown }).cg = { assets: { storeBytes } };
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
    root!.render(createElement(VideoImportModal, { file: FILE, onClose, onDone }));
  });
  // let the lazy import + probe promise settle
  await act(async () => {
    await Promise.resolve();
  });
}

function button(label: string): HTMLButtonElement {
  const all = [...document.querySelectorAll('button')];
  const hit = all.find((b) => b.textContent?.includes(label));
  if (hit === undefined) throw new Error(`no button "${label}"`);
  return hit;
}

function cropToggle(): HTMLInputElement {
  const el = document.querySelector('[data-testid="video-crop-toggle"]');
  if (el === null) throw new Error('no crop toggle');
  return el as HTMLInputElement;
}

function numericInput(label: string): HTMLInputElement {
  const el = document.querySelector(`input[aria-label="Crop ${label}"]`);
  if (el === null) throw new Error(`no numeric Crop ${label}`);
  return el as HTMLInputElement;
}

describe('VideoImportModal (D-128)', () => {
  it('probes on open, shows the source metadata and the decision-(d) fps warning', async () => {
    await renderModal();
    // the probe is abort-aware: the effect threads its AbortSignal through
    expect(probeSource).toHaveBeenCalledWith(FILE, { signal: expect.any(AbortSignal) });
    const meta = document.querySelector('[data-testid="video-probe-meta"]');
    expect(meta?.textContent).toContain('640×360');
    expect(meta?.textContent).toContain('29.97 fps');
    // scene is null in this harness → project fps falls back to 50 ≠ 29.97 → warn
    expect(document.body.textContent).toContain("conforming to the project channel's 50 fps");
    expect(document.body.textContent).toContain('judder');
  });

  it('StrictMode double-mount ABORTS the first probe via cleanup; the survivor drives the modal to a working import (D-128 race guard)', async () => {
    // StrictMode double-invokes the mount effect (mount → cleanup → mount) —
    // the exact mechanism that manufactured the field race. The cleanup must
    // CANCEL its in-flight probe (abort the signal), not merely ignore it, so
    // no orphaned probe races the survivor inside the converter.
    const signals: (AbortSignal | undefined)[] = [];
    // The REAL probeSource contract: an aborted probe REJECTS (AbortError);
    // only a live one resolves. The first StrictMode probe therefore takes the
    // modal's catch path — which must stay SILENT (alive=false), never surface
    // as "converter crashed".
    probeSource.mockImplementation((_file: File, o?: { signal?: AbortSignal }) => {
      const signal = o?.signal;
      signals.push(signal);
      return new Promise((resolve, reject) => {
        const rejectAbort = (): void => {
          reject(new DOMException('The operation was aborted.', 'AbortError'));
        };
        if (signal?.aborted === true) {
          rejectAbort();
          return;
        }
        signal?.addEventListener('abort', rejectAbort, { once: true });
        setTimeout(() => {
          signal?.removeEventListener('abort', rejectAbort);
          resolve({ ok: true, probe: PROBE, posterUrl: 'blob:poster' });
        }, 0);
      });
    });
    convertToWebm.mockResolvedValue(new Uint8Array([7]));

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root!.render(
        createElement(
          StrictMode,
          null,
          createElement(VideoImportModal, { file: FILE, onClose, onDone }),
        ),
      );
    });
    await act(async () => {
      // let the lazy imports + probe promises settle — the SECOND dynamic
      // import of an already-loaded module resolves on a macrotask in vitest,
      // so a bare Promise.resolve() flush is not enough here
      await new Promise((r) => setTimeout(r, 0));
    });

    // Both StrictMode mounts probed, each with its OWN signal…
    expect(probeSource).toHaveBeenCalledTimes(2);
    expect(signals).toHaveLength(2);
    // …the FIRST was aborted by its cleanup (no live orphan left behind)…
    expect(signals[0]?.aborted).toBe(true);
    // …and the SURVIVOR was not.
    expect(signals[1]?.aborted).toBe(false);

    // The aborted probe's REJECTION was swallowed silently — the modal never
    // shows either failure callout for a cancelled mount's probe.
    expect(document.body.textContent).not.toContain('does NOT mean');
    expect(document.body.textContent).not.toContain('could not be read as a video');

    // The modal reached ready on the survivor and a full import still works.
    await act(async () => {
      button('Convert & import').click();
    });
    expect(storeBytes).toHaveBeenCalledTimes(1);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('a genuine no-stream failure names the file AND shows the ffmpeg log tail', async () => {
    probeSource.mockResolvedValue({
      ok: false,
      reason: 'no-stream',
      logTail: ['[avi @ 0x1] Format avi detected only with low score of 1', 'Invalid data found'],
    });
    await renderModal();
    expect(document.body.textContent).toContain('could not be read as a video');
    const log = document.querySelector('[data-testid="video-probe-log"]');
    expect(log?.textContent).toContain('Invalid data found');
    expect(button('Convert & import').disabled).toBe(true);
  });

  it('a converter crash shows the reload message and NEVER blames the file', async () => {
    probeSource.mockResolvedValue({
      ok: false,
      reason: 'converter-crashed',
      logTail: ['ErrnoError: FS error'],
    });
    await renderModal();
    // the poisoned-worker path must not read as "unsupported format"
    expect(document.body.textContent).not.toContain('could not be read as a video');
    expect(document.body.textContent).toContain('does NOT mean');
    expect(document.body.textContent).toContain('try the import again');
    expect(document.querySelector('[data-testid="video-probe-log"]')?.textContent).toContain(
      'FS error',
    );
    expect(button('Convert & import').disabled).toBe(true);
  });

  it('a poster-less probe still imports (numeric-only crop, no preview image)', async () => {
    probeSource.mockResolvedValue({ ok: true, probe: PROBE, posterUrl: null });
    convertToWebm.mockResolvedValue(new Uint8Array([7]));
    await renderModal();
    expect(document.querySelector('img')).toBeNull(); // no preview frame
    expect(button('Convert & import').disabled).toBe(false);
    act(() => {
      cropToggle().click(); // numeric crop fields still available
    });
    expect(numericInput('X')).not.toBeNull();
    await act(async () => {
      button('Convert & import').click();
    });
    expect(storeBytes).toHaveBeenCalled();
  });

  it('a source with Duration: N/A measures the CONVERTED clip instead', async () => {
    probeSource.mockResolvedValue({
      ok: true,
      probe: { ...PROBE, durationMs: 0 },
      posterUrl: 'blob:poster',
    });
    convertToWebm.mockResolvedValue(new Uint8Array([7]));
    measureDurationMs.mockResolvedValue(3210);
    await renderModal();
    await act(async () => {
      button('Convert & import').click();
    });
    expect(measureDurationMs).toHaveBeenCalled();
    expect(onDone).toHaveBeenCalledWith(expect.objectContaining({ durationMs: 3210 }));
  });

  it('crop numeric fields drive the rect (numbers → rectangle sync)', async () => {
    await renderModal();
    act(() => {
      cropToggle().click();
    });
    const rect = document.querySelector('[data-testid="video-crop-rect"]') as HTMLElement;
    expect(rect).not.toBeNull();
    // full frame initially; preview scale for a 640×360 source in a 480×300 box is 0.75
    expect(rect.style.left).toBe('0px');
    expect(rect.style.width).toBe('480px');

    const setNum = (label: string, value: string): void => {
      act(() => {
        const input = numericInput(label);
        input.focus();
        const setVal = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
        setVal.call(input, value);
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });
    };
    // The clamp keeps SIZE and pushes POSITION back inside bounds (the canvas
    // convention), so a full-width rect must shrink before it can move.
    setNum('X', '100');
    expect(rect.style.left).toBe('0px'); // clamped back — width still fills the frame
    setNum('W', '320');
    setNum('X', '100');
    expect(rect.style.left).toBe('75px'); // 100 source px × 0.75 preview scale
    expect(rect.style.width).toBe('240px'); // 320 × 0.75
    expect(Number(numericInput('W').value)).toBe(320);
  });

  it('dragging the rect drives the numbers (rectangle → numbers sync)', async () => {
    await renderModal();
    act(() => {
      cropToggle().click();
    });
    // shrink first so the rect has room to move
    act(() => {
      const w = numericInput('W');
      w.focus();
      const setVal = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      setVal.call(w, '320');
      w.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const rect = document.querySelector('[data-testid="video-crop-rect"]') as HTMLElement;
    const down = new MouseEvent('pointerdown', {
      bubbles: true,
      clientX: 10,
      clientY: 10,
      button: 0,
    });
    act(() => {
      rect.dispatchEvent(down);
    });
    act(() => {
      // +75px screen at scale 0.75 = +100 source px
      window.dispatchEvent(new MouseEvent('pointermove', { clientX: 85, clientY: 10 }));
      window.dispatchEvent(new MouseEvent('pointerup', {}));
    });
    expect(Number(numericInput('X').value)).toBe(100);
  });

  it('converting: progress renders, cancel terminates and returns to ready (no error)', async () => {
    let progressCb: ((r: number) => void) | undefined;
    let resolveConvert!: (v: Uint8Array | null) => void;
    convertToWebm.mockImplementation(
      (opts: { onProgress?: (r: number) => void }) =>
        new Promise((res) => {
          progressCb = opts.onProgress;
          resolveConvert = res;
        }),
    );
    await renderModal();
    act(() => {
      button('Convert & import').click();
    });
    act(() => {
      progressCb?.(0.5);
    });
    const fill = document.querySelector('[data-testid="video-progress-fill"]') as HTMLElement;
    expect(fill.style.width).toBe('50%');
    expect(button('Converting…').disabled).toBe(true);

    act(() => {
      button('Cancel conversion').click();
    });
    expect(cancelConversion).toHaveBeenCalled();
    await act(async () => {
      resolveConvert(null); // a terminated exec resolves null
    });
    // back to READY — no error callout, storeBytes never touched
    expect(document.body.textContent).not.toContain('Conversion failed');
    expect(storeBytes).not.toHaveBeenCalled();
    expect(button('Convert & import').disabled).toBe(false);
  });

  it('a cancel that lands AFTER the encode finishes still cancels — nothing stored, back to ready', async () => {
    // The window the converter cannot cover: convertToWebm has already
    // resolved WITH bytes when the operator's cancel arrives. The modal must
    // honor the acknowledged cancel — never commit the asset anyway.
    let resolveConvert!: (v: Uint8Array | null) => void;
    convertToWebm.mockImplementation(
      () =>
        new Promise<Uint8Array | null>((res) => {
          resolveConvert = res;
        }),
    );
    await renderModal();
    act(() => {
      button('Convert & import').click();
    });
    act(() => {
      button('Cancel conversion').click(); // cancel FIRST…
    });
    await act(async () => {
      resolveConvert(new Uint8Array([7])); // …then the encode finishes WITH bytes
    });
    expect(storeBytes).not.toHaveBeenCalled();
    expect(onDone).not.toHaveBeenCalled();
    expect(button('Convert & import').disabled).toBe(false); // back to ready
  });

  it('a failed (uncancelled) convert surfaces an error and commits nothing', async () => {
    convertToWebm.mockResolvedValue(null);
    await renderModal();
    await act(async () => {
      button('Convert & import').click();
    });
    expect(document.body.textContent).toContain('Conversion failed');
    expect(storeBytes).not.toHaveBeenCalled();
    expect(onDone).not.toHaveBeenCalled();
  });

  it('success: stores the WebM WITH provenance (incl. the baked crop), THEN reports done', async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    convertToWebm.mockResolvedValue(bytes);
    await renderModal();
    act(() => {
      cropToggle().click();
    });
    for (const [label, value] of [
      ['W', '320'],
      ['X', '100'],
    ] as const) {
      act(() => {
        const input = numericInput(label);
        input.focus();
        const setVal = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
        setVal.call(input, value);
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });
    }
    await act(async () => {
      button('Convert & import').click();
    });
    expect(convertToWebm).toHaveBeenCalledWith(
      expect.objectContaining({
        file: FILE,
        targetFps: 50,
        crop: { x: 100, y: 0, width: 320, height: 360 },
      }),
    );
    expect(storeBytes).toHaveBeenCalledWith({
      bytes,
      filename: 'archive-clip.webm',
      kind: 'video',
      provenance: {
        sourceFilename: 'archive-clip.avi',
        sourceFps: 29.97,
        targetFps: 50,
        sourceWidth: 640,
        sourceHeight: 360,
        crop: { x: 100, y: 0, width: 320, height: 360 },
      },
    });
    expect(onDone).toHaveBeenCalledWith({
      asset: STORED_ASSET,
      durationMs: 4000,
      width: 320, // post-crop dimensions
      height: 360,
    });
  });

  it('no crop marked ⇒ full-frame conversion, provenance without a crop rect', async () => {
    convertToWebm.mockResolvedValue(new Uint8Array([9]));
    await renderModal();
    await act(async () => {
      button('Convert & import').click();
    });
    expect(convertToWebm).toHaveBeenCalledWith(expect.objectContaining({ crop: undefined }));
    const prov = (storeBytes.mock.calls[0]?.[0] as { provenance: object }).provenance;
    expect('crop' in prov).toBe(false);
    expect(onDone).toHaveBeenCalledWith(
      expect.objectContaining({ width: 640, height: 360 }), // full source frame
    );
  });
});
