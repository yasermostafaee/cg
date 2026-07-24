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
 *
 * REENTRANCY (D-128 field bug, root-caused 2026-07-23): two probeSource calls
 * CAN run concurrently — React <StrictMode> double-invokes the modal's probe
 * effect in dev, and a fast close/reopen of the modal does the same in prod.
 * Racing on this module's old shared globals produced all three field symptoms
 * on the SAME good file (bogus "no-stream" from a stolen log sink; "ErrnoError:
 * FS error" from a cross-call terminate; success when the timing missed).
 * The module is now safe by construction, regardless of how many callers race:
 *
 *  1. ONE worker, single-flight: `ensureLoaded` shares one in-flight load
 *     promise, so concurrent callers can never construct two workers (the old
 *     check-then-act race orphaned a live worker).
 *  2. Per-call sinks: log/progress listeners are attached around each exec and
 *     detached in a `finally` — a verdict is computed ONLY from the caller's
 *     own exec's lines, never through a module-global sink another call can
 *     overwrite. (Worker messages are ordered, so every log line of an exec is
 *     delivered before that exec's promise resolves — the "truncated log" came
 *     from sink theft, not late flushing.)
 *  3. Caller-scoped reset: a failure path drops ONLY the worker that call was
 *     using (`dropWorker(held)`); it can never terminate a replacement worker a
 *     later call owns. `cancelConversion` stays an intentional hard interrupt.
 *  4. One operation at a time: probe/convert bodies run under a module mutex
 *     (`withExclusive`), because they share wasm FS paths (`/mnt`, /poster.png,
 *     /out.webm) on a single-threaded core — interleaved FS ops from two calls
 *     could still unmount each other's input mid-exec. Queued callers simply
 *     wait their turn.
 *
 * ABORT: `probeSource` takes an optional AbortSignal and REJECTS with the
 * signal's reason when aborted (checked between ops — a single-threaded wasm
 * exec cannot be interrupted mid-flight without terminating the worker, and an
 * abort must never kill a healthy shared worker). The modal's probe-effect
 * cleanup aborts, so a StrictMode unmount leaves no live probe behind.
 */

import { FFmpeg, type LogEvent, type ProgressEvent } from '@ffmpeg/ffmpeg';
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
  posterTimeMs,
  type CropRect,
  type SourceProbe,
} from './video-convert-args.js';

const MOUNT_DIR = '/mnt';

/** The one cached worker (kept across probe→convert WITHIN an import). */
let instance: FFmpeg | null = null;
/** Single-flight guard: the one in-flight load all concurrent callers share. */
let loading: Promise<FFmpeg> | null = null;
/** Bumped by hardReset so a load that was in flight when a cancel struck knows to discard itself. */
let generation = 0;
/** The operation mutex — probe/convert bodies chain here, one at a time. */
let opChain: Promise<unknown> = Promise.resolve();

/**
 * Run `fn` after every previously queued operation has settled. The stored
 * chain swallows outcomes (`.then(u, u)`) so one rejected operation can never
 * poison the queue; the caller still receives `fn`'s own result/rejection.
 */
function withExclusive<T>(fn: () => Promise<T>): Promise<T> {
  const run = opChain.then(fn);
  opChain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted === true) {
    const reason: unknown = signal.reason;
    throw reason instanceof Error
      ? reason
      : new DOMException('The operation was aborted.', 'AbortError');
  }
}

/**
 * TRUE only when `err` IS the abort rejection itself (thrown by
 * `throwIfAborted` between ops) — NEVER for a real crash that merely
 * coincides with an aborted signal. The flag can flip while an exec is in
 * flight (aborts are only CHECKED between ops), and that exec's own rejection
 * must still be treated as a crash: skipping the reset on the flag alone
 * would cache a tainted worker — the poisoned-singleton class this module
 * exists to eliminate. (A real worker crash rejects with the worker's string
 * or an Error — never the signal's own reason / an AbortError DOMException.)
 */
