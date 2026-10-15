import { latinDigits } from '@cg/text-shaping';

/**
 * `D-164` — **a numbered IMAGE SEQUENCE, found in a pick of files or a folder**, before anything is
 * converted. PURE (header reads aside, which take a `Blob`), so ordering, gaps and grouping are
 * tested without a browser.
 *
 * A frame is a file whose name — extension aside — carries a number: its LAST run of digits, in any
 * of the three digit sets (`frame_7.png`, `frame_007.png`, `فریم۷.png`). Frames sharing the text
 * around that number, the folder they sit in and the extension are ONE sequence; a folder holding
 * `a_*.png` and `b_*.png` holds two, and the author picks one. Order is the NUMBER, never the
 * name's text, so `f2` comes before `f10` and `f۲` before `f۱۰`.
 *
 * ⚠ The numbers never reach ffmpeg: the converter renames the ordered frames `000001 …`
 * (`video-convert.ts`), so a gap or an unusual digit set is decided HERE, where the author is told
 * by name, and never by ffmpeg's file-pattern matching.
 */

/** The formats a sequence may be in — both decode WITH alpha in the shipped core (measured, §0). */
export const SEQUENCE_EXTENSIONS = ['png', 'tga'] as const;
export type SequenceExt = (typeof SEQUENCE_EXTENSIONS)[number];

/** The picker hint for a sequence pick. */
export const SEQUENCE_ACCEPT = '.png,.tga,image/png';

/** A picked file as this module needs it: its name, and the folder path a folder pick gives. */
export interface PickedFile {
  readonly name: string;
  readonly webkitRelativePath?: string;
}

export interface SequenceFrame<F extends PickedFile> {
  readonly file: F;
  /** The frame's number in its own name, read in any digit set. */
  readonly number: number;
}

export interface FoundSequence<F extends PickedFile> {
  /** What the frames share: the text before and after their number, their folder and extension. */
  readonly prefix: string;
  readonly suffix: string;
  readonly folder: string;
  readonly ext: SequenceExt;
  /** The frames in NUMBER order. */
  readonly frames: readonly SequenceFrame<F>[];
  /** Numbers between the first and the last that no file carries — a gap, named by its number. */
  readonly missing: readonly number[];
  /** A second file carrying a number already taken (`f1.png` and `f01.png`); not converted. */
  readonly duplicates: readonly F[];
}

/** The file name a missing frame would have had, written with the sequence's own padding. */
export function missingFrameName<F extends PickedFile>(seq: FoundSequence<F>, n: number): string {
  const sample = seq.frames[0];
  const width = sample === undefined ? 0 : (digitRun(stem(sample.file.name))?.digits.length ?? 0);
  const digits = String(n).padStart(width, '0');
  return `${seq.prefix}${digits}${seq.suffix}.${seq.ext}`;
}

/** The sequence's short label: `frame_1 … frame_300.png (300 frames)`. */
export function sequenceLabel<F extends PickedFile>(seq: FoundSequence<F>): string {
  const first = seq.frames[0]?.file.name ?? '';
  const last = seq.frames[seq.frames.length - 1]?.file.name ?? '';
  const n = seq.frames.length;
  return n === 1 ? first : `${first} … ${last} (${String(n)} frames)`;
}

/**
 * The asset name the converted WebM takes: the frames' shared text without a trailing separator,
 * else the first frame's stem.
 */
export function sequenceAssetName<F extends PickedFile>(seq: FoundSequence<F>): string {
  const base = `${seq.prefix}${seq.suffix}`.replace(/[\s._-]+$/u, '').replace(/^[\s._-]+/u, '');
  if (base !== '') return `${base}.webm`;
  const first = seq.frames[0]?.file.name ?? 'sequence';
  return `${stem(first)}.webm`;
}

/**
 * 🔴 `DELTA-RUN-NEXT-VERSION-01-I` — **THE MOST FRAMES A RUN MAY SPAN AND STILL BE LISTED**, counted
 * from its first number to its last (every hole is a frame that is held). It bounds the lists that
 * grow with the run (the holes, the frames handed on) whatever the frames' size — ten minutes at
 * 50 fps. What a run may CONVERT is the tighter {@link MAX_SEQUENCE_PIXELS}, judged once the frames'
 * size is read.
 */
export const MAX_SEQUENCE_FRAMES = 30_000;

