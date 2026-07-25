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
  // D-128 BROADCAST QUALITY (2026-07-24) — the black smudges/halos during MOTION were
  // LOSSY ALPHA COMPRESSION: in WebM the alpha plane is a second VP8 stream encoded with
  // the SAME quality settings (no independent alpha control exists — `ffmpeg -h
  // encoder=libvpx` exposes none), and the old `-crf 12 -b:v 2M` let the quantiser climb
  // during motion until source-transparent pixels (α=0) decoded at α up to 30 over BLACK
  // matte RGB (measured: 56.7% of transparent pixels leaked in moving frames, 77% of the
  // visible leak black). Broadcast cleanliness beats size (owner decision): `-crf 4` +
  // `-qmax 16` BOUND the quantiser so alpha can never crumble (measured leak: max α 6,
  // 0.008% ≥4, zero ≥8 on a 720p particle-burst torture clip), and `-b:v 20M` is a
  // never-binding ceiling, not a target. Measured cost ~5.8× file size on the torture
  // clip (real furniture clips grow less — they are mostly static).
  '-crf',
  '4',
  '-qmax',
  '16',
  '-b:v',
  '20M',
  // ~1s keyframe interval (25fps clips): every seek decodes ≤1s instead of ≤5s (the
  // resume-window finding), +3.5% size measured. One revision bump carries both.
  '-g',
  '25',
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
 * and prompt a re-import. `2026-07-23.2` = the premultiplied-alpha fringe fix;
 * `2026-07-24.3` = broadcast quality (crf 4 / qmax 16), 1s GOP (`-g 25`), and the
 * ALPHA BLEED (transparent-region colour fill) — the lossy-alpha-leak fix;
 * `2026-07-25.4` = FAST PATH BY DEFAULT (owner decision): the pixel-math stages
 * (un-premultiply, alpha bleed) became opt-in corrections — a DEFAULT import's
 * output changes (no bleed), so the bump is required by this contract even though
 * the ENCODER args are untouched. No re-import is forced: bleed-on assets from
 * ≤ .3 are not defective (the bleed is a robustness layer, not a fix).
 */
export const CONVERTER_REVISION = '2026-07-25.4';

/**
 * D-128 — the geq expressions of the alpha pipeline. Why `geq` and not ffmpeg's
 * `premultiply`/`unpremultiply` filters: those divide/multiply by the FIRST plane
 * (red in packed rgba) — never the actual alpha — a proven no-op/corruption here.
 * `geq` is exact and IS present in the shipped `@ffmpeg/core` 0.12.10 wasm. The
 * single quotes protect the commas inside `if()`/`alpha(X,Y)` from the graph's own
 * comma separator (one argv element to `ffmpeg.exec`, never shell-parsed).
 */
// straight = premult · 255/α, α-guarded; alpha unchanged (the fringe fix).
const GEQ_UNPREMULT =
  'geq=' +
  "r='if(gt(alpha(X,Y),0),255*r(X,Y)/alpha(X,Y),0)':" +
  "g='if(gt(alpha(X,Y),0),255*g(X,Y)/alpha(X,Y),0)':" +
  "b='if(gt(alpha(X,Y),0),255*b(X,Y)/alpha(X,Y),0)':" +
  "a='alpha(X,Y)'";
// premult = straight · α/255 (the bleed branch of a STRAIGHT source needs a premult
// image so blur(premult)/blur(α) is an opacity-weighted average of TRUE colour).
const GEQ_PREMULT =
  'geq=' +
  "r='r(X,Y)*alpha(X,Y)/255':" +
  "g='g(X,Y)*alpha(X,Y)/255':" +
  "b='b(X,Y)*alpha(X,Y)/255':" +
  "a='alpha(X,Y)'";
// bled = blur(premult)/blur(α), OPAQUE output (α=255): the colour of the nearest
// opaque pixels extended into the transparent zone. The α>4 guard avoids amplifying
// noise where the blurred alpha is near zero (far from any content the bled stays
// black — measured leak out there is ≤3/255, invisible).
const GEQ_BLED_OPAQUE =
  'geq=' +
  "r='if(gt(alpha(X,Y),4),255*r(X,Y)/alpha(X,Y),0)':" +
  "g='if(gt(alpha(X,Y),4),255*g(X,Y)/alpha(X,Y),0)':" +
  "b='if(gt(alpha(X,Y),4),255*b(X,Y)/alpha(X,Y),0)':" +
  'a=255';

/**
 * D-128 ALPHA BLEED (2026-07-24) — fill the RGB of transparent/near-transparent
 * regions with colour EXTENDED from the nearest opaque pixels, instead of leaving
 * it black. VP8 compresses the alpha plane LOSSILY with the same quantiser as
 * colour, so motion leaks small non-zero alpha into source-transparent pixels; over
 * a black matte that leak reads as smudges/halos exactly where there is motion.
 * After the bleed, ANY residual leak shows plausible LOCAL COLOUR instead of black,
 * and chroma subsampling can't drag black into edges either (standard game/VFX
 * asset-pipeline practice). Measured: black share of visible leak 77% → 0%.
 *
 * The graph (all filters verified present in the wasm core):
 *
 *   [in] crop? → format=rgba → split=3 [fs][fb][fa]
 *   [fb] (premult if straight source) → boxblur=12:2 → GEQ_BLED_OPAQUE   → [bled]
 *   [fs] (GEQ_UNPREMULT if premultiplied source)                          → [straight]
 *   [bled][straight] overlay  — per-pixel straight-α mix: opaque keeps its own
 *                                colour, transparent shows the bled colour → [comp]
 *   [fa] alphaextract → [am];  [comp][am] alphamerge — the ORIGINAL alpha,
 *                                bit-exact, never altered by the bleed      → [out]
 *
 * blur(premult)/blur(α) is mathematically an opacity-weighted average of the TRUE
 * (un-matted) colour — the bleed extends true colour, not the crushed matte, which
 * is why the premultiplied path branches BEFORE its unpremultiply (the premult
 * input IS truecolour·α) and the straight path premultiplies first.
 */