function isAbortRejection(err: unknown, signal: AbortSignal | undefined): boolean {
  if (signal === undefined || !signal.aborted) return false;
  return err === signal.reason || (err instanceof DOMException && err.name === 'AbortError');
}

/**
 * Caller-scoped reset: drop the worker THIS call was using. If a later call
 * already replaced `instance`, only the caller's own (already dead or dying)
 * worker is terminated — never the replacement. A hard ffmpeg abort taints the
 * wasm runtime, and any later FS call on a tainted instance throws
 * `ErrnoError: FS error` — which is exactly how a failed first import used to
 * poison the second one. A fresh load costs ~150–350 ms; a poisoned singleton
 * costs the operator their next import.
 */
function dropWorker(ff: FFmpeg): void {
  if (instance === ff) instance = null;
  try {
    ff.terminate();
  } catch {
    /* already dead */
  }
}

/** Unconditional reset — cancelConversion's hard interrupt of whatever runs. */
function hardReset(): void {
  generation++;
  const ff = instance;
  instance = null;
  try {
    ff?.terminate();
  } catch {
    /* already dead */
  }
}

async function loadFresh(): Promise<FFmpeg> {
  const gen = generation;
  const ff = new FFmpeg();
  // Same-origin fetches of the Vite-emitted assets, wrapped as blob URLs (the
  // worker `import()`s the core, and a blob works because the Emscripten core
  // is self-contained). No request ever leaves this origin.
  const coreURL = await toBlobURL(coreJsUrl, 'text/javascript');
  const wasmURL = await toBlobURL(coreWasmUrl, 'application/wasm');
  await ff.load({ coreURL, wasmURL });
  if (generation !== gen) {
    // cancelConversion struck while this worker was loading — it is already
    // unwanted; never cache it over the reset.
    try {
      ff.terminate();
    } catch {
      /* already dead */
    }
    throw new Error('converter was reset while its worker loaded');
  }
  instance = ff;
  return ff;
}

async function ensureLoaded(): Promise<FFmpeg> {
  if (instance !== null) return instance;
  // Single-flight: concurrent callers await the SAME load. The old
  // check-then-act (`if (instance === null) construct`) let two callers build
  // two workers and orphan one alive — the root of the D-128 field race.
  loading ??= loadFresh().finally(() => {
    loading = null;
  });
  return loading;
}

/**
 * Capture the log lines of ONE exec for ONE caller: listener attached before,
 * detached in finally. No module-global sink — nothing another call can steal.
 */
