/**
 * D-128 Phase 2 — the video import modal: probe → (opt-in) crop → convert → store.
 *
 * The picked source is probed in-app (fps / dimensions / duration + a first-frame
 * poster), an OPT-IN crop rect can be marked on the poster — draggable rectangle
 * AND numeric x/y/w/h, kept in sync both ways (decision (c)) — and conversion
 * bakes the crop and CONFORMS the output to the project channel's frame rate,
 * warning (never blocking) on a rate mismatch (decision (d)). Progress + a
 * working cancel are mandatory (decision (e) — single-threaded wasm is slow).
 * The confirm button can never commit a half-converted asset: bytes are stored
 * (with provenance) BEFORE the element is created, and only from the 'done'
 * transition of a successful convert.
 *
 * The wasm module is lazy — `loadConverter()` dynamic-imports it on the first
 * mount (single-flight: racing mounts share one import), the core itself loads
 * on first use; the Designer boots without either.
 */
import { useEffect, useRef, useState } from 'react';
import type { AssetMeta } from '@cg/shared-ipc';
// Type-only namespace import — erased at compile time, so the wasm-touching
// module still loads ONLY via the lazy `import()` in the mount effect below.
import type * as VideoConvertModule from './video-convert.js';
import { Modal, ModalButton } from '../shell/Modal.js';
import { Callout } from '../../ui/Callout.js';
import { RealtimeNumberInput } from '../inspector/controls.js';
import { useDesignerSelector } from '../../state/store.js';
import {
  buildProvenance,
  clampCrop,
  findDuplicateVideoAsset,
  fpsConformNotice,
  posterTimeMs,
  type CropRect,
  type SourceProbe,
} from './video-convert-args.js';
import { hashSourceFile } from './source-hash.js';
import { probeStoredVideo, verifyStoredPoster } from './video-asset-probe.js';
import * as s from './VideoImportModal.css.js';

type Converter = typeof VideoConvertModule;

/**
 * Single-flight lazy load of the wasm-touching module — however many mounts
 * race (StrictMode double-invokes the probe effect in dev; a fast close/reopen
 * does it in prod), they all await the SAME import. Mirrors the converter's
 * own single-flight worker load (D-128 reentrancy fix).
 */
let converterModule: Promise<Converter> | null = null;
function loadConverter(): Promise<Converter> {
  converterModule ??= import('./video-convert.js').catch((err: unknown) => {
    // A failed chunk fetch (e.g. a redeploy swapped the hashed assets) must be
    // RETRYABLE on the next attempt — mirror ensureLoaded's reset-on-failure.
    // Caching the rejection would break video import until a full page reload,
    // while the failure callout tells the operator to "try the import again".
    converterModule = null;
    throw err;
  });
  return converterModule;
}

type Phase =
  | { kind: 'probing' }
  | { kind: 'probe-failed'; reason: 'no-stream' | 'converter-crashed'; logTail: string[] }
  | { kind: 'ready' }
  // D-128 — hashing the source + looking up a prior import BEFORE any encode.
  | { kind: 'checking'; progress: number }
  // D-128 — a prior import with this source hash exists. The MATCHING asset is
  // recomputed LIVE from the current crop/fps against `candidates` (the
  // size-matched video assets), so changing the crop re-evaluates the duplicate
  // (Bug 4). `sourceSha256` lets "Convert again" reuse the hash.
  | { kind: 'duplicate'; sourceSha256: string; candidates: readonly AssetMeta[] }
  | { kind: 'converting'; progress: number }
  // D-128 — THE CONVERSION RESULT, shown ALWAYS (not only on failure): the asset stored
  // and every check green (or with warnings), awaiting the operator's "Place element".
  // The whole multi-round field hunt happened because a broken output was stored silently
  // and the only symptom was "it doesn't render" — the modal now says what it produced.
  | {
      kind: 'result';
      result: VideoImportResult;
      outputAlpha: VideoConvertModule.AlphaStats | null;
      /** Fully-opaque coverage dropped sharply vs the source (solid regions going semi-transparent). */
      opaqueDrop: boolean;
    }
  | { kind: 'error'; message: string };

const PREVIEW_MAX_W = 480;
const PREVIEW_MAX_H = 300;

export interface VideoImportResult {
  asset: AssetMeta;
  durationMs: number;
  /** STORED clip dimensions (post-crop). */
  width: number;
  height: number;
}