function buildAlphaGraph(crop: CropRect | undefined, premultiplied: boolean): string {
  const cropStage =
    crop !== undefined ? `crop=${crop.width}:${crop.height}:${crop.x}:${crop.y},` : '';
  const bleedBranch = premultiplied
    ? `[fb]boxblur=12:2,${GEQ_BLED_OPAQUE}[bled]`
    : `[fb]${GEQ_PREMULT},boxblur=12:2,${GEQ_BLED_OPAQUE}[bled]`;
  const straightBranch = premultiplied ? `[fs]${GEQ_UNPREMULT}[straight]` : `[fs]null[straight]`;
  return (
    `[0:v]${cropStage}format=rgba,split=3[fs][fb][fa];` +
    `${bleedBranch};` +
    `${straightBranch};` +
    `[bled][straight]overlay=format=auto[comp];` +
    `[fa]alphaextract[am];` +
    `[comp][am]alphamerge[out]`
  );
}

/**
 * Build the conversion command. The optional crop is BAKED via ffmpeg's `crop`
 * filter (decision (c) — never a playback-time crop) and the output is ALWAYS
 * CONFORMED to the project channel's frame rate via `-r` (decision (d) — a
 * non-matching rate judders on air; conforming once at import fixes it cleanly).
 *
 * FAST PATH BY DEFAULT (owner decision 2026-07-25): a default import runs NO
 * pixel-math — no un-premultiply, no alpha bleed — exactly the spike's shape,
 * with the QUALITY settings kept (crf 4 / qmax 16 / -g 25 cost under a second
 * and are what fixed the alpha leak from 56.7% to ~0%). Measured on the 5 s
 * 1920×282 ladder: no-filter 5.4 s → +unpremultiply geq 17.1 s → +bleed 31.2 s
 * — the two geq stages are ~6× the whole cost, so each is a separate OPT-IN:
 *
 * - `premultipliedAlpha` — un-premultiplies a matted archive (black-fringe fix);
 *   a single linear `-vf` chain when it is the only correction.
 * - `alphaBleed` — the transparent-region colour fill (residual-leak robustness);
 *   needs the full split/overlay/alphamerge graph (`-filter_complex`).
 *
 * The two compose orthogonally in `buildAlphaGraph` when both are on. With
 * neither, the crop (if any) rides a plain `-vf crop` — no format round-trip.
 */
export function buildConvertArgs(opts: {
  inputPath: string;
  outputPath: string;
  targetFps: number;
  crop?: CropRect | undefined;
  premultipliedAlpha?: boolean | undefined;
  alphaBleed?: boolean | undefined;
}): string[] {
  const premultiplied = opts.premultipliedAlpha === true;
  const bleed = opts.alphaBleed === true;
  const cropChain =
    opts.crop !== undefined
      ? `crop=${opts.crop.width}:${opts.crop.height}:${opts.crop.x}:${opts.crop.y}`
      : '';
  const filterArgs: string[] = bleed
    ? ['-filter_complex', buildAlphaGraph(opts.crop, premultiplied), '-map', '[out]']
    : premultiplied
      ? ['-vf', `${cropChain !== '' ? `${cropChain},` : ''}format=rgba,${GEQ_UNPREMULT}`]
      : cropChain !== ''
        ? ['-vf', cropChain]
        : [];
  return [
    '-y',
    '-i',
    opts.inputPath,
    ...filterArgs,
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
  /** Whether the ALPHA BLEED (transparent-region colour fill) ran at conversion. */
  alphaBleed?: boolean | undefined;
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
    ...(opts.alphaBleed !== undefined ? { alphaBleed: opts.alphaBleed } : {}),
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
 * conversion parameters (source hash + target fps + crop + corrections) — the
 * pre-convert duplicate. A matching source with a DIFFERENT crop, fps, or
 * correction set is NOT a duplicate: its output genuinely differs, so it must
 * still convert. The match is also GATED ON THE CURRENT CONVERTER REVISION —
 * an asset produced by an older converter is a genuinely different output (and
 * for revisions ≤ 2026-07-24.3 the bleed ran implicitly, unrecorded), so a
 * re-import correctly re-encodes under the current algorithm instead of
 * offering the stale bytes. Returns the first match, or null.
 */
export function findDuplicateVideoAsset<
  A extends { kind: string; provenance?: VideoProvenance | undefined },
>(
  assets: readonly A[],
  match: {
    sourceSha256: string;
    targetFps: number;
    crop: CropRect | undefined;
    premultipliedAlpha?: boolean;
    alphaBleed?: boolean;
  },
): A | null {
  for (const a of assets) {
    const p = a.provenance;
    if (a.kind !== 'video' || p === undefined) continue;
    if (
      p.converterRevision === CONVERTER_REVISION &&
      p.sourceSha256 === match.sourceSha256 &&
      p.targetFps === match.targetFps &&
      cropsEqual(p.crop, match.crop) &&
      (p.premultipliedAlpha === true) === (match.premultipliedAlpha === true) &&
      (p.alphaBleed === true) === (match.alphaBleed === true)
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
