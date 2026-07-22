/**
 * D-128 Phase 2 — the wasm-touching half of the in-app video converter.
 *
 * DELIVERY (design.md "Phase-1 spike results", decision (k)): npm-delivered,
 * SAME-ORIGIN, LAZY, never a CDN. The single-threaded `@ffmpeg/core` js+wasm are
 * Vite `?url` build assets (emitted into `dist/assets/`, fetched same-origin by
 * `toBlobURL`); the `@ffmpeg/ffmpeg` wrapper spawns its module worker itself
 * (`new Worker(new URL('./worker.js', import.meta.url))` — kept intact by the
 * `optimizeDeps.exclude` in vite.config.ts). Nothing here loads at Designer
 * startup: this MODULE is only ever `await import()`ed from the import modal,
 * and the core loads on first use (PRD acceptance: wasm lazy, zero network).
 *
 * MEMORY (C2/spike-proven): the picked source File is WORKERFS-mounted — read
 * lazily inside the worker, never copied whole into JS/wasm memory (1.93 GB
 * source → 3.00 MB peak JS heap in the Phase-1 measurement).
 */

import { FFmpeg } from '@ffmpeg/ffmpeg';
import { toBlobURL } from '@ffmpeg/util';
// The package's exports map exposes exactly these two subpaths (`.` → the ESM
// core js, `./wasm` → the 32 MB wasm); `?url` turns each into a same-origin
// Vite build asset instead of a bundled module.
import coreJsUrl from '@ffmpeg/core?url';
import coreWasmUrl from '@ffmpeg/core/wasm?url';
import {
  buildConvertArgs,
  buildPosterArgs,
  parseProbeLog,
  type CropRect,
  type SourceProbe,
} from './video-convert-args.js';

const MOUNT_DIR = '/mnt';

let instance: FFmpeg | null = null;
let logSink: ((line: string) => void) | null = null;
let progressSink: ((ratio: number) => void) | null = null;

/**
 * Kill and forget the cached worker. Called on EVERY failure path: a hard
 * ffmpeg abort taints the wasm runtime, and any later FS call on a tainted
 * instance throws `ErrnoError: FS error` — which is exactly how a failed
 * first import used to poison the second one. A fresh load costs ~150–350 ms;
 * a poisoned singleton costs the operator their next import.
 */
function resetInstance(): void {
  try {
    instance?.terminate();
  } catch {
    /* already dead */
  }
  instance = null;
}

async function ensureLoaded(): Promise<FFmpeg> {
  if (instance !== null) return instance;
  const ff = new FFmpeg();
  ff.on('log', ({ message }) => logSink?.(message));
  ff.on('progress', ({ progress }) => progressSink?.(progress));
  await ff.load({
    // Same-origin fetches of the Vite-emitted assets, wrapped as blob URLs (the
    // worker `import()`s the core, and a blob works because the Emscripten core
    // is self-contained). No request ever leaves this origin.
    coreURL: await toBlobURL(coreJsUrl, 'text/javascript'),
    wasmURL: await toBlobURL(coreWasmUrl, 'application/wasm'),
  });
  instance = ff;
  return ff;
}

async function mountSource(ff: FFmpeg, file: File): Promise<string> {
  try {
    await ff.createDir(MOUNT_DIR);
  } catch {
    /* already exists from a prior run */
  }
  try {
    await ff.unmount(MOUNT_DIR);
  } catch {
    /* nothing mounted yet */
  }
  await ff.mount('WORKERFS' as Parameters<FFmpeg['mount']>[0], { files: [file] }, MOUNT_DIR);
  return `${MOUNT_DIR}/${file.name}`;
}

export type ProbeResult =
  | { ok: true; probe: SourceProbe; posterUrl: string | null }
  | {
      ok: false;
      /**
       * WHY the probe failed — the two paths must never share one message:
       * `no-stream` = ffmpeg genuinely found no decodable video in THIS file
       * (the log tail names the codec/container reason); `converter-crashed` =
       * OUR worker died (FS error / abort) — the file may be perfectly fine,
       * so the UI must not blame it (the pre-fix bug read every post-crash
       * import as "unsupported format").
       */
      reason: 'no-stream' | 'converter-crashed';
      logTail: string[];
    };

/**
 * Probe a picked source: fps / dimensions / duration from ffmpeg's banner log,
 * plus a first-frame PNG for the modal's crop preview. The probe exec exits
 * non-zero BY DESIGN (no output file) — the log carries the metadata.
 *
 * Resilience rules (from the first real-archive attempt): a failed POSTER
 * extraction downgrades to `posterUrl: null` (numeric crop still works); only a
 * source with NO parseable video stream fails — and then the ffmpeg log tail
 * travels with the failure so the operator sees WHY, not a dead end.
 */
