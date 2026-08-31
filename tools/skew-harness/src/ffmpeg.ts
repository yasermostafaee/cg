import { execFile } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { promisify } from 'node:util';
import type { Rect } from './geometry.js';

const run = promisify(execFile);

/** Where the harness looks for ffmpeg/ffprobe: `CG_FFMPEG_DIR`, else the PATH. */
export function ffmpegBinaries(): { ffmpeg: string; ffprobe: string } {
  const dir = process.env['CG_FFMPEG_DIR'];
  if (dir !== undefined && dir.length > 0) {
    return { ffmpeg: path.join(dir, 'ffmpeg'), ffprobe: path.join(dir, 'ffprobe') };
  }
  return { ffmpeg: 'ffmpeg', ffprobe: 'ffprobe' };
}

/**
 * 🔴 **THE SOURCE PICTURE IS STATIC, AND THAT IS THE WHOLE REQUIREMENT.**
 *
 * Probe A answers "did the picture MOVE" by detecting the first frame that differs from its
 * predecessor. A source whose own content changes makes every frame differ, so the first
 * change is frame 1 and `k` is measured against nothing. The brief allows "high-contrast OR
 * moving"; only the first of those is compatible with a first-change detector, so the
 * pattern below is a still frame held for the whole clip.
 *
 * What it must ALSO be is spatially structured, because the mixer move is a change of
 * SCALE and CROP: two ramps give a large low-frequency change wherever the mapping shifts,
 * and the product of two sines gives fine structure so even a small shift moves edges
 * through the probe. A flat or slowly-varying picture would let a real move register as
 * codec noise.
 */
const PATTERN_EXPR: Readonly<Record<string, readonly [string, string, string]>> = {
  // r, g, b — deliberately PERMUTED between the two so the two plates are told apart by eye
  // in the recorded file when a human opens it at the frame indices the harness names.
  'skew-src-1': ['255*X/1920', '255*Y/1080', '128+127*sin(X/30)*sin(Y/30)'],
  'skew-src-2': ['128+127*sin(X/30)*sin(Y/30)', '255*X/1920', '255*Y/1080'],
  // `B-155` — the SWAP TARGET: the clip a catalog re-point retargets `src-1` at, inverted
  // from skew-src-1 so the replace landing is as loud as the geometry moving.
  'skew-src-3': ['255-255*X/1920', '255-255*Y/1080', '128-127*sin(X/30)*sin(Y/30)'],
};

/** The clips the CATALOG declares as sources, in CasparCG media-relative form. */
export const SOURCE_CLIPS = ['skew-src-1', 'skew-src-2'];

/** `B-155` — the clip the catalog re-point retargets `src-1` at, mid-run, while on air. */
export const SWAP_CLIP = 'skew-src-3';

/**
 * Generate the static pattern clips into CasparCG's media folder if they are not there.
 *
 * Two steps rather than one: `geq` is expensive per frame, so it renders ONE still and the
 * clip is that still held. A single-pass `geq` over 400 frames takes minutes and produces
 * exactly the same picture.
 */
export async function ensureSourceClips(mediaDir: string, seconds = 20): Promise<string[]> {
  const { ffmpeg } = ffmpegBinaries();
  const made: string[] = [];
  for (const [name, expr] of Object.entries(PATTERN_EXPR)) {
    const clip = path.join(mediaDir, `${name}.mp4`);
    if (fs.existsSync(clip)) continue;
    const still = path.join(mediaDir, `${name}-still.png`);
    const [r, g, b] = expr;
    await run(ffmpeg, [
      '-y',
      '-v',
      'error',
      '-f',
      'lavfi',
      '-i',
      'color=c=black:s=1920x1080:d=1:r=1',
      '-vf',
      `geq=r='${r}':g='${g}':b='${b}'`,
      '-frames:v',
      '1',
      still,
    ]);
    await run(ffmpeg, [
      '-y',
      '-v',
      'error',
      '-loop',
      '1',
      '-i',
      still,
      '-t',
      String(seconds),
      '-r',
      '50',
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      '-preset',
      'veryfast',
      '-crf',
      '14',
      clip,
    ]);
    fs.rmSync(still, { force: true });
    made.push(clip);
  }
  return made;
}

/**
 * `SKEW-RESIDUE-01` — **the full-frame background CLIP, still except for one moving patch.**
 *
 * The page-content axis needs the page to be doing real per-frame work: decoding and painting
 * a 1920×1080 video is exactly the work the owner's own template does. Two constraints pull
 * against each other and both are met here:
 *
 * - **STILL**, because the first-change detector reads "the first frame that differs from its
 *   predecessor" and a moving background makes every frame differ.
 * - **NOT ENTIRELY STILL**, because "the decoder is running" would otherwise be an assumption.
 *   One small patch (`BACKGROUND_MOTION_PATCH`) carries a bar that moves every frame — the
 *   positive control for the whole axis, placed where `probePlacementIssues` proves it touches
 *   neither probe nor any hole.
 *
 * The still content is the same `#1040C0` the painted background uses, so the two variants
 * differ in DECODE COST and in nothing the measurement reads.
 */