async function withLogCapture<T>(ff: FFmpeg, lines: string[], fn: () => Promise<T>): Promise<T> {
  const onLog = (e: LogEvent): void => {
    lines.push(e.message);
  };
  ff.on('log', onLog);
  try {
    return await fn();
  } finally {
    ff.off('log', onLog);
  }
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
 *
 * Rejects (does not resolve) when `opts.signal` aborts — the caller that
 * aborted is gone, so no ProbeResult shape exists for it; the shared worker is
 * deliberately left alive for the next probe.
 */
export async function probeSource(
  file: File,
  opts: { signal?: AbortSignal | undefined } = {},
): Promise<ProbeResult> {
  const { signal } = opts;
  return withExclusive(async () => {
    throwIfAborted(signal); // aborted while queued — never touch the worker
    const lines: string[] = [];
    let held: FFmpeg | null = null;
    try {
      held = await ensureLoaded();
      const ff = held;
      throwIfAborted(signal);
      const input = await mountSource(ff, file);
      // Abort between ops only: a single-threaded exec can't be interrupted
      // without terminating the shared worker, which an abort must never do.
      // (An abandoned mount is fine — the next mountSource unmounts it first.)
      throwIfAborted(signal);
      // NOTE: a REJECTED exec (worker error) now propagates to the catch below
      // → `converter-crashed`. The old `.catch(() => 1)` swallowed real crashes
      // into "code 1 + empty log", which parseProbeLog then misread as
      // "no-stream" — blaming a perfectly good file for our own crash.
      await withLogCapture(ff, lines, () => ff.exec(['-i', input]));
      throwIfAborted(signal);
      const probe = parseProbeLog(lines);
      if (probe === null) {
        // No parseable video stream — and quite possibly a hard ffmpeg abort
        // that tainted the wasm runtime. Never cache a maybe-dead worker.
        dropWorker(ff);
        return { ok: false as const, reason: 'no-stream' as const, logTail: lines.slice(-8) };
      }
      let posterUrl: string | null = null;
      try {
        const posterPath = '/poster.png';
        // Mid-clip poster (decision (a)); frame 0 only when the duration is unknown.
        const posterSec = probe.durationMs > 0 ? posterTimeMs(probe.durationMs) / 1000 : undefined;
        const code = await ff.exec(buildPosterArgs(input, posterPath, posterSec));
        if (code === 0) {
          const png = await ff.readFile(posterPath);
          await ff.deleteFile(posterPath).catch(() => undefined);
          const bytes = typeof png === 'string' ? new TextEncoder().encode(png) : png;
          const ab = new ArrayBuffer(bytes.byteLength);
          new Uint8Array(ab).set(bytes);
          posterUrl = URL.createObjectURL(new Blob([ab], { type: 'image/png' }));
        }
      } catch (posterErr) {
        // Preview-less import beats no import — but a THROW here means the
        // runtime is suspect; drop it so the actual conversion starts fresh.
        console.error(
          '[video-convert] poster extraction threw — continuing without a preview:',
          posterErr,
        );
        dropWorker(ff);
        posterUrl = null;
      }
      // Success-path FS hygiene: leave nothing mounted between calls (the
      // conversion re-mounts via mountSource; a later import starts clean).
      // Skipped when the poster path already dropped the worker.
      if (instance === ff) {
        try {
          await ff.unmount(MOUNT_DIR);
        } catch {
          /* nothing mounted / already gone */
        }
      }
      return { ok: true as const, probe, posterUrl };
    } catch (err) {
      if (isAbortRejection(err, signal)) {
        // The abort ITSELF (thrown between ops) — the caller is gone and the
        // worker is healthy. Reject without resetting; the next probe reuses
        // it. Only the abort may skip the reset — see isAbortRejection.
        throw err;
      }
      // Any FS/exec throw (ErrnoError etc.) — the worker is dead or dying. The
      // modal shows a friendly message; the REAL error must reach the console
      // (the pre-fix code swallowed it entirely).
      console.error('[video-convert] probe crashed — the underlying error:', err);
      if (held !== null) dropWorker(held);
      if (signal?.aborted === true) {
        // A real crash that RACED the caller's abort: the worker is dropped
        // (above) exactly like any crash, but there is no one to show a
        // result to — reject like any aborted call.
        throw err;
      }
      return {
        ok: false as const,
        reason: 'converter-crashed' as const,
        logTail: [...lines.slice(-6), String(err)],
      };
    }
  });
}

export type ConvertedClipVerdict =
  | { ok: true; durationMs: number; width: number; height: number }
  | { ok: false; reason: string };

/**
 * D-128 — an ALPHA PROFILE: the reading that distinguishes "renders invisible because
 * the ALPHA is (near) zero everywhere" from every other failure mode. A clip can pass
 * every decode check (dimensions ✓ duration ✓ megabytes of colour data ✓) and still
 * paint NOTHING if its alpha plane is empty — e.g. a source exported as 32-bit BGRA
 * whose alpha byte is 0 (RGB content present, invisible on air).
 */
export interface AlphaStats {
  /** Max alpha seen across the sampled pixels (0-255). */
  maxA: number;
  /** Mean alpha across the sampled pixels. */
  meanA: number;
  /** Fraction of sampled pixels with alpha ≥ 8 (visible at all). */
  nonTransparentFrac: number;
  /** Fraction of sampled pixels with alpha ≥ 250 (fully opaque). */
  opaqueFrac: number;
  /** Total pixels sampled (across frames). */
  sampled: number;
}

function statsOfRgba(buffers: readonly Uint8Array[]): AlphaStats {
  let maxA = 0;
  let sum = 0;
  let nonTransparent = 0;
  let opaque = 0;
  let n = 0;
  for (const buf of buffers) {
    for (let i = 3; i < buf.length; i += 4) {
      const a = buf[i] as number;
      n++;
      sum += a;
      if (a > maxA) maxA = a;
      if (a >= 8) nonTransparent++;
      if (a >= 250) opaque++;
    }
  }
  return {
    maxA,
    meanA: n > 0 ? sum / n : 0,
    nonTransparentFrac: n > 0 ? nonTransparent / n : 0,
    opaqueFrac: n > 0 ? opaque / n : 0,
    sampled: n,
  };
}

/** Render an AlphaStats as the one-line reading the operator can paste back. */
export function formatAlphaStats(s: AlphaStats): string {
  return (
    `maxα=${String(s.maxA)} meanα=${s.meanA.toFixed(1)} ` +
    `visible(α≥8)=${(s.nonTransparentFrac * 100).toFixed(2)}% ` +
    `opaque(α≥250)=${(s.opaqueFrac * 100).toFixed(2)}% (n=${String(s.sampled)})`
  );
}

/**
 * D-128 — sample the SOURCE's alpha profile: decode a few spread frames to raw RGBA in
 * the wasm and measure. Null on any failure — a diagnostics miss must never block an
 * import. Runs under the module mutex like every wasm op.
 */
export async function sampleSourceAlpha(
  file: File,
  durationMs: number,
  samples = 3,
): Promise<AlphaStats | null> {
  return withExclusive(async () => {
    let held: FFmpeg | null = null;
    try {
      held = await ensureLoaded();
      const ff = held;
      const input = await mountSource(ff, file);
      const buffers: Uint8Array[] = [];
      const times =
        durationMs > 0
          ? Array.from({ length: samples }, (_, i) => ((i + 0.5) / samples) * (durationMs / 1000))
          : [0];
      for (const t of times) {
        const out = `/alpha-probe-${String(Math.round(t * 1000))}.raw`;
        const seek = t > 0 ? ['-ss', t.toFixed(3)] : [];
        const code = await ff.exec([
          '-y',
          ...seek,
          '-i',
          input,
          '-frames:v',
          '1',
          '-f',
          'rawvideo',
          '-pix_fmt',
          'rgba',
          out,
        ]);
        if (code === 0) {
          const data = await ff.readFile(out);
          await ff.deleteFile(out).catch(() => undefined);
          if (typeof data !== 'string') buffers.push(data);
        }
      }
      try {
        await ff.unmount(MOUNT_DIR);
      } catch {
        /* nothing mounted */
      }
      return buffers.length > 0 ? statsOfRgba(buffers) : null;
    } catch (err) {
      console.warn('[video-convert] source alpha sampling failed (non-fatal):', err);
      if (held !== null) dropWorker(held);
      return null;
    }
  });
}

/**
 * D-128 — sample the CONVERTED OUTPUT's alpha profile: decode the produced WebM in a
 * real `<video>`, draw several spread frames to a (downscaled) canvas, and measure the
 * unpremultiplied alpha. Null on any failure (diagnostics never block).
 */
export function sampleOutputAlphaStats(bytes: Uint8Array): Promise<AlphaStats | null> {
  const ab = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(ab).set(bytes);
  const url = URL.createObjectURL(new Blob([ab], { type: 'video/webm' }));
  return new Promise((resolve) => {
    const v = document.createElement('video');
    v.preload = 'auto';
    v.muted = true;
    const finish = (r: AlphaStats | null): void => {
      URL.revokeObjectURL(url);
      resolve(r);
    };
    const timer = setTimeout(() => finish(null), 10_000);
    v.onerror = () => {
      clearTimeout(timer);
      finish(null);
    };
    v.onloadeddata = () => {
      void (async () => {
        try {
          const scale = Math.min(1, 320 / Math.max(1, v.videoWidth));
          const c = document.createElement('canvas');
          c.width = Math.max(1, Math.round(v.videoWidth * scale));
          c.height = Math.max(1, Math.round(v.videoHeight * scale));
          const ctx = c.getContext('2d', { willReadFrequently: true });
          if (ctx === null) {
            clearTimeout(timer);
            finish(null);
            return;
          }
          const dur = Number.isFinite(v.duration) ? v.duration : 0;
          const buffers: Uint8Array[] = [];
          for (const frac of [0.1, 0.3, 0.5, 0.7, 0.9]) {
            if (dur > 0) {
              const sought = await new Promise<boolean>((res) => {
                const st = setTimeout(() => res(false), 3000);
                v.onseeked = () => {
                  clearTimeout(st);
                  res(true);
                };
                v.currentTime = frac * dur;
              });
              if (!sought) continue;
            }
            ctx.clearRect(0, 0, c.width, c.height);
            ctx.drawImage(v, 0, 0, c.width, c.height);
            buffers.push(new Uint8Array(ctx.getImageData(0, 0, c.width, c.height).data.buffer));
            if (dur <= 0) break;
          }
          clearTimeout(timer);
          finish(buffers.length > 0 ? statsOfRgba(buffers) : null);
        } catch {
          clearTimeout(timer);
          finish(null);
        }
      })();
    };
    v.src = url;
  });
}

/**
 * D-128 — VERIFY the converted bytes actually DECODE in THIS browser before anything
 * is stored: a real `<video>` must reach metadata, report a finite positive duration,
 * and match the EXPECTED post-crop dimensions. ffmpeg exiting 0 is NOT proof the file
 * plays (the 1920×282 field regression stored a 6.5 MB WebM no surface could decode —
 * silently). A conversion that yields an unplayable file must FAIL LOUDLY here, never
 * become a stored asset. Also the duration measurement for a `Duration: N/A` source
 * (the converted output is the authoritative clock either way).
 */
export function verifyConvertedClip(
  bytes: Uint8Array,
  expectedWidth: number,
  expectedHeight: number,
): Promise<ConvertedClipVerdict> {
  const ab = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(ab).set(bytes);
  const url = URL.createObjectURL(new Blob([ab], { type: 'video/webm' }));
  return new Promise((resolve) => {
    const v = document.createElement('video');
    v.preload = 'metadata';
    v.muted = true;
    const done = (verdict: ConvertedClipVerdict): void => {
      URL.revokeObjectURL(url);
      resolve(verdict);
    };
    v.onloadedmetadata = () => {
      const durationMs = Number.isFinite(v.duration) ? Math.round(v.duration * 1000) : 0;
      if (durationMs <= 0) {
        done({ ok: false, reason: 'the converted clip reports no duration' });
      } else if (v.videoWidth !== expectedWidth || v.videoHeight !== expectedHeight) {
        done({
          ok: false,
          reason:
            `the converted clip decodes at ${String(v.videoWidth)}×${String(v.videoHeight)}, ` +
            `expected ${String(expectedWidth)}×${String(expectedHeight)}`,
        });
      } else {
        done({ ok: true, durationMs, width: v.videoWidth, height: v.videoHeight });
      }
    };
    v.onerror = () =>
      done({
        ok: false,
        reason: `the converted clip does not decode (${v.error?.message ?? 'media error'})`,
      });
    v.src = url;
  });
}

/**
 * D-128 — READBACK check after `storeBytes`: the stored asset must serve back the SAME
 * byte count that was verified. A silently truncated/corrupted store would otherwise
 * present exactly like the field failure (every surface blank, no error anywhere).
 * Returns null when the readback matches, else a human-readable mismatch description.
 */
export async function verifyStoredReadback(
  url: string,
  expectedByteLength: number,
): Promise<string | null> {
  try {
    const got = (await (await fetch(url)).arrayBuffer()).byteLength;
    return got === expectedByteLength
      ? null
      : `stored asset reads back ${String(got)} bytes, expected ${String(expectedByteLength)}`;
  } catch (err) {
    return `stored asset could not be read back (${String(err)})`;
  }
}

/** The ffmpeg log tail of the most recent convert — surfaced when verification fails. */
export function lastConvertLogTail(): readonly string[] {
  return lastConvertLog;
}
let lastConvertLog: string[] = [];

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
  /** D-128 — un-premultiply a matted-against-black source (fringe fix). */
  premultipliedAlpha?: boolean | undefined;
  onProgress?: ((ratio: number) => void) | undefined;
}): Promise<Uint8Array<ArrayBuffer> | null> {
  return withExclusive(async () => {
    const output = '/out.webm';
    const lines: string[] = [];
    let held: FFmpeg | null = null;
    try {
      held = await ensureLoaded();
      const ff = held;
      const input = await mountSource(ff, opts.file);
      // Per-call progress listener — attached around the exec, detached in
      // finally; no module-global sink (same rule as the log capture).
      const onProgress = (e: ProgressEvent): void => {
        opts.onProgress?.(e.progress);
      };
      ff.on('progress', onProgress);
      let code: number;
      try {
        code = await withLogCapture(ff, lines, () =>
          ff.exec(
            buildConvertArgs({
              inputPath: input,
              outputPath: output,
              targetFps: opts.targetFps,
              crop: opts.crop,
              premultipliedAlpha: opts.premultipliedAlpha,
            }),
          ),
        );
      } finally {
        ff.off('progress', onProgress);
      }
      // Keep the tail around even on SUCCESS: a conversion that exits 0 can still
      // produce an undecodable file (the 1920×282 field case), and the post-convert
      // verification needs this log to make that failure diagnosable.
      lastConvertLog = lines.slice(-40);
      if (code !== 0) {
        // Encode failure — surface the ffmpeg tail so the modal's "see the
        // console log" message is actually true.
        console.error(
          `[video-convert] conversion exited ${String(code)} — ffmpeg log tail:\n${lines.slice(-40).join('\n')}`,
        );
        return null;
      }
      const data = await ff.readFile(output);
      const raw = typeof data === 'string' ? new TextEncoder().encode(data) : data;
      // Copy onto a plain ArrayBuffer so the bytes own their backing store (and
      // satisfy the channel's `Uint8Array<ArrayBuffer>` shape).
      const out = new Uint8Array(raw.byteLength);
      out.set(raw);
      return out;
    } catch (err) {
      // A cancel (terminate()) or a worker crash surfaces here. The modal shows
      // a friendly message either way — the real error still reaches the
      // console (a cancel logs the library's "called FFmpeg.terminate()").
      console.error('[video-convert] conversion threw — the underlying error:', err);
      return null;
    } finally {
      // EVERY import ends with a FRESH-WORKER guarantee. Field evidence (owner
      // smoke, real archive files): back-to-back imports of KNOWN-GOOD files
      // alternated good → `ErrnoError: FS error` → good on a REUSED instance,
      // even though unmount+delete hygiene ran — some wasm FS/runtime state
      // survives a successful convert in ways we could not reproduce in clean
      // probes (same-file ×3, 103 MB disk-backed, Unicode names: all green).
      // Rather than gamble on path tricks, the state-carryover CLASS is
      // eliminated by construction: the worker is dropped when a convert ends
      // (success, failure, or cancel). Within ONE import, probe + poster +
      // convert still share a single load; the ~150–350 ms reload is paid once
      // per import, invisible next to a multi-second conversion.
      // Caller-scoped: drops only the worker THIS convert used.
      if (held !== null) dropWorker(held);
    }
  });
}

/** Hard-cancel an in-flight conversion. The wasm worker dies; state resets. */
export function cancelConversion(): void {
  hardReset();
}

/** TEST-ONLY — whether a worker instance is currently cached (the reset contract). */
export function hasCachedInstanceForTest(): boolean {
  return instance !== null;
}