/**
 * 🔴 `DELTA-RUN-NEXT-VERSION-01-I` — **WHAT ONE IMPORT MAY CONVERT, in pixels (frames × width ×
 * height)**: 3,000 frames of 1920×1080 — a minute at 50 fps. MEASURED in Chrome through the real
 * import (the largest renderer's private memory): 300 frames of 1080p RGBA peaked at 459 MB, 900 at
 * 589 MB — about 394 MB plus 0.22 MB a frame — so this budget is ~1.05 GB, with room left for
 * heavier pictures than the test frames. Over it, the step says so and offers no Continue: a job too
 * large is refused before it starts, never by the tab running out of memory.
 */
export const MAX_SEQUENCE_PIXELS = 3_000 * 1920 * 1080;

/** Whether converting `frames` frames of `width` × `height` is over {@link MAX_SEQUENCE_PIXELS}. */
export function overConvertBudget(frames: number, width: number, height: number): boolean {
  return frames * width * height > MAX_SEQUENCE_PIXELS;
}

/** The one sentence for a sequence over the convert budget: its size, and what fits at that size. */
export function overBudgetSentence(
  frames: number,
  width: number,
  height: number,
  fps: number,
): string {
  const fit = Math.max(1, Math.floor(MAX_SEQUENCE_PIXELS / Math.max(1, width * height)));
  const seconds = Math.round((fit / Math.max(1, fps)) * 10) / 10;
  return `${String(frames)} frames of ${String(width)}×${String(height)} are more than one import can convert in this browser: at most ${String(fit)} at this size (${String(seconds)} s at ${String(fps)} fps). Pick fewer frames.`;
}

/**
 * How sparse a run of numbers may be and still be ONE sequence: at most this many missing numbers
 * for every picture there is. A render with a held gap (two renders in one folder, a dropped frame)
 * is well inside it; pictures named by far-apart numbers (a camera's or a phone's time stamps) are
 * not.
 */
export const MAX_HOLES_PER_FRAME = 4;

/**
 * A run of numbered pictures that is NOT imported, and why — said to the author in one sentence:
 * `apart` — named by numbers far apart, so not one sequence at all; `too-long` — one after another,
 * but longer than {@link MAX_SEQUENCE_FRAMES}.
 */
export interface RefusedRun<F extends PickedFile> {
  readonly reason: 'apart' | 'too-long';
  readonly files: readonly F[];
  /** The first and the last number, and how many frames the run would make. */
  readonly first: number;
  readonly last: number;
  readonly span: number;
}

/**
 * Every sequence in `files`, largest first; the runs that are not imported (`refused`, with why);
 * and the files that are not a frame of one (no number in the name, or not a PNG / TGA).
 *
 * 🔴 `DELTA-RUN-NEXT-VERSION-01-I` — the span is judged by ARITHMETIC before anything is listed: the
 * hole list used to be built by counting from the first number to the last, and 38 pictures named
 * by time stamps (a span of ~10¹⁰) took the tab down — measured +247 MB at a span of only 10⁷.
 * Nothing here grows with a run's span unless the run is accepted, and an accepted run's span is at
 * most {@link MAX_SEQUENCE_FRAMES}.
 */
