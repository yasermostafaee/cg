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

// ─── TEMP D-128 race diagnostics — remove before merge ───────────────────────
// WHY: the owner's real-machine smoke imports the SAME known-good file and gets
// DIFFERENT outcomes across repeated imports (probe "no-stream" | probe ok | FS
// error). Non-determinism on one input is the signature of a RACE on this
// module's shared mutable state (`instance`, `logSink`), NOT a lifecycle bug —
// which is why the single-call unit tests never reproduced it.
//
// PRIME SUSPECT: React <StrictMode> (apps/designer/src/renderer/main.tsx) makes
// the modal's probe effect (VideoImportModal.tsx) run TWICE in dev — mount →
// cleanup → mount — and the cleanup only flips `alive=false`; it does NOT abort
// the in-flight probe. So TWO probeSource() calls run CONCURRENTLY against these
// module globals and stomp each other:
//   • ensureLoaded() isn't mutually exclusive → both build a worker, one is
//     orphaned yet its on('log') still fires into the shared `logSink`.
//   • `logSink` is overwritten by the 2nd call → the 1st exec's log lines land
//     in the wrong lines[] → empty/partial log → parseProbeLog null → "no-stream".
//   • resetInstance() from one call terminates whatever `instance` currently is
//     — the OTHER call's live worker → its next FS op throws "ErrnoError: FS error".
//
// These traces make the interleaving visible. All go to console.error (so they
// survive the modal's friendly-message swallow), high-res timestamped, and tag
// each op with its call# and the worker identity (FFmpeg#N) it ran on — so
// cross-talk between two workers and cross-resets are unmistakable in the paste.
const dbgClock = (): number => (typeof performance !== 'undefined' ? performance.now() : 0);
const dbgT0 = dbgClock();
let dbgOp = 0;
let dbgCall = 0;
let dbgInFlight = 0;
let dbgInstanceSeq = 0;
const dbgInstanceId = new WeakMap<object, number>();
function dbg(msg: string): void {
  console.error(`[D-128 race diag +${(dbgClock() - dbgT0).toFixed(1)}ms] ${msg}`);
}
function dbgId(inst: FFmpeg | null): string {
  if (inst === null) return 'none';
  let id = dbgInstanceId.get(inst);
  if (id === undefined) {
    id = ++dbgInstanceSeq;
    dbgInstanceId.set(inst, id);
  }
  return `FFmpeg#${String(id)}`;
}
function dbgErr(e: unknown): string {
  if (e instanceof Error) {
    const withErrno = e as Error & { errno?: number };
    const errno = withErrno.errno !== undefined ? ` (errno ${String(withErrno.errno)})` : '';
    return `${e.name}: ${e.message}${errno}\n${e.stack ?? '(no stack)'}`;
  }
  return String(e);
}
/** Numbered START/OK/THROW trace with duration for a single awaited FS/exec op. */
async function dbgTrace<T>(call: number, tag: string, fn: () => Promise<T>): Promise<T> {
  const n = ++dbgOp;
  const t0 = dbgClock();
  dbg(`call#${String(call)} op#${String(n)} ${tag} START`);
  try {
    const r = await fn();
    dbg(`call#${String(call)} op#${String(n)} ${tag} OK (${(dbgClock() - t0).toFixed(0)}ms)`);
    return r;
  } catch (e) {
    dbg(
      `call#${String(call)} op#${String(n)} ${tag} THROW (${(dbgClock() - t0).toFixed(0)}ms):\n${dbgErr(e)}`,
    );
    throw e;
  }
}
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Kill and forget the cached worker. Called on EVERY failure path: a hard
 * ffmpeg abort taints the wasm runtime, and any later FS call on a tainted
 * instance throws `ErrnoError: FS error` — which is exactly how a failed
 * first import used to poison the second one. A fresh load costs ~150–350 ms;
 * a poisoned singleton costs the operator their next import.
 */
