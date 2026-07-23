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
  fpsConformNotice,
  type CropRect,
  type SourceProbe,
} from './video-convert-args.js';
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
  | { kind: 'converting'; progress: number }
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
  const [posterUrl, setPosterUrl] = useState<string | null>(null);
  const [cropOn, setCropOn] = useState(false);
  const [crop, setCrop] = useState<CropRect>({ x: 0, y: 0, width: 1, height: 1 });
  const converter = useRef<Converter | null>(null);
  const cancelled = useRef(false);
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
        const result = await conv.probeSource(props.file, { signal: controller.signal });
        if (!alive) return;
        if (!result.ok) {
          setPhase({ kind: 'probe-failed', reason: result.reason, logTail: result.logTail });
          return;
        }
        setProbe(result.probe);
        setPosterUrl(result.posterUrl);
        setCrop({ x: 0, y: 0, width: result.probe.width, height: result.probe.height });
        setPhase({ kind: 'ready' });
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

  function commitCrop(next: Partial<CropRect>): void {
    if (probe === null) return;
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
      setCrop(clampCrop(next, probe.width, probe.height));
    };
    const onUp = (): void => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  async function convert(): Promise<void> {
    const conv = converter.current;
    if (conv === null || probe === null) return;
    cancelled.current = false;
    setPhase({ kind: 'converting', progress: 0 });
    const effectiveCrop = cropOn ? clampCrop(crop, probe.width, probe.height) : undefined;
    const bytes = await conv.convertToWebm({
      file: props.file,
      targetFps: projectFps,
      crop: effectiveCrop,
      onProgress: (ratio) =>
        setPhase({ kind: 'converting', progress: Math.max(0, Math.min(1, ratio)) }),
    });
    if (bytes === null) {
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
      setPhase({ kind: 'ready' });
      return;
    }
    try {
      // The SOURCE banner may have said `Duration: N/A` — the CONVERTED output
      // is the authoritative clock either way; fall back to the probe's figure.
      const measured =
        probe.durationMs > 0 ? probe.durationMs : await conv.measureDurationMs(bytes);
      if (!(measured > 0)) {
        setPhase({
          kind: 'error',
          message: 'The converted clip reports no duration — nothing was imported.',
        });
        return;
      }
      if (cancelled.current) {
        // Last exit before the point of no return — storeBytes commits the
        // asset; from there the import completes (reverting a stored asset is
        // not this seam's job).
        setPhase({ kind: 'ready' });
        return;
      }
      const webmName = props.file.name.replace(/\.[^.]*$/, '') + '.webm';
      const { asset } = await window.cg.assets.storeBytes({
        bytes,
        filename: webmName,
        kind: 'video',
        provenance: buildProvenance({
          sourceFilename: props.file.name,
          probe,
          targetFps: projectFps,
          crop: effectiveCrop,
        }),
      });
      props.onDone({
        asset,
        durationMs: measured,
        width: effectiveCrop?.width ?? probe.width,
        height: effectiveCrop?.height ?? probe.height,
      });
    } catch (err) {
      setPhase({ kind: 'error', message: `Storing the converted clip failed: ${String(err)}` });
    }
  }

  function cancel(): void {
    cancelled.current = true;
    converter.current?.cancelConversion();
  }

  const converting = phase.kind === 'converting';
  const footer = (
    <>
      <ModalButton variant="secondary" onClick={converting ? cancel : props.onClose}>
        {converting ? 'Cancel conversion' : 'Cancel'}
      </ModalButton>
      <ModalButton
        variant="primary"
        onClick={() => void convert()}
        disabled={phase.kind !== 'ready'}
      >
        {converting ? 'Converting…' : 'Convert & import'}
      </ModalButton>
    </>
  );

  return (
    <Modal
      title="Import video"
      onClose={converting ? cancel : props.onClose}
      footer={footer}
      width="min(560px, 94vw)"
      closeOnBackdrop={!converting}
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
                  disabled={converting}
                  data-testid="video-crop-toggle"
                  onChange={(e) => setCropOn(e.target.checked)}
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

            {converting && (
              <div>
                <div className={s.progressTrack} role="progressbar">
                  <div
                    className={s.progressFill}
                    data-testid="video-progress-fill"
                    style={{ width: `${String(Math.round(phase.progress * 100))}%` }}
                  />
                </div>
                <div className={s.meta}>
                  Converting… {Math.round(phase.progress * 100)}% (single-threaded — large sources
                  take a while)
                </div>
              </div>
            )}

            {phase.kind === 'error' && <Callout variant="danger">{phase.message}</Callout>}
          </>
        )}
      </div>
    </Modal>
  );
}