export function findImageSequences<F extends PickedFile>(
  files: readonly F[],
): { sequences: FoundSequence<F>[]; refused: RefusedRun<F>[]; ignored: F[] } {
  const groups = new Map<
    string,
    {
      prefix: string;
      suffix: string;
      folder: string;
      ext: SequenceExt;
      byNumber: Map<number, F>;
      dup: F[];
    }
  >();
  const ignored: F[] = [];
  for (const file of files) {
    const ext = extensionOf(file.name);
    if (!(SEQUENCE_EXTENSIONS as readonly string[]).includes(ext)) {
      ignored.push(file);
      continue;
    }
    const base = stem(file.name);
    const run = digitRun(base);
    // A number too long to be counted exactly is not a frame number.
    if (run === null || !Number.isSafeInteger(run.number)) {
      ignored.push(file);
      continue;
    }
    const folder = folderOf(file);
    const key = JSON.stringify([folder, run.prefix, run.suffix, ext]);
    let g = groups.get(key);
    if (g === undefined) {
      g = {
        prefix: run.prefix,
        suffix: run.suffix,
        folder,
        ext: ext as SequenceExt,
        byNumber: new Map(),
        dup: [],
      };
      groups.set(key, g);
    }
    if (g.byNumber.has(run.number)) g.dup.push(file);
    else g.byNumber.set(run.number, file);
  }
  const sequences: FoundSequence<F>[] = [];
  const refused: RefusedRun<F>[] = [];
  for (const g of groups.values()) {
    const numbers = [...g.byNumber.keys()].sort((a, b) => a - b);
    const frames = numbers.map((number) => ({ number, file: g.byNumber.get(number) as F }));
    const lo = numbers[0];
    const hi = numbers[numbers.length - 1];
    if (lo === undefined || hi === undefined) continue;
    // Judged BEFORE anything is counted out, so a far-apart run costs nothing.
    const span = hi - lo + 1;
    const holes = span - numbers.length;
    if (holes > MAX_HOLES_PER_FRAME * numbers.length || span > MAX_SEQUENCE_FRAMES) {
      refused.push({
        reason: holes > MAX_HOLES_PER_FRAME * numbers.length ? 'apart' : 'too-long',
        files: [...frames.map((f) => f.file), ...g.dup],
        first: lo,
        last: hi,
        span,
      });
      continue;
    }
    const missing: number[] = [];
    const have = new Set(numbers);
    for (let n = lo; n <= hi; n++) if (!have.has(n)) missing.push(n);
    sequences.push({
      prefix: g.prefix,
      suffix: g.suffix,
      folder: g.folder,
      ext: g.ext,
      frames,
      missing,
      duplicates: g.dup,
    });
  }
  sequences.sort(
    (a, b) =>
      b.frames.length - a.frames.length ||
      a.folder.localeCompare(b.folder) ||
      a.prefix.localeCompare(b.prefix),
  );
  refused.sort((a, b) => b.files.length - a.files.length);
  return { sequences, refused, ignored };
}

/**
 * The one sentence for a pick that holds no sequence to import (`DELTA-RUN-NEXT-VERSION-01-I`): far-apart
 * pictures are named as pictures, a run too long is named with its length and the limit, and a pick
 * with no numbered frame says that. Never a crash, never silence.
 */
export function noSequenceSentence<F extends PickedFile>(
  refused: readonly RefusedRun<F>[],
  fps: number,
): string {
  const top = refused[0];
  if (top === undefined) return 'No numbered PNG or TGA frames in the selection.';
  const n = top.files.length;
  if (top.reason === 'apart') {
    return `These ${String(n)} pictures are numbered far apart (${String(top.first)} … ${String(top.last)}), so they are not an image sequence. To use them as pictures, import them with Image….`;
  }
  const minutes = Math.round((MAX_SEQUENCE_FRAMES / Math.max(1, fps) / 60) * 10) / 10;
  return `This image sequence runs ${String(top.span)} frames (${String(top.first)} … ${String(top.last)}); one import can make at most ${String(MAX_SEQUENCE_FRAMES)} (${String(minutes)} min at ${String(fps)} fps). Pick fewer frames.`;
}

/**
 * The frames the converter takes: ONE PER NUMBER from the first to the last, so every frame keeps
 * its own time (`number / rate`). A missing number, and a frame left out (another size, an
 * unreadable header), is HELD — the frame before it shows again — never closed up, which would pull
 * every later frame earlier, and never scaled, which would distort it. Before the first usable
 * frame, that frame is held. `held` counts the slots filled that way; `frames` is empty when no
 * frame is usable.
 */
export function framesToConvert<F extends PickedFile>(
  seq: FoundSequence<F>,
  leftOut: ReadonlySet<F> = new Set<F>(),
): { frames: F[]; held: number } {
  const usable = seq.frames.filter((f) => !leftOut.has(f.file));
  const first = usable[0];
  const lo = seq.frames[0]?.number;
  const hi = seq.frames[seq.frames.length - 1]?.number;
  if (first === undefined || lo === undefined || hi === undefined) return { frames: [], held: 0 };
  const byNumber = new Map(usable.map((f) => [f.number, f.file]));
  const frames: F[] = [];
  let held = 0;
  let previous = first.file;
  for (let n = lo; n <= hi; n++) {
    const file = byNumber.get(n);
    if (file === undefined) {
      frames.push(previous);
      held++;
    } else {
      previous = file;
      frames.push(file);
    }
  }
  return { frames, held };
}