function resetInstance(call?: number): void {
  // TEMP D-128 race diagnostics — remove before merge. Under the StrictMode
  // double-probe, resetInstance() from one call terminates whatever `instance`
  // is RIGHT NOW — which may be the OTHER call's live worker. The tag names both
  // the triggering call# and the worker it kills, so a cross-reset is obvious.
  dbg(
    `call#${call === undefined ? '?' : String(call)} resetInstance → terminating ${dbgId(instance)}`,
  );
  try {
    instance?.terminate();
  } catch {
    /* already dead */
  }
  instance = null;
}

async function ensureLoaded(call: number): Promise<FFmpeg> {
  if (instance !== null) {
    dbg(`call#${String(call)} ensureLoaded REUSE ${dbgId(instance)}`); // TEMP D-128 diag
    return instance;
  }
  // TEMP D-128 diag: two concurrent calls both reach here with instance===null
  // and each construct a worker — the classic check-then-act race.
  dbg(`call#${String(call)} ensureLoaded CONSTRUCT (instance was null)`);
  const ff = new FFmpeg();
  dbg(`call#${String(call)} constructed ${dbgId(ff)}`); // TEMP D-128 diag
  ff.on('log', ({ message }) => logSink?.(message));
  ff.on('progress', ({ progress }) => progressSink?.(progress));
  // Same-origin fetches of the Vite-emitted assets, wrapped as blob URLs (the
  // worker `import()`s the core, and a blob works because the Emscripten core
  // is self-contained). No request ever leaves this origin.
  const coreURL = await toBlobURL(coreJsUrl, 'text/javascript');
  const wasmURL = await toBlobURL(coreWasmUrl, 'application/wasm');
  await dbgTrace(call, `${dbgId(ff)} load`, () => ff.load({ coreURL, wasmURL }));
  // TEMP D-128 diag: if another ensureLoaded() body finished loading while we
  // awaited, `instance` is already a DIFFERENT worker — we are about to orphan a
  // live worker whose log handler still points at the shared `logSink`. Smoking
  // gun for the two-worker interleaving.
  if (instance !== null && instance !== ff) {
    dbg(
      `call#${String(call)} ⚠️ INSTANCE RACE — ${dbgId(instance)} was cached while ${dbgId(ff)} loaded; overwriting & ORPHANING a live worker`,
    );
  }
  instance = ff;
  dbg(`call#${String(call)} ensureLoaded DONE — instance = ${dbgId(ff)}`); // TEMP D-128 diag
  return ff;
}

