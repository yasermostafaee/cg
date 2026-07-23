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