export async function probeSource(file: File): Promise<ProbeResult> {
  const lines: string[] = [];
  try {
    const ff = await ensureLoaded();
    const input = await mountSource(ff, file);
    logSink = (l) => lines.push(l);
    await ff.exec(['-i', input]).catch(() => 1);
    const probe = parseProbeLog(lines);
    if (probe === null) {
      // No parseable video stream — and quite possibly a hard ffmpeg abort that
      // tainted the wasm runtime. Never cache a maybe-dead worker.
      resetInstance();
      return { ok: false, reason: 'no-stream', logTail: lines.slice(-8) };
    }
    let posterUrl: string | null = null;
    try {
      const posterPath = '/poster.png';
      const code = await ff.exec(buildPosterArgs(input, posterPath));
      if (code === 0) {
        const png = await ff.readFile(posterPath);
        await ff.deleteFile(posterPath).catch(() => undefined);
        const bytes = typeof png === 'string' ? new TextEncoder().encode(png) : png;
        const ab = new ArrayBuffer(bytes.byteLength);
        new Uint8Array(ab).set(bytes);
        posterUrl = URL.createObjectURL(new Blob([ab], { type: 'image/png' }));
      }
    } catch {
      // Preview-less import beats no import — but a THROW here means the
      // runtime is suspect; drop it so the actual conversion starts fresh.
      resetInstance();
      posterUrl = null;
    }
    // Success-path FS hygiene: leave nothing mounted between calls (the
    // conversion re-mounts via mountSource; a later import starts clean).
    if (instance !== null) {
      try {
        await instance.unmount(MOUNT_DIR);
      } catch {
        /* nothing mounted / already gone */
      }
    }
    return { ok: true, probe, posterUrl };
  } catch (err) {
    // Any FS/exec throw (ErrnoError etc.) — the worker is dead or dying.
    resetInstance();
    return { ok: false, reason: 'converter-crashed', logTail: [...lines.slice(-6), String(err)] };
  } finally {
    logSink = null;
  }
}

/**
 * Measure a converted WebM's duration from the bytes themselves (`<video>`
 * metadata) — authoritative when the SOURCE banner said `Duration: N/A`.
 * Returns 0 when the clip can't be decoded (callers must reject a 0 duration
 * before committing an element).
 */
export function measureDurationMs(bytes: Uint8Array): Promise<number> {
  const ab = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(ab).set(bytes);
  const url = URL.createObjectURL(new Blob([ab], { type: 'video/webm' }));
  return new Promise((resolve) => {
    const v = document.createElement('video');
    v.preload = 'metadata';
    v.muted = true;
    v.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve(Number.isFinite(v.duration) ? Math.round(v.duration * 1000) : 0);
    };
    v.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(0);
    };
    v.src = url;
  });
}

/**
 * Convert the mounted source to the ONE canonical stored form — VP8+alpha WebM,
 * audio stripped, optional crop BAKED, conformed to the project frame rate.
 * Progress streams via `onProgress`; `cancelConversion()` terminates the worker
 * (the next call re-loads and re-mounts — a cancel can never wedge the module).
 */
export async function convertToWebm(opts: {
  file: File;
  targetFps: number;
  crop?: CropRect | undefined;
  onProgress?: ((ratio: number) => void) | undefined;
}): Promise<Uint8Array<ArrayBuffer> | null> {
  const output = '/out.webm';
  progressSink = opts.onProgress ?? null;
  try {
    const ff = await ensureLoaded();
    const input = await mountSource(ff, opts.file);
    const code = await ff.exec(
      buildConvertArgs({
        inputPath: input,
        outputPath: output,
        targetFps: opts.targetFps,
        crop: opts.crop,
      }),
    );
    if (code !== 0) {
      // Failed or cancelled. A non-zero exit can follow a hard abort that
      // tainted the runtime — never keep a maybe-dead worker cached.
      resetInstance();
      return null;
    }
    const data = await ff.readFile(output);
    const raw = typeof data === 'string' ? new TextEncoder().encode(data) : data;
    // Copy onto a plain ArrayBuffer so the bytes own their backing store (and
    // satisfy the channel's `Uint8Array<ArrayBuffer>` shape).
    const out = new Uint8Array(raw.byteLength);
    out.set(raw);
    // Success-path FS hygiene: drop the output and the input mount so no FS
    // state leaks into the next import.
    await ff.deleteFile(output).catch(() => undefined);
    try {
      await ff.unmount(MOUNT_DIR);
    } catch {
      /* nothing mounted / already gone */
    }
    return out;
  } catch {
    // terminate() (cancel) or a worker crash surfaces here — the instance is dead.
    resetInstance();
    return null;
  } finally {
    progressSink = null;
  }
}

/** Hard-cancel an in-flight conversion. The wasm worker dies; state resets. */
export function cancelConversion(): void {
  resetInstance();
}

/** TEST-ONLY — whether a worker instance is currently cached (the reset contract). */
export function hasCachedInstanceForTest(): boolean {
  return instance !== null;
}