export function VideoImportModal(props: {
  file: File;
  onClose: () => void;
  onDone: (result: VideoImportResult) => void;
}): JSX.Element {
  const projectFps = useDesignerSelector((st) => st.scene?.frameRate) ?? 50;
  const [phase, setPhase] = useState<Phase>({ kind: 'probing' });
  const [probe, setProbe] = useState<SourceProbe | null>(null);
  // D-128 — the SOURCE's alpha profile (sampled after the probe, non-blocking). A source
  // whose alpha is (near) zero everywhere decodes fine, converts fine, stores fine — and
  // paints NOTHING anywhere (e.g. a 32-bit export whose alpha byte is 0). The reading
  // makes that legible BEFORE a long conversion instead of an invisible stored asset.
  const [sourceAlpha, setSourceAlpha] = useState<VideoConvertModule.AlphaStats | null>(null);
  const [posterUrl, setPosterUrl] = useState<string | null>(null);
  const [cropOn, setCropOn] = useState(false);
  const [crop, setCrop] = useState<CropRect>({ x: 0, y: 0, width: 1, height: 1 });
  // D-128 — un-premultiply the source's alpha (fringe fix). Defaults OFF
  // (owner decision, 2026-07-25): the ON default assumed the whole archive is
  // premultiplied and needs the correction, but the field shows clips that are
  // correct WITHOUT it and visibly damaged WITH it — a default must never
  // degrade a correct file. The operator turns it ON when they actually see a
  // black fringe on soft edges (the legacy matted-against-black AE /
  // rawvideo-BGRA case). rawvideo/BGRA carries no premultiplied flag, so this
  // cannot be auto-detected — it is an explicit operator choice (design.md).
  const [premultipliedAlpha, setPremultipliedAlpha] = useState(false);
  // D-128 FAST PATH (owner decision 2026-07-25) — the ALPHA BLEED is the second
  // opt-in pixel-math correction. It ran UNCONDITIONALLY before (the bug behind
  // "minutes vs the spike's seconds": the bleed graph + its geq stages were on
  // every import's hot path regardless of the premultiplied toggle). Default
  // OFF; the operator opts in when residual compression leak reads as dark
  // smudges/halos around moving content on air. Independent of the
  // premultiplied toggle — a straight source can want the bleed and a
  // premultiplied one can skip it; the graph builder composes them.
  const [alphaBleed, setAlphaBleed] = useState(false);
  // D-128 — a completed run's verdict was superseded by a settings change (the
  // stale-result coherence rule; see supersedeCompletedRun). Drives the note +
  // the "Convert again" relabel; cleared when a new conversion starts.
  const [supersededRun, setSupersededRun] = useState(false);
  const converter = useRef<Converter | null>(null);
  const cancelled = useRef(false);
  const hashAbort = useRef<AbortController | null>(null);
  const previewRef = useRef<HTMLDivElement>(null);

  // Probe on mount (lazy-loads the converter module; the core loads inside it).
  useEffect(() => {
    // Cleanup must CANCEL the in-flight probe, not merely ignore its result:
    // StrictMode's dev double-invoke (and a fast close/reopen in prod) runs
    // this effect twice, and two live probes racing the converter is exactly
    // the D-128 field bug (bogus "no-stream" / "ErrnoError: FS error" on a
    // good file). The converter is reentrancy-safe on its own; aborting here
    // stops this layer from manufacturing the race in the first place.
    let alive = true;
    const controller = new AbortController();
    void (async () => {
      try {
        const conv = await loadConverter();
        converter.current = conv;
        const probeT0 = performance.now();
        const result = await conv.probeSource(props.file, { signal: controller.signal });
        if (!alive) return;
        if (!result.ok) {
          setPhase({ kind: 'probe-failed', reason: result.reason, logTail: result.logTail });
          return;
        }
        // D-128 fast-path timing — probe + poster gate READY (the crop UI needs
        // both); everything after READY is either operator-time or convert-time.
        console.warn(
          `[video-import] timing — probe+poster: ${String(Math.round(performance.now() - probeT0))} ms (critical path to READY)`,
        );
        setProbe(result.probe);
        setPosterUrl(result.posterUrl);
        setCrop({ x: 0, y: 0, width: result.probe.width, height: result.probe.height });
        setPhase({ kind: 'ready' });
        // Alpha diagnostics — non-blocking, never gates the READY state; a sampling
        // failure yields null and the import proceeds without the warning/guard.
        // NOTE (fast-path audit): the sampling execs SHARE the single-threaded
        // converter worker's operation mutex, so an IMMEDIATE "Convert & import"
        // click queues behind them — the timing line makes that cost visible.
        const sampleT0 = performance.now();
        void conv
          .sampleSourceAlpha(props.file, result.probe.durationMs)
          .then((stats) => {
            if (!alive) return;
            setSourceAlpha(stats);
            if (stats !== null) {
              // console.warn (not info): the allowed channel, and this reading is the
              // one an operator pastes back when a clip renders invisible.
              console.warn(`[video-import] SOURCE alpha: ${conv.formatAlphaStats(stats)}`);
              console.warn(
                `[video-import] timing — source-alpha sampling: ${String(Math.round(performance.now() - sampleT0))} ms (off the READY path; shares the converter worker, so an immediate convert queues behind it)`,
              );
            }
          })
          .catch(() => undefined);
      } catch (err) {
        // An aborted probe REJECTS and lands here with alive=false — ignored.
        if (alive)
          setPhase({ kind: 'probe-failed', reason: 'converter-crashed', logTail: [String(err)] });
      }
    })();
    return () => {
      alive = false;
      controller.abort();
    };
    // mount-only: exactly one probe of the one picked file this modal instance owns
  }, []);

  const notice = probe !== null ? fpsConformNotice(probe.fps, projectFps) : null;
  const scale =
    probe !== null ? Math.min(PREVIEW_MAX_W / probe.width, PREVIEW_MAX_H / probe.height, 1) : 1;

  // The crop that WOULD be baked at these settings — used for the conversion AND
  // (Bug 4) to re-evaluate the duplicate match live as the operator edits it.
  const effectiveCrop =
    cropOn && probe !== null ? clampCrop(crop, probe.width, probe.height) : undefined;
  // Bug 4 — in the duplicate step the match is recomputed from the CURRENT crop +
  // fps, so a crop change that no longer matches clears the banner (effect below)
  // and "Use existing" only ever offers the asset matching what's on screen.
  const duplicateMatch =
    phase.kind === 'duplicate'
      ? findDuplicateVideoAsset(phase.candidates, {
          sourceSha256: phase.sourceSha256,
          targetFps: projectFps,
          crop: effectiveCrop,
          premultipliedAlpha,
          alphaBleed,
        })
      : null;
  useEffect(() => {
    if (phase.kind === 'duplicate' && duplicateMatch === null) {
      // params no longer match any prior import → back to the normal convert flow
      setPhase({ kind: 'ready' });
    }
  }, [phase.kind, duplicateMatch]);

  /**
   * D-128 — COHERENCE between the controls and the verdict: a completed (or
   * failed) conversion's verdict describes THE BYTES OF THAT RUN. The moment any
   * output-affecting parameter changes (crop on/off, the crop rect, either
   * correction), the verdict must stop presenting itself as current: the phase
   * returns to 'ready' — no result panel, no "Place element", so placing bytes
   * that don't match the settings on screen is structurally impossible — a note
   * says why, and the primary action reads "Convert again" (the owner's intended
   * loop: import fast → look → tick a correction → convert again). The LOCK
   * alternative (freeze parameters after a conversion behind an explicit
   * "change settings" reset) was rejected because it taxes that primary loop
   * with an extra step; supersede-on-change keeps the loop one action long
   * while making a stale verdict impossible to mistake for current. The stored
   * asset of the superseded run is kept (close-without-placing semantics) —
   * re-selecting its exact settings offers it back through the dedupe step.
   */
  function supersedeCompletedRun(): void {
    if (phase.kind === 'result' || phase.kind === 'error') {
      setSupersededRun(true);
      setPhase({ kind: 'ready' });
    }
  }

  function commitCrop(next: Partial<CropRect>): void {
    if (probe === null) return;
    supersedeCompletedRun();
    setCrop((c) => clampCrop({ ...c, ...next }, probe.width, probe.height));
  }

  /** Pointer drag: move the whole rect, or resize by a corner. */
  function beginCropDrag(e: React.PointerEvent, mode: 'move' | 'nw' | 'ne' | 'sw' | 'se'): void {
    if (probe === null || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const start = { ...crop };
    const sx = e.clientX;
    const sy = e.clientY;
    const onMove = (ev: PointerEvent): void => {
      const dx = (ev.clientX - sx) / scale;
      const dy = (ev.clientY - sy) / scale;
      let next: CropRect;
      if (mode === 'move') {
        next = { ...start, x: start.x + dx, y: start.y + dy };
      } else {
        const west = mode === 'nw' || mode === 'sw';
        const north = mode === 'nw' || mode === 'ne';
        next = {
          x: west ? start.x + dx : start.x,
          y: north ? start.y + dy : start.y,
          width: west ? start.width - dx : start.width + dx,
          height: north ? start.height - dy : start.height + dy,
        };
        if (next.width < 1) next.width = 1;
        if (next.height < 1) next.height = 1;
      }
      supersedeCompletedRun(); // the rect changed — any completed verdict is stale
      setCrop(clampCrop(next, probe.width, probe.height));
    };
    const onUp = (): void => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  /**
   * D-128 — the "Convert & import" entry. Bug 3: a duplicate is only POSSIBLE if
   * an existing video asset was made from a source of the SAME byte size, so a
   * cheap `File.size` pre-filter runs FIRST (instant). No size match ⇒ skip the
   * up-front hash entirely and import normally — the source hash is computed
   * DURING the encode (below) so provenance still carries it for future dedupe
   * without making the operator wait. Only when a size matches do we hash up
   * front to CONFIRM, then either offer the existing asset or convert.
   */
  async function startImport(): Promise<void> {
    if (probe === null) return;
    cancelled.current = false;
    setSupersededRun(false); // a conversion matching the shown settings is starting
    const list = await window.cg.assets.list();
    const sizeMatches = list.filter(
      (a) => a.kind === 'video' && a.provenance?.sourceBytes === props.file.size,
    );
    if (sizeMatches.length === 0) {
      // No prior import could possibly match — no up-front hash; import straight.
      await runConversion(effectiveCrop, undefined);
      return;
    }
    // A duplicate is possible — hash up front (cancellable) to confirm.
    const controller = new AbortController();
    hashAbort.current = controller;
    setPhase({ kind: 'checking', progress: 0 });
    let sourceSha256: string;
    try {
      sourceSha256 = await hashSourceFile(props.file, {
        signal: controller.signal,
        onProgress: (ratio) =>
          setPhase({ kind: 'checking', progress: Math.max(0, Math.min(1, ratio)) }),
      });
    } catch {
      // aborted (Cancel during the hash) — back to the crop step, nothing done.
      if (cancelled.current) setPhase({ kind: 'ready' });
      return;
    } finally {
      hashAbort.current = null;
    }
    if (cancelled.current) {
      setPhase({ kind: 'ready' });
      return;
    }
    const existing = findDuplicateVideoAsset(sizeMatches, {
      sourceSha256,
      targetFps: projectFps,
      crop: effectiveCrop,
      premultipliedAlpha,
      alphaBleed,
    });
    if (existing !== null) {
      // The specific matching asset is recomputed LIVE in render (Bug 4) — carry
      // the candidates + hash so a crop change can re-evaluate without re-hashing.
      setPhase({ kind: 'duplicate', sourceSha256, candidates: sizeMatches });
      return;
    }
    await runConversion(effectiveCrop, sourceSha256);
  }

  async function runConversion(
    crop: CropRect | undefined,
    precomputedHash: string | undefined,
  ): Promise<void> {
    const conv = converter.current;
    if (conv === null || probe === null) return;
    cancelled.current = false;
    setSupersededRun(false); // this run WILL match the shown settings
    setPhase({ kind: 'converting', progress: 0 });
    // Bug 3 — the source hash goes into provenance for FUTURE dedupe, but the
    // operator must never WAIT on it. When we didn't hash up front (no size
    // match), compute it DURING the encode (which takes far longer) — best-effort,
    // cancellable, never blocking the import if it fails.
    const hashCtrl = new AbortController();
    hashAbort.current = hashCtrl;
    const hashPromise: Promise<string | undefined> =
      precomputedHash !== undefined
        ? Promise.resolve(precomputedHash)
        : hashSourceFile(props.file, { signal: hashCtrl.signal }).catch(() => undefined);
    // D-128 FAST PATH — per-stage wall times, summarized in ONE console.warn at
    // the end so the owner can see where an import's seconds actually go (the
    // reading that exposed the unconditional bleed in the first place).
    const stageMs: Record<string, number> = {};
    const timed = async <T,>(label: string, run: () => Promise<T>): Promise<T> => {
      const t0 = performance.now();
      try {
        return await run();
      } finally {
        stageMs[label] = Math.round(performance.now() - t0);
      }
    };
    const bytes = await timed('convert', () =>
      conv.convertToWebm({
        file: props.file,
        targetFps: projectFps,
        crop,
        premultipliedAlpha,
        alphaBleed,
        onProgress: (ratio) =>
          setPhase({ kind: 'converting', progress: Math.max(0, Math.min(1, ratio)) }),
      }),
    );
    if (bytes === null) {
      hashCtrl.abort();
      hashAbort.current = null;
      if (cancelled.current) {
        setPhase({ kind: 'ready' }); // a clean cancel returns to the crop step
      } else {
        setPhase({
          kind: 'error',
          message: 'Conversion failed — see the console log for the ffmpeg output.',
        });
      }
      return;
    }
    if (cancelled.current) {
      // The cancel landed AFTER the encode finished but BEFORE the commit —
      // an acknowledged cancel must never import anyway. Nothing is stored;
      // the crop step returns.
      hashCtrl.abort();
      hashAbort.current = null;
      setPhase({ kind: 'ready' });
      return;
    }
    try {
      // D-128 VERIFY-BEFORE-STORE — ffmpeg exiting 0 is NOT proof the output plays
      // (the 1920×282 field case stored a 6.5 MB WebM no surface could decode,
      // silently). The produced bytes must decode IN THIS BROWSER, at the expected
      // post-crop dimensions, with a real duration — or the conversion FAILS LOUDLY
      // and nothing is stored. Also the duration measurement (`Duration: N/A` sources).
      const expectedW = crop?.width ?? probe.width;
      const expectedH = crop?.height ?? probe.height;
      const verdict = await timed('playability-verify', () =>
        conv.verifyConvertedClip(bytes, expectedW, expectedH),
      );
      if (!verdict.ok) {
        console.error(
          `[video-import] converted clip FAILED verification (${verdict.reason}) — ffmpeg log tail:\n` +
            conv.lastConvertLogTail().join('\n'),
        );
        setPhase({
          kind: 'error',
          message: `The converted clip failed verification: ${verdict.reason}. Nothing was imported — see the console log for the ffmpeg output.`,
        });
        return;
      }
      // D-128 ALPHA DIAGNOSTIC + COLLAPSE GUARD — a clip can pass every decode check and
      // still paint NOTHING if its alpha is (near) zero everywhere. ALWAYS log both
      // profiles (the reading the operator can paste back); FAIL only on a genuine
      // COLLAPSE — the SOURCE had visible pixels and the OUTPUT lost them. A source that
      // is itself fully transparent is legibly WARNED about in the modal instead (a
      // legitimately mostly-transparent graphic is normal; the comparison is always
      // against the source's own profile, never an absolute threshold).
      const outputAlpha = await timed('output-alpha', () => conv.sampleOutputAlphaStats(bytes));
      console.warn(
        `[video-import] alpha profile — source: ${
          sourceAlpha !== null ? conv.formatAlphaStats(sourceAlpha) : 'unavailable'
        } | output: ${outputAlpha !== null ? conv.formatAlphaStats(outputAlpha) : 'unavailable'}`,
      );
      if (
        sourceAlpha !== null &&
        outputAlpha !== null &&
        sourceAlpha.nonTransparentFrac > 0.01 &&
        outputAlpha.nonTransparentFrac < 0.001
      ) {
        console.error(
          `[video-import] ALPHA COLLAPSED in conversion — source had visible pixels, the output has none. ffmpeg log tail:\n` +
            conv.lastConvertLogTail().join('\n'),
        );
        setPhase({
          kind: 'error',
          message:
            `The conversion LOST the alpha channel: the source has visible pixels ` +
            `(${(sourceAlpha.nonTransparentFrac * 100).toFixed(1)}% of the frame) but the converted ` +
            `clip is fully transparent. Nothing was imported — see the console log.`,
        });
        return;
      }
      // The SOURCE banner may have said `Duration: N/A` — the CONVERTED output
      // is the authoritative clock either way; fall back to the probe's figure.
      const measured = probe.durationMs > 0 ? probe.durationMs : verdict.durationMs;
      if (cancelled.current) {
        // Last exit before the point of no return — storeBytes commits the
        // asset; from there the import completes (reverting a stored asset is
        // not this seam's job).
        hashCtrl.abort();
        setPhase({ kind: 'ready' });
        return;
      }
      // The deferred hash ran DURING the multi-second encode, so it is ready now
      // (or resolves in a blink for a small clip); undefined only if hashing
      // failed — provenance omits it and the post-convert sha dedupe still holds.
      const sourceSha256 = await hashPromise;
      const webmName = props.file.name.replace(/\.[^.]*$/, '') + '.webm';
      const { asset } = await timed('store', () =>
        window.cg.assets.storeBytes({
          bytes,
          filename: webmName,
          kind: 'video',
          provenance: buildProvenance({
            sourceFilename: props.file.name,
            probe,
            targetFps: projectFps,
            crop,
            sourceSha256,
            sourceBytes: props.file.size,
            premultipliedAlpha,
            alphaBleed,
          }),
        }),
      );
      // D-128 READBACK — a store that silently truncates presents exactly like the
      // field failure (every surface blank). The stored asset must serve back the
      // verified byte count, or the operator sees an error instead of a dead asset.
      const url = await window.cg.assets.url(asset.assetId);
      const mismatch =
        url === null
          ? 'stored asset has no readable URL'
          : await timed('readback', () => conv.verifyStoredReadback(url, bytes.byteLength));
      if (mismatch !== null) {
        console.error(`[video-import] stored clip FAILED readback verification: ${mismatch}`);
        setPhase({
          kind: 'error',
          message: `The stored clip failed readback verification (${mismatch}). Remove the asset and re-import.`,
        });
        return;
      }
      // D-128 POSTER PARITY — the field gap this closes: "✓ plays" passed while
      // the canvas rendered BLANK, because the canvas's at-rest poster is a
      // different operation (a seek into one specific GOP) than anything the
      // playability verify exercised. Run the stored bytes through THE SAME
      // routine every stored-asset surface uses (canvas iframe / Inspector /
      // panel tile) so "import verified it" and "the canvas renders it" are the
      // same code path. Instant on healthy clips (the seek rung); on
      // seek-fragile clips the routine's sequential fallback proves the poster
      // is still producible (~1 s); only a clip whose poster cannot be produced
      // at all fails — loudly, at import.
      const posterMismatch =
        url === null
          ? null
          : await timed('poster-parity', () => verifyStoredPoster(url, posterTimeMs(measured)));
      if (posterMismatch !== null) {
        console.error(`[video-import] stored clip FAILED poster verification: ${posterMismatch}`);
        setPhase({
          kind: 'error',
          message: `The stored clip failed poster verification (${posterMismatch}). It would render blank on the canvas — remove the asset and re-import.`,
        });
        return;
      }
      // A SIGNIFICANT drop in fully-opaque coverage is a broadcast defect even when the
      // file plays (solid regions compositing semi-transparent) — flagged as a WARNING
      // in the result panel, source-relative (a sparse graphic stays quiet).
      const opaqueDrop =
        sourceAlpha !== null &&
        outputAlpha !== null &&
        sourceAlpha.opaqueFrac > 0.02 &&
        outputAlpha.opaqueFrac < sourceAlpha.opaqueFrac * 0.6;
      // The one-line cost breakdown the owner asked for — every stage on the
      // path from "Convert & import" to the result panel, plus which
      // corrections (the expensive pixel-math stages) were on.
      console.warn(
        `[video-import] timing — ${Object.entries(stageMs)
          .map(([k, v]) => `${k}: ${String(v)} ms`)
          .join(
            ', ',
          )} (corrections: premultiplied=${String(premultipliedAlpha)}, bleed=${String(alphaBleed)})`,
      );
      setPhase({
        kind: 'result',
        result: { asset, durationMs: measured, width: expectedW, height: expectedH },
        outputAlpha,
        opaqueDrop,
      });
    } catch (err) {
      setPhase({ kind: 'error', message: `Storing the converted clip failed: ${String(err)}` });
    } finally {
      hashAbort.current = null;
    }
  }

  /**
   * D-128 — "Use existing" on a duplicate: place an element from the already
   * imported asset instead of re-encoding. Dimensions come from the stored WebM
   * (post-crop = its intrinsic size); duration from the same metadata probe the
   * drag-from-assets path uses. Ends with an element placed, like every import.
   */
  async function useExisting(asset: AssetMeta): Promise<void> {
    const url = await window.cg.assets.url(asset.assetId);
    if (url === null) {
      setPhase({ kind: 'error', message: 'The already-imported clip could not be read.' });
      return;
    }
    const meta = await probeStoredVideo(url);
    if (meta === null || !(meta.durationMs > 0)) {
      setPhase({ kind: 'error', message: 'The already-imported clip could not be decoded.' });
      return;
    }
    props.onDone({
      asset,
      durationMs: meta.durationMs,
      width: meta.width,
      height: meta.height,
    });
  }

  function cancel(): void {
    cancelled.current = true;
    hashAbort.current?.abort(); // a Cancel during the pre-convert hash stops the read
    converter.current?.cancelConversion();
  }

  const converting = phase.kind === 'converting';
  const checking = phase.kind === 'checking';
  const busy = converting || checking; // a cancellable progress phase
  // Bug 4 — only show the duplicate actions while a match for the CURRENT params
  // actually exists; the effect above flips a no-longer-matching duplicate back
  // to 'ready', but guard the render for the in-between frame too.
  const showDuplicate = phase.kind === 'duplicate' && duplicateMatch !== null;
  const progressPct =
    phase.kind === 'converting' || phase.kind === 'checking' ? Math.round(phase.progress * 100) : 0;
  // The footer is the Modal shell's STICKY region (the body above scrolls). The
  // progress (hashing OR converting) lives HERE, above the action row, so it —
  // and the buttons — stay visible at every modal height even when the
  // fps-warning banner + crop fields push the body taller than the viewport.
  const footer = (
    <div className={s.footerStack}>
      {busy && (
        <div className={s.progressArea} data-testid="video-progress">
          <div
            className={s.progressTrack}
            role="progressbar"
            aria-label={checking ? 'Checking for a previous import' : 'Conversion progress'}
            aria-valuenow={progressPct}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className={s.progressFill}
              data-testid="video-progress-fill"
              style={{ width: `${String(progressPct)}%` }}
            />
          </div>
          <div className={s.meta}>
            {checking
              ? `Checking for a previous import… ${String(progressPct)}%`
              : `Converting… ${String(progressPct)}% (single-threaded — large sources take a while)`}
          </div>
        </div>
      )}
      <div className={s.footerActions}>
        {phase.kind === 'result' ? (
          <>
            <ModalButton variant="secondary" onClick={props.onClose}>
              Close without placing
            </ModalButton>
            <ModalButton variant="primary" onClick={() => props.onDone(phase.result)}>
              Place element
            </ModalButton>
          </>
        ) : showDuplicate && duplicateMatch !== null && phase.kind === 'duplicate' ? (
          <>
            <ModalButton
              variant="secondary"
              onClick={() => void runConversion(effectiveCrop, phase.sourceSha256)}
            >
              Convert again
            </ModalButton>
            <ModalButton variant="primary" onClick={() => void useExisting(duplicateMatch)}>
              Use existing
            </ModalButton>
          </>
        ) : (
          <>
            <ModalButton variant="secondary" onClick={busy ? cancel : props.onClose}>
              {converting ? 'Cancel conversion' : 'Cancel'}
            </ModalButton>
            <ModalButton
              variant="primary"
              onClick={() => void startImport()}
              disabled={phase.kind !== 'ready'}
            >
              {checking
                ? 'Checking…'
                : converting
                  ? 'Converting…'
                  : supersededRun
                    ? 'Convert again'
                    : 'Convert & import'}
            </ModalButton>
          </>
        )}
      </div>
    </div>
  );

  return (
    <Modal
      title="Import video"
      onClose={busy ? cancel : props.onClose}
      footer={footer}
      width="min(560px, 94vw)"
      closeOnBackdrop={!busy}
    >
      <div className={s.body}>
        {phase.kind === 'probing' && (
          <div className={s.meta} role="status">
            <span className={s.spinner} aria-hidden />
            Probing {props.file.name}…
          </div>
        )}

        {phase.kind === 'probe-failed' && (
          <>
            {phase.reason === 'no-stream' ? (
              <Callout variant="danger">
                {props.file.name} could not be read as a video — ffmpeg found no decodable video
                stream in it. The log below names the reason (codec / container).
              </Callout>
            ) : (
              // OUR worker crashed — the file may be fine; never blame it here.
              <Callout variant="caution">
                The converter hit an internal error and needs to reload — this does NOT mean{' '}
                {props.file.name} is unsupported. Close this dialog and try the import again.
              </Callout>
            )}
            {phase.logTail.length > 0 && (
              <pre className={s.logTail} data-testid="video-probe-log">
                {phase.logTail.join('\n')}
              </pre>
            )}
          </>
        )}

        {probe !== null && phase.kind !== 'probing' && phase.kind !== 'probe-failed' && (
          <>
            <div className={s.meta} data-testid="video-probe-meta">
              {props.file.name} — {probe.width}×{probe.height}
              {probe.fps > 0 ? `, ${String(probe.fps)} fps` : ''} ·{' '}
              {(probe.durationMs / 1000).toFixed(2)} s → VP8+alpha WebM at {String(projectFps)} fps
            </div>

            {notice !== null && <Callout variant="caution">{notice}</Callout>}

            {sourceAlpha !== null && sourceAlpha.nonTransparentFrac < 0.001 && (
              // D-128 — the invisible-clip trap: a 32-bit source whose alpha byte is zero
              // everywhere decodes and converts "successfully" and then paints NOTHING on
              // any surface. Say so BEFORE the operator waits through a conversion.
              <Callout variant="danger">
                This source appears FULLY TRANSPARENT — its alpha channel has no visible pixels (max
                α {sourceAlpha.maxA} of 255). It will render invisible on air. It was likely
                exported without an alpha channel (RGB-only in a 32-bit container). Re-export the
                source with alpha, or proceed only if this is intentional.
              </Callout>
            )}

            {showDuplicate && duplicateMatch !== null && (
              <Callout variant="caution">
                “{duplicateMatch.provenance?.sourceFilename ?? props.file.name}” was already
                imported with these settings (same crop and target frame rate). Use the existing
                clip, or convert a second copy. Changing the crop imports it as a new clip.
              </Callout>
            )}

            {posterUrl !== null && (
              <div ref={previewRef} className={s.previewBox}>
                <img
                  className={s.previewImg}
                  src={posterUrl}
                  alt={`First frame of ${props.file.name}`}
                  width={Math.round(probe.width * scale)}
                  height={Math.round(probe.height * scale)}
                  draggable={false}
                />
                {cropOn && (
                  <div
                    data-testid="video-crop-rect"
                    className={s.cropRect}
                    style={{
                      left: crop.x * scale,
                      top: crop.y * scale,
                      width: crop.width * scale,
                      height: crop.height * scale,
                    }}
                    onPointerDown={(e) => beginCropDrag(e, 'move')}
                  >
                    {(['nw', 'ne', 'sw', 'se'] as const).map((corner) => (
                      <span
                        key={corner}
                        data-testid={`video-crop-handle-${corner}`}
                        className={s.cropHandle}
                        style={{
                          left: corner.includes('w') ? 0 : '100%',
                          top: corner.includes('n') ? 0 : '100%',
                          cursor:
                            corner === 'nw' || corner === 'se' ? 'nwse-resize' : 'nesw-resize',
                        }}
                        onPointerDown={(e) => beginCropDrag(e, corner)}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className={s.fieldsRow}>
              <label className={s.fieldLabel}>
                <input
                  type="checkbox"
                  checked={cropOn}
                  disabled={busy}
                  data-testid="video-crop-toggle"
                  onChange={(e) => {
                    supersedeCompletedRun();
                    setCropOn(e.target.checked);
                  }}
                />{' '}
                Crop (baked at conversion)
              </label>
              {cropOn && (
                <>
                  {(
                    [
                      ['X', 'x', 0, probe.width - 1],
                      ['Y', 'y', 0, probe.height - 1],
                      ['W', 'width', 1, probe.width],
                      ['H', 'height', 1, probe.height],
                    ] as const
                  ).map(([label, key, min, max]) => (
                    <span key={key}>
                      <span className={s.fieldLabel}>{label}</span>
                      <RealtimeNumberInput
                        className={s.numInput}
                        value={crop[key]}
                        min={min}
                        max={max}
                        step={1}
                        ariaLabel={`Crop ${label}`}
                        onCommit={(v) => commitCrop({ [key]: v })}
                      />
                    </span>
                  ))}
                </>
              )}
            </div>

            <div className={s.fieldsRow}>
              <label className={s.fieldLabel}>
                <input
                  type="checkbox"
                  checked={premultipliedAlpha}
                  disabled={busy}
                  data-testid="video-premultiplied-toggle"
                  onChange={(e) => {
                    supersedeCompletedRun();
                    setPremultipliedAlpha(e.target.checked);
                  }}
                />{' '}
                Premultiplied alpha (legacy After Effects / archive)
              </label>
              <span className={s.meta}>
                {premultipliedAlpha
                  ? 'On — un-premultiplies a legacy premultiplied (matted-against-black) source to remove the black fringe on soft edges. Makes conversion SUBSTANTIALLY slower (~3× on measured clips). A source that is already correct will be visibly damaged by this — turn it back off unless you see the fringe.'
                  : 'Off (default) — the source is used as-is. Turn on only for a legacy premultiplied/matted source (e.g. an After Effects / rawvideo-BGRA archive clip) showing a black fringe on soft edges. Opting in makes conversion substantially slower.'}
              </span>
            </div>

            <div className={s.fieldsRow}>
              <label className={s.fieldLabel}>
                <input
                  type="checkbox"
                  checked={alphaBleed}
                  disabled={busy}
                  data-testid="video-alpha-bleed-toggle"
                  onChange={(e) => {
                    supersedeCompletedRun();
                    setAlphaBleed(e.target.checked);
                  }}
                />{' '}
                Alpha bleed (edge-colour fill)
              </label>
              <span className={s.meta}>
                {alphaBleed
                  ? 'On — fills transparent regions with colour extended from the nearest content, so any residual compression leak shows local colour instead of black smudges/halos around motion. Makes conversion SUBSTANTIALLY slower (~6× with both corrections on measured clips).'
                  : 'Off (default) — no fill. Turn on if the placed clip shows dark smudges/halos around moving content on air. Opting in makes conversion substantially slower.'}
              </span>
            </div>

            {supersededRun && phase.kind === 'ready' && (
              // D-128 stale-result coherence — the cleared verdict is NAMED, not
              // silently vanished: the operator changed an output-affecting
              // setting after a completed run, so nothing on screen describes
              // current bytes and nothing can be placed until a new conversion.
              <Callout variant="caution">
                <span data-testid="video-superseded-note">
                  Settings changed after the last conversion — its result no longer applies and
                  nothing can be placed from it. “Convert again” runs a new conversion with the
                  settings shown.
                </span>
              </Callout>
            )}

            {phase.kind === 'error' && <Callout variant="danger">{phase.message}</Callout>}

            {phase.kind === 'result' && (
              // D-128 — the CONVERSION RESULT panel, shown ALWAYS (never console-only):
              // a clear PASS for playability, alpha preservation at a glance, warnings
              // where they matter, raw numbers behind an expander.
              <div data-testid="video-conversion-result">
                <Callout variant={phase.opaqueDrop ? 'caution' : 'info'}>
                  <div>✓ Output plays (verified: metadata, 5-point seek sweep, playback span)</div>
                  <div>
                    {sourceAlpha === null || phase.outputAlpha === null
                      ? '• Alpha: profile unavailable (sampling failed — see console)'
                      : sourceAlpha.nonTransparentFrac < 0.001
                        ? '• Alpha: the SOURCE carries no visible pixels (see the warning above)'
                        : phase.opaqueDrop
                          ? `⚠ Alpha preserved, but fully-opaque coverage DROPPED sharply ` +
                            `(${(sourceAlpha.opaqueFrac * 100).toFixed(1)}% → ` +
                            `${(phase.outputAlpha.opaqueFrac * 100).toFixed(1)}%) — solid regions may ` +
                            `composite semi-transparent on air.`
                          : `✓ Alpha preserved (source ${(sourceAlpha.opaqueFrac * 100).toFixed(1)}% opaque → ` +
                            `output ${(phase.outputAlpha.opaqueFrac * 100).toFixed(1)}%)`}
                  </div>
                  {/* D-128 fast-path — with the corrections OFF by default, the panel
                      must POINT AT the relevant checkbox when the readings suggest one,
                      instead of leaving the operator to guess which to try. */}
                  {!premultipliedAlpha &&
                    sourceAlpha !== null &&
                    sourceAlpha.semiSampled > 500 &&
                    sourceAlpha.straightEvidenceFrac < 0.02 && (
                      <div data-testid="video-premult-hint">
                        ⚠ The source's semi-transparent pixels look PREMULTIPLIED (colour never
                        exceeds alpha). If the placed clip shows a black fringe on soft edges,
                        re-import with “Premultiplied alpha” ticked.
                      </div>
                    )}
                  {!alphaBleed &&
                    sourceAlpha !== null &&
                    phase.outputAlpha !== null &&
                    phase.outputAlpha.nonTransparentFrac >
                      sourceAlpha.nonTransparentFrac * 1.5 + 0.002 && (
                      <div data-testid="video-bleed-hint">
                        ⚠ Compression leaked visible alpha into source-transparent regions (
                        {(sourceAlpha.nonTransparentFrac * 100).toFixed(2)}% →{' '}
                        {(phase.outputAlpha.nonTransparentFrac * 100).toFixed(2)}% visible). If the
                        clip shows dark smudges/halos around moving content on air, re-import with
                        “Alpha bleed” ticked.
                      </div>
                    )}
                  <details>
                    <summary>Raw numbers</summary>
                    <div className={s.meta}>
                      source:{' '}
                      {sourceAlpha !== null
                        ? (converter.current?.formatAlphaStats(sourceAlpha) ?? '—')
                        : 'unavailable'}
                    </div>
                    <div className={s.meta}>
                      output:{' '}
                      {phase.outputAlpha !== null
                        ? (converter.current?.formatAlphaStats(phase.outputAlpha) ?? '—')
                        : 'unavailable'}
                    </div>
                    <div className={s.meta}>
                      stored: {phase.result.width}×{phase.result.height} ·{' '}
                      {(phase.result.durationMs / 1000).toFixed(2)} s ·{' '}
                      {(phase.result.asset.byteSize / 1024 / 1024).toFixed(2)} MB
                    </div>
                  </details>
                </Callout>
              </div>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