/** A frame whose pixel size differs from the size most of the sequence has. */
export interface SizeMismatch<F extends PickedFile> {
  readonly file: F;
  readonly width: number;
  readonly height: number;
}

/**
 * The frames whose size is not the sequence's own — the size most of its frames have — and that
 * size. A frame whose header could not be read is reported too (`width` and `height` 0): it cannot
 * be checked, so the author is told rather than the converter left to fail on it.
 */
export function sizeMismatches<F extends PickedFile>(
  frames: readonly F[],
  sizes: readonly ({ width: number; height: number } | null)[],
): { size: { width: number; height: number } | null; mismatches: SizeMismatch<F>[] } {
  const count = new Map<string, number>();
  for (const s of sizes) {
    if (s === null) continue;
    const k = `${String(s.width)}x${String(s.height)}`;
    count.set(k, (count.get(k) ?? 0) + 1);
  }
  let best: string | null = null;
  for (const [k, n] of count) if (best === null || n > (count.get(best) ?? 0)) best = k;
  if (best === null) {
    return {
      size: null,
      mismatches: frames.map((file) => ({ file, width: 0, height: 0 })),
    };
  }
  const [bw, bh] = best.split('x').map(Number) as [number, number];
  const mismatches: SizeMismatch<F>[] = [];
  frames.forEach((file, i) => {
    const s = sizes[i] ?? null;
    if (s === null) mismatches.push({ file, width: 0, height: 0 });
    else if (s.width !== bw || s.height !== bh)
      mismatches.push({ file, width: s.width, height: s.height });
  });
  return { size: { width: bw, height: bh }, mismatches };
}

/**
 * The pixel size from a frame's HEADER — the first bytes only, so 300 frames cost 300 tiny reads.
 * PNG: the `IHDR` (big-endian width and height at 16 and 20). TGA: the 18-byte header
 * (little-endian width and height at 12 and 14). `null` when the bytes are not that format.
 */
export async function readFrameSize(
  file: Blob,
  ext: SequenceExt,
): Promise<{ width: number; height: number } | null> {
  const bytes = new Uint8Array(await file.slice(0, 24).arrayBuffer());
  return frameSizeFromHeader(bytes, ext);
}

/** The header half of {@link readFrameSize}, on bytes already in hand. */
export function frameSizeFromHeader(
  bytes: Uint8Array,
  ext: SequenceExt,
): { width: number; height: number } | null {
  if (ext === 'png') {
    const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    if (bytes.length < 24 || !sig.every((b, i) => bytes[i] === b)) return null;
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const width = view.getUint32(16);
    const height = view.getUint32(20);
    return width > 0 && height > 0 ? { width, height } : null;
  }
  if (bytes.length < 18) return null;
  const imageType = bytes[2] ?? 0;
  if (![1, 2, 3, 9, 10, 11].includes(imageType)) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = view.getUint16(12, true);
  const height = view.getUint16(14, true);
  return width > 0 && height > 0 ? { width, height } : null;
}

function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot === -1 ? '' : name.slice(dot + 1).toLowerCase();
}

function stem(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot === -1 ? name : name.slice(0, dot);
}

/** The folder a folder pick reports for a file (`''` for a plain pick). */
function folderOf(file: PickedFile): string {
  const rel = file.webkitRelativePath ?? '';
  const slash = rel.lastIndexOf('/');
  return slash === -1 ? '' : rel.slice(0, slash);
}

/**
 * The LAST run of digits in `base`, in any digit set. `latinDigits` maps each Persian or
 * Arabic-Indic digit to one Latin digit, so positions in the mapped text are positions in the
 * original, whose own characters the prefix and suffix keep.
 */
function digitRun(
  base: string,
): { prefix: string; digits: string; suffix: string; number: number } | null {
  const latin = latinDigits(base);
  let end = -1;
  for (let i = latin.length - 1; i >= 0; i--) {
    if (/[0-9]/.test(latin[i] ?? '')) {
      end = i + 1;
      break;
    }
  }
  if (end === -1) return null;
  let start = end - 1;
  while (start > 0 && /[0-9]/.test(latin[start - 1] ?? '')) start--;
  const digits = latin.slice(start, end);
  return {
    prefix: base.slice(0, start),
    digits,
    suffix: base.slice(end),
    number: Number(digits),
  };
}
