/**
 * D-128 Phase 2 — the PURE half of the in-app video converter: ffmpeg argument
 * construction, probe-log parsing, and the frame-rate conform decision. No wasm,
 * no DOM — everything here is unit-testable without a 40-second browser encode
 * (the wasm-touching half lives in `video-convert.ts` and lazy-loads on first use).
 */

import type { VideoProvenance } from '@cg/shared-ipc';

/** A crop rect in SOURCE pixels (the modal's opt-in crop). */
export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** What the probe pass extracts from ffmpeg's banner log for a mounted source. */
export interface SourceProbe {
  /** Native frame rate as ffmpeg reports it (e.g. 25, 29.97). */
  fps: number;
  width: number;
  height: number;
  durationMs: number;
}

/**
 * The DECIDED conversion recipe (owner, real CasparCG 2.3.2 hardware,
 * 2026-07-22): VP8+alpha — `libvpx`, `-auto-alt-ref 0` (the alpha stream cannot
 * use alt-ref frames), `yuva420p`, audio STRIPPED (`-an`, decision (h)). VP9 is
 * out until the upstream `@ffmpeg/core` encode OOB is fixed (design.md).
 */
const VP8_ALPHA_ARGS = [
  '-c:v',
  'libvpx',
  '-pix_fmt',
  'yuva420p',
  '-auto-alt-ref',
  '0',
  '-crf',
  '12',
  '-b:v',
  '2M',
  '-deadline',
  'good',
  '-cpu-used',
  '5',
  '-an',
] as const;

/**
 * D-128 — the converter revision recorded in each asset's provenance. BUMP this
 * (bump the date, keep the counter monotonic) whenever the conversion OUTPUT
 * changes, so a future item can identify assets produced by an older converter
 * and prompt a re-import. `2026-07-23.2` = the premultiplied-alpha fringe fix.
 */
export const CONVERTER_REVISION = '2026-07-23.2';

/**
 * D-128 — UN-PREMULTIPLY straight-out the darkened RGB of a premultiplied
 * (matted-against-black) source, so semi-transparent pixels composite without the
 * black fringe (root cause A, proven: legacy AE/BGRA archives store RGB already
 * multiplied by alpha, and the browser/CasparCG composite assuming STRAIGHT alpha
 * — darkening those pixels a second time). straight = premult · 255 / alpha,
 * guarded at alpha 0 (fully transparent ⇒ 0, no divide-by-zero).
 *
 * Why `geq` and not the `unpremultiply` filter: ffmpeg's `unpremultiply` divides
 * by the FIRST plane (green in gbrap, the packed word in rgba) — never the actual
 * alpha — so single-input `inplace` is a proven no-op here; the 2-input alpha form
 * scrambles planes. `geq` is exact, and IS present in the shipped `@ffmpeg/core`
 * 0.12.10 wasm. The single quotes protect the commas inside `if()`/`alpha(X,Y)`
 * from the filtergraph's own comma separator — they are literal graph syntax (this
 * is one argv element to `ffmpeg.exec`, never shell-parsed). Chroma-subsample bleed
 * (cause B) measured negligible once A is fixed (≤4/255 at the extreme edge), so no
 * 4:4:4 / colour-fill is applied — it would inflate size for no visible gain.
 */
const UNPREMULTIPLY_FILTER =
  'format=rgba,geq=' +
  "r='if(gt(alpha(X,Y),0),255*r(X,Y)/alpha(X,Y),0)':" +
  "g='if(gt(alpha(X,Y),0),255*g(X,Y)/alpha(X,Y),0)':" +
  "b='if(gt(alpha(X,Y),0),255*b(X,Y)/alpha(X,Y),0)':" +
  "a='alpha(X,Y)'";

/**
 * Build the conversion command. The optional crop is BAKED via ffmpeg's `crop`
 * filter (decision (c) — never a playback-time crop) and the output is ALWAYS
 * CONFORMED to the project channel's frame rate via `-r` (decision (d) — a
 * non-matching rate judders on air; conforming once at import fixes it cleanly).
 *
 * `premultipliedAlpha` (D-128 fringe fix) prepends an UN-PREMULTIPLY pass so a
 * matted-against-black legacy archive composites without a black halo. It runs
 * AFTER the crop (crop selects the region; un-premultiply corrects its pixels) and
 * BEFORE the encode. Omit / false for a STRAIGHT-alpha source — un-premultiplying
 * one would over-brighten its semi-transparent pixels (the inverse error), so this
 * is never applied blindly; the import modal exposes it as an operator toggle
 * defaulting to the client's premultiplied archive.
 */