export async function ensureBackgroundClip(
  mediaDir: string,
  patch: Rect,
  seconds = 10,
): Promise<string> {
  const { ffmpeg } = ffmpegBinaries();
  const clip = path.join(mediaDir, 'skew-bg-video.webm');
  if (fs.existsSync(clip)) return clip;
  const x = String(patch.x);
  const y = String(patch.y);
  const h = String(patch.height);
  const span = String(Math.max(20, patch.width - 20));
  await run(
    ffmpeg,
    [
      '-y',
      '-v',
      'error',
      '-f',
      'lavfi',
      '-i',
      `color=c=0x1040C0:s=1920x1080:d=${String(seconds)}:r=50`,
      '-vf',
      // A white bar that walks across the patch and wraps — one moving thing, everywhere else
      // byte-identical frame to frame.
      `drawbox=x='${x}+mod(t*260\\,${span})':y=${y}:w=20:h=${h}:color=white:t=fill`,
      '-c:v',
      'libvpx',
      '-pix_fmt',
      'yuv420p',
      // Low, deliberately: the content is one still plus a 20 px bar, so the bitrate decides
      // the size of the DATA URI the page carries rather than the picture's fidelity.
      '-b:v',
      '800k',
      '-deadline',
      'realtime',
      '-cpu-used',
      '8',
      '-an',
      clip,
    ],
    { maxBuffer: 32 * 1024 * 1024 },
  );
  return clip;
}

/** What ffprobe says the recording actually contains — the cadence positive control. */
export interface RecordingFacts {
  readonly frames: number;
  readonly frameRate: string;
  readonly codec: string;
  readonly width: number;
  readonly height: number;
}

export async function describeRecording(file: string): Promise<RecordingFacts> {
  const { ffprobe } = ffmpegBinaries();
  const { stdout } = await run(ffprobe, [
    '-v',
    'error',
    '-select_streams',
    'v:0',
    '-count_frames',
    '-show_entries',
    'stream=nb_read_frames,r_frame_rate,codec_name,width,height',
    '-of',
    'default=nw=1',
    file,
  ]);
  const read = (key: string): string => new RegExp(`^${key}=(.*)$`, 'm').exec(stdout)?.[1] ?? '';
  return {
    frames: Number(read('nb_read_frames')),
    frameRate: read('r_frame_rate'),
    codec: read('codec_name'),
    width: Number(read('width')),
    height: Number(read('height')),
  };
}

/**
 * Decode ONE probe region of the recording to raw RGB24.
 *
 * Cropping in ffmpeg rather than in JS is not an optimisation detail: a 100×100 probe is
 * 30 KB per frame against 6.2 MB for the full raster, so a ten-run sweep reads about 15 MB
 * in total instead of 3 GB, and nothing has to hold a decoded 1080p sequence in memory.
 */
export async function extractProbe(file: string, probe: Rect): Promise<Uint8Array> {
  const { ffmpeg } = ffmpegBinaries();
  const crop = `crop=${String(probe.width)}:${String(probe.height)}:${String(probe.x)}:${String(probe.y)}`;
  const { stdout } = await run(
    ffmpeg,
    ['-v', 'error', '-i', file, '-vf', crop, '-pix_fmt', 'rgb24', '-f', 'rawvideo', '-'],
    { encoding: 'buffer', maxBuffer: 512 * 1024 * 1024 },
  );
  return new Uint8Array(stdout);
}

/** Bytes one probe frame occupies in the raw RGB24 stream. */
export function probeFrameBytes(probe: Rect): number {
  return probe.width * probe.height * 3;
}

/**
 * `SKEW-RESIDUE-01` — **the WHOLE frame, scaled down, for classifying what is on screen.**
 *
 * `k` says WHEN the two halves land; it says nothing about what the mismatch looks like, and
 * the owner reports two different-looking artefacts ("black" and "the previous boxes are
 * still there"). Telling those apart needs pixels everywhere, not two 100×100 probes.
 *
 * Scaled because area is a FRACTION and does not need 1080 lines to be measured: at 480×270 a
 * whole 4-second recording is ~78 MB of RGB rather than 1.2 GB, and one classified pixel is a
 * 4×4 block whose edges are the only thing lost. ⚠ `neighbor` scaling deliberately — a
 * smoothing filter would blend the boundary between a hole and its surround into colours that
 * belong to neither class, which is precisely the distinction being measured.
 */
export async function extractScaledFrames(
  file: string,
  width: number,
  height: number,
): Promise<Uint8Array> {
  const { ffmpeg } = ffmpegBinaries();
  const { stdout } = await run(
    ffmpeg,
    [
      '-v',
      'error',
      '-i',
      file,
      '-vf',
      `scale=${String(width)}:${String(height)}:flags=neighbor`,
      '-pix_fmt',
      'rgb24',
      '-f',
      'rawvideo',
      '-',
    ],
    { encoding: 'buffer', maxBuffer: 1024 * 1024 * 1024 },
  );
  return new Uint8Array(stdout);
}

/**
 * Write ONE frame of a recording out as a PNG, full size — the frame a report names so a
 * human can open it. The classifier's numbers are only as good as the frames behind them, and
 * "go and look at frame 137" is not a check anyone performs without the file.
 */
export async function dumpFramePng(file: string, index: number, out: string): Promise<void> {
  const { ffmpeg } = ffmpegBinaries();
  await run(ffmpeg, [
    '-y',
    '-v',
    'error',
    '-i',
    file,
    '-vf',
    `select=eq(n\\,${String(index)})`,
    '-vsync',
    '0',
    '-frames:v',
    '1',
    out,
  ]);
}
