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
 * Every sequence in `files`, largest first, plus the files that are not a frame of one (no number in
 * the name, or not a PNG / TGA).
 */
export function findImageSequences<F extends PickedFile>(
  files: readonly F[],
): { sequences: FoundSequence<F>[]; ignored: F[] } {
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
    if (run === null) {
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
  for (const g of groups.values()) {
    const numbers = [...g.byNumber.keys()].sort((a, b) => a - b);
    const frames = numbers.map((number) => ({ number, file: g.byNumber.get(number) as F }));
    const missing: number[] = [];
    const lo = numbers[0];
    const hi = numbers[numbers.length - 1];
    if (lo !== undefined && hi !== undefined) {
      const have = new Set(numbers);
      for (let n = lo; n <= hi; n++) if (!have.has(n)) missing.push(n);
    }
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
  return { sequences, ignored };
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