export function buildConvertArgs(opts: {
  inputPath: string;
  outputPath: string;
  targetFps: number;
  crop?: CropRect | undefined;
  premultipliedAlpha?: boolean | undefined;
}): string[] {
  const stages: string[] = [];
  if (opts.crop !== undefined) {
    stages.push(`crop=${opts.crop.width}:${opts.crop.height}:${opts.crop.x}:${opts.crop.y}`);
  }
  if (opts.premultipliedAlpha === true) stages.push(UNPREMULTIPLY_FILTER);
  const filter = stages.length > 0 ? ['-vf', stages.join(',')] : [];
  return [
    '-y',
    '-i',
    opts.inputPath,
    ...filter,
    ...VP8_ALPHA_ARGS,
    '-r',
    String(opts.targetFps),
    opts.outputPath,
  ];
}

/**
 * Extract ONE source frame as a PNG — the modal's crop-preview image. When
 * `atSec` is given, seek there first with a FAST keyframe seek (`-ss` BEFORE
 * `-i`; poster accuracy is irrelevant) so the preview is a MID-CLIP frame, not
 * frame 0 — D-128 decision (a): furniture clips often open on a transparent
 * frame, so a frame-0 poster reads as a blank box. Omit `atSec` (or ≤ 0) to
 * keep the frame-0 behaviour (e.g. a source whose duration is unknown).
 */
export function buildPosterArgs(inputPath: string, outputPath: string, atSec?: number): string[] {
  const seek = atSec !== undefined && atSec > 0 ? ['-ss', atSec.toFixed(3)] : [];
  return ['-y', ...seek, '-i', inputPath, '-frames:v', '1', '-f', 'image2', outputPath];
}

/**
 * D-128 decision (a) — the poster / at-rest frame TIME (ms) for a video, shared
 * by the import-modal source preview, the canvas at-rest render, the Inspector,
 * and the assets-panel thumbnail. Mirrors the D-125 Lottie poster rule
 * (`runtime.ts` — `phases.introEnd ?? midpoint`): use the IN-point when the
 * element carries one (that authored hold frame is meaningful), else the clip
 * midpoint (~50%). A clip's opening frame is frequently transparent, so neither
 * frame 0 nor a stored poster is used — the frame is DERIVED from these facts.
 */
export function posterTimeMs(durationMs: number, introEndMs?: number): number {
  if (introEndMs !== undefined && introEndMs > 0 && introEndMs < durationMs) return introEndMs;
  return durationMs > 0 ? Math.round(durationMs / 2) : 0;
}

/**
 * Parse ffmpeg's banner/stream log lines (a probe run: `-i <input>` with no
 * output — it exits non-zero by design, the LOG carries the metadata).
 * Returns null when no video stream is found.
 */