async function mountSource(ff: FFmpeg, file: File, call: number): Promise<string> {
  await dbgTrace(call, `${dbgId(ff)} createDir ${MOUNT_DIR}`, () => ff.createDir(MOUNT_DIR)).catch(
    () => {
      /* already exists from a prior run */
    },
  );
  await dbgTrace(call, `${dbgId(ff)} unmount(pre) ${MOUNT_DIR}`, () => ff.unmount(MOUNT_DIR)).catch(
    () => {
      /* nothing mounted yet */
    },
  );
  await dbgTrace(call, `${dbgId(ff)} mount WORKERFS "${file.name}"`, () =>
    ff.mount('WORKERFS' as Parameters<FFmpeg['mount']>[0], { files: [file] }, MOUNT_DIR),
  );
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
  // TEMP D-128 race diagnostics — remove before merge.
  const call = ++dbgCall;
  const inFlight = ++dbgInFlight;
  dbg(`call#${String(call)} probeSource ENTER "${file.name}" — in-flight now ${String(inFlight)}`);
  if (inFlight > 1) {
    dbg(
      `call#${String(call)} ⚠️ CONCURRENT ENTRY — ${String(inFlight)} converter calls in flight at once. StrictMode double-invoke or double import. THIS interleaving is the race.`,
    );
  }
  const lines: string[] = [];
  try {
    const ff = await ensureLoaded(call);
    const input = await mountSource(ff, file, call);
    logSink = (l) => lines.push(l);
    dbg(
      `call#${String(call)} logSink NOW → call#${String(call)} lines[] (probe ran on ${dbgId(ff)})`,
    ); // TEMP D-128 diag
    const probeCode = await dbgTrace(call, `${dbgId(ff)} exec[-i] (probe)`, () =>
      ff.exec(['-i', input]),
    ).catch((e: unknown) => {
      // TEMP D-128 diag: the original `.catch(() => 1)` silently masked a real
      // worker ERROR here and let parseProbeLog run on a partial/empty log →
      // "no-stream". Surface it so we can tell a genuine no-stream from a swallow.
      dbg(`call#${String(call)} probe exec REJECTED (swallowed to code 1): ${dbgErr(e)}`);
      return 1;
    });
    // TEMP D-128 diag: the FULL log the probe verdict is computed from. If this
    // is empty/short for a file that otherwise probes fine, the log went to the
    // OTHER concurrent call's lines[] (shared-logSink cross-talk).
    dbg(
      `call#${String(call)} probe exec code=${String(probeCode)}; captured ${String(lines.length)} log line(s):\n----- BEGIN probe log (call#${String(call)}) -----\n${lines.join('\n')}\n----- END probe log (call#${String(call)}) -----`,
    );
    const probe = parseProbeLog(lines);
    if (probe === null) {
      // No parseable video stream — and quite possibly a hard ffmpeg abort that
      // tainted the wasm runtime. Never cache a maybe-dead worker.
      dbg(
        `call#${String(call)} BRANCH = probe-no-stream (parseProbeLog found no video in the ${String(lines.length)} line(s) above)`,
      ); // TEMP D-128 diag
      resetInstance(call);
      return { ok: false, reason: 'no-stream', logTail: lines.slice(-8) };
    }
    dbg(
      `call#${String(call)} parseProbeLog OK: ${String(probe.width)}x${String(probe.height)} ${String(probe.fps)}fps ${String(probe.durationMs)}ms`,
    ); // TEMP D-128 diag
    let posterUrl: string | null = null;
    try {
      const posterPath = '/poster.png';
      const code = await dbgTrace(call, `${dbgId(ff)} exec (poster)`, () =>
        ff.exec(buildPosterArgs(input, posterPath)),
      );
      if (code === 0) {
        const png = await dbgTrace(call, `${dbgId(ff)} readFile poster`, () =>
          ff.readFile(posterPath),
        );
        await dbgTrace(call, `${dbgId(ff)} deleteFile poster`, () =>
          ff.deleteFile(posterPath),
        ).catch(() => undefined);
        const bytes = typeof png === 'string' ? new TextEncoder().encode(png) : png;
        const ab = new ArrayBuffer(bytes.byteLength);
        new Uint8Array(ab).set(bytes);
        posterUrl = URL.createObjectURL(new Blob([ab], { type: 'image/png' }));
      }
    } catch (posterErr) {
      // Preview-less import beats no import — but a THROW here means the
      // runtime is suspect; drop it so the actual conversion starts fresh.
      dbg(`call#${String(call)} poster path THREW — dropping worker: ${dbgErr(posterErr)}`); // TEMP D-128 diag
      resetInstance(call);
      posterUrl = null;
    }
    // Success-path FS hygiene: leave nothing mounted between calls (the
    // conversion re-mounts via mountSource; a later import starts clean).
    if (instance !== null) {
      const held = instance; // TEMP D-128 diag: keep narrowing inside the traced closure
      try {
        await dbgTrace(call, `${dbgId(held)} unmount(success) ${MOUNT_DIR}`, () =>
          held.unmount(MOUNT_DIR),
        );
      } catch {
        /* nothing mounted / already gone */
      }
    }
    dbg(`call#${String(call)} BRANCH = probe-ok (posterUrl=${String(posterUrl !== null)})`); // TEMP D-128 diag
    return { ok: true, probe, posterUrl };
  } catch (err) {
    // Any FS/exec throw (ErrnoError etc.) — the worker is dead or dying.
    // TEMP D-128 diag: the modal turns this into a friendly "FS error" WITHOUT
    // any console output — so the real throw was invisible. Surface it verbatim.
    dbg(`call#${String(call)} BRANCH = FS-error (converter-crashed) — RAW throw follows:`);
    console.error(err);
    resetInstance(call);
    return { ok: false, reason: 'converter-crashed', logTail: [...lines.slice(-6), String(err)] };
  } finally {
    // TEMP D-128 diag: under concurrency this clears the OTHER call's sink too.
    dbg(
      `call#${String(call)} probeSource finally: clearing logSink, in-flight → ${String(dbgInFlight - 1)}`,
    );
    logSink = null;
    dbgInFlight--;
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
  // TEMP D-128 race diagnostics — remove before merge.
  const call = ++dbgCall;
  const inFlight = ++dbgInFlight;
  dbg(
    `call#${String(call)} convertToWebm ENTER "${opts.file.name}" fps=${String(opts.targetFps)} crop=${String(opts.crop !== undefined)} — in-flight now ${String(inFlight)}`,
  );
  if (inFlight > 1) {
    dbg(
      `call#${String(call)} ⚠️ CONCURRENT ENTRY — ${String(inFlight)} converter calls in flight at once. THIS interleaving is the race.`,
    );
  }
  const output = '/out.webm';
  progressSink = opts.onProgress ?? null;
  try {
    const ff = await ensureLoaded(call);
    const input = await mountSource(ff, opts.file, call);
    const code = await dbgTrace(call, `${dbgId(ff)} exec (convert)`, () =>
      ff.exec(
        buildConvertArgs({
          inputPath: input,
          outputPath: output,
          targetFps: opts.targetFps,
          crop: opts.crop,
        }),
      ),
    );
    if (code !== 0) {
      // Failed or cancelled — the finally below drops the worker either way.
      dbg(`call#${String(call)} convert exec exited non-zero (code=${String(code)}) → null`); // TEMP D-128 diag
      return null;
    }
    const data = await dbgTrace(call, `${dbgId(ff)} readFile ${output}`, () => ff.readFile(output));
    const raw = typeof data === 'string' ? new TextEncoder().encode(data) : data;
    // Copy onto a plain ArrayBuffer so the bytes own their backing store (and
    // satisfy the channel's `Uint8Array<ArrayBuffer>` shape).
    const out = new Uint8Array(raw.byteLength);
    out.set(raw);
    dbg(`call#${String(call)} BRANCH = convert-ok (${String(out.byteLength)} bytes)`); // TEMP D-128 diag
    return out;
  } catch (err) {
    // terminate() (cancel) or a worker crash surfaces here — the instance is dead.
    // TEMP D-128 diag: this catch was SILENT — a real worker crash during convert
    // produced only the modal's generic "Conversion failed". Surface it verbatim.
    dbg(`call#${String(call)} BRANCH = convert-threw — RAW throw follows:`);
    console.error(err);
    return null;
  } finally {
    progressSink = null;
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
    dbg(
      `call#${String(call)} convertToWebm finally: reset + clear, in-flight → ${String(dbgInFlight - 1)}`,
    ); // TEMP D-128 diag
    resetInstance(call);
    dbgInFlight--; // TEMP D-128 diag
  }
}

/** Hard-cancel an in-flight conversion. The wasm worker dies; state resets. */
export function cancelConversion(): void {
  dbg('cancelConversion → resetInstance'); // TEMP D-128 diag
  resetInstance();
}

/** TEST-ONLY — whether a worker instance is currently cached (the reset contract). */
export function hasCachedInstanceForTest(): boolean {
  return instance !== null;
}