export function parseProbeLog(lines: readonly string[]): SourceProbe | null {
  let fps: number | null = null;
  let width: number | null = null;
  let height: number | null = null;
  let durationMs: number | null = null;
  for (const line of lines) {
    const dur = /Duration:\s*(\d+):(\d{2}):(\d{2})\.(\d{2})/.exec(line);
    if (dur !== null) {
      durationMs =
        Number(dur[1]) * 3_600_000 +
        Number(dur[2]) * 60_000 +
        Number(dur[3]) * 1000 +
        Number(dur[4]) * 10;
    }
    if (line.includes('Video:')) {
      const dims = /,\s*(\d{2,5})x(\d{2,5})(?:\s*\[|,|\s*$)/.exec(line);
      if (dims !== null) {
        width = Number(dims[1]);
        height = Number(dims[2]);
      }
      const rate = /,\s*([\d.]+)\s+fps/.exec(line);
      if (rate !== null) fps = Number(rate[1]);
    }
  }
  if (width === null || height === null) return null;
  // Some containers omit an fps figure on the stream line, and some report
  // `Duration: N/A` — neither may abort the import. fps 0 = "unknown" (the
  // conform proceeds warning-free); durationMs 0 = "unknown" (the modal measures
  // the CONVERTED output instead, which is authoritative anyway).
  return { fps: fps ?? 0, width, height, durationMs: durationMs ?? 0 };
}

/**
 * Decision (d) — CONFORM + WARN. The conversion always proceeds and the output
 * is always written at the project channel's rate; when the source rate is known
 * and differs, the modal shows this explicit consequence-stating warning so the
 * operator proceeds with eyes open. Returns null when no warning is needed
 * (rates match within tolerance, or the source rate is unknown).
 */
export function fpsConformNotice(sourceFps: number, targetFps: number): string | null {
  if (sourceFps <= 0) return null; // unknown source rate — conform silently
  if (Math.abs(sourceFps - targetFps) < 0.01) return null;
  return (
    `Source is ${String(sourceFps)} fps; conforming to the project channel's ` +
    `${String(targetFps)} fps. Motion may show minor judder / duplicated or dropped ` +
    `frames; re-export the source at ${String(targetFps)} fps for best results.`
  );
}

/** Assemble the provenance record stored with the converted asset (owner decision). */
export function buildProvenance(opts: {
  sourceFilename: string;
  probe: SourceProbe;
  targetFps: number;
  crop?: CropRect | undefined;
  /** sha256 of the source bytes — the pre-convert dedupe key (D-128). */
  sourceSha256?: string | undefined;
  /** Source file size in bytes. */
  sourceBytes?: number | undefined;
  /** Whether the source was treated as premultiplied (un-premultiplied at conversion). */
  premultipliedAlpha?: boolean | undefined;
}): VideoProvenance {
  return {
    sourceFilename: opts.sourceFilename,
    sourceFps: opts.probe.fps,
    targetFps: opts.targetFps,
    sourceWidth: opts.probe.width,
    sourceHeight: opts.probe.height,
    // The CURRENT converter revision — always recorded so a future item can spot
    // assets produced by an older converter (e.g. those carrying the pre-fix fringe).
    converterRevision: CONVERTER_REVISION,
    ...(opts.sourceSha256 !== undefined ? { sourceSha256: opts.sourceSha256 } : {}),
    ...(opts.sourceBytes !== undefined ? { sourceBytes: opts.sourceBytes } : {}),
    ...(opts.crop !== undefined ? { crop: opts.crop } : {}),
    ...(opts.premultipliedAlpha !== undefined
      ? { premultipliedAlpha: opts.premultipliedAlpha }
      : {}),
  };
}

/**
 * Are two crop rects the same for dedupe purposes? Both absent ⇒ equal (full
 * frame); one absent ⇒ different; else an exact x/y/w/h match. (D-128 dedupe:
 * the same source with a DIFFERENT crop is genuinely a different output.)
 */
export function cropsEqual(a: CropRect | undefined, b: CropRect | undefined): boolean {
  if (a === undefined || b === undefined) return a === b;
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}

/**
 * Find a video asset already imported from the SAME source with the SAME
 * conversion parameters (source hash + target fps + crop) — the pre-convert
 * duplicate. A matching source with a DIFFERENT crop or fps is NOT a duplicate:
 * its output genuinely differs, so it must still convert. Returns the first
 * match, or null.
 */
export function findDuplicateVideoAsset<
  A extends { kind: string; provenance?: VideoProvenance | undefined },
>(
  assets: readonly A[],
  match: { sourceSha256: string; targetFps: number; crop: CropRect | undefined },
): A | null {
  for (const a of assets) {
    const p = a.provenance;
    if (a.kind !== 'video' || p === undefined) continue;
    if (
      p.sourceSha256 === match.sourceSha256 &&
      p.targetFps === match.targetFps &&
      cropsEqual(p.crop, match.crop)
    ) {
      return a;
    }
  }
  return null;
}

/** Clamp a crop rect inside the source bounds (the modal's single clamp rule). */
export function clampCrop(crop: CropRect, sourceW: number, sourceH: number): CropRect {
  const width = Math.min(Math.max(1, Math.round(crop.width)), sourceW);
  const height = Math.min(Math.max(1, Math.round(crop.height)), sourceH);
  const x = Math.min(Math.max(0, Math.round(crop.x)), sourceW - width);
  const y = Math.min(Math.max(0, Math.round(crop.y)), sourceH - height);
  return { x, y, width, height };
}
