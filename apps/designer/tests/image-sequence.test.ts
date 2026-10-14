import { describe, expect, it } from 'vitest';
import {
  findImageSequences,
  frameSizeFromHeader,
  framesToConvert,
  missingFrameName,
  sequenceAssetName,
  sequenceLabel,
  sizeMismatches,
} from '../src/renderer/features/assets/image-sequence.js';

/**
 * `D-164` — finding a numbered image sequence in a pick, before anything converts: natural order by
 * the NUMBER (any digit set), gaps named, several sequences in one folder told apart, and each
 * frame's pixel size read from its header.
 */

const f = (name: string, webkitRelativePath = '') => ({ name, webkitRelativePath });

describe('D-164 — findImageSequences', () => {
  it('🔴 orders by the NUMBER: f2 before f10, not by text', () => {
    const { sequences } = findImageSequences(
      ['f10.png', 'f2.png', 'f1.png', 'f11.png'].map((n) => f(n)),
    );
    expect(sequences).toHaveLength(1);
    expect(sequences[0]?.frames.map((x) => x.file.name)).toEqual([
      'f1.png',
      'f2.png',
      'f10.png',
      'f11.png',
    ]);
  });

  it('🔴 Persian and Arabic-Indic digits are numbers too', () => {
    const { sequences } = findImageSequences(
      ['فریم۱۰.png', 'فریم۲.png', 'فریم۱.png', 'فریم٣.png'].map((n) => f(n)),
    );
    expect(sequences).toHaveLength(1);
    expect(sequences[0]?.frames.map((x) => x.number)).toEqual([1, 2, 3, 10]);
    expect(sequences[0]?.prefix).toBe('فریم');
  });

  it('padding is kept apart from the number: frame_0007 is 7', () => {
    const { sequences } = findImageSequences(['frame_0007.png', 'frame_0006.png'].map((n) => f(n)));
    expect(sequences[0]?.frames.map((x) => x.number)).toEqual([6, 7]);
    expect(sequences[0]?.prefix).toBe('frame_');
  });

  it("🔴 a GAP is named by the file it would have been, in the sequence's own padding", () => {
    const names = ['shot_001.png', 'shot_002.png', 'shot_005.png'];
    const { sequences } = findImageSequences(names.map((n) => f(n)));
    const seq = sequences[0];
    expect(seq?.missing).toEqual([3, 4]);
    if (seq === undefined) throw new Error('no sequence');
    expect(seq.missing.map((n) => missingFrameName(seq, n))).toEqual([
      'shot_003.png',
      'shot_004.png',
    ]);
  });

  it('🔴 a folder holding TWO sequences gives two, largest first', () => {
    const { sequences } = findImageSequences([
      f('a_1.png'),
      f('a_2.png'),
      f('b_1.png'),
      f('b_2.png'),
      f('b_3.png'),
    ]);
    expect(sequences.map((s) => [s.prefix, s.frames.length])).toEqual([
      ['b_', 3],
      ['a_', 2],
    ]);
  });

  it('the same names in two FOLDERS of one folder pick are two sequences', () => {
    const { sequences } = findImageSequences([
      f('x_1.png', 'take/one/x_1.png'),
      f('x_1.png', 'take/two/x_1.png'),
      f('x_2.png', 'take/two/x_2.png'),
    ]);
    expect(sequences.map((s) => s.folder)).toEqual(['take/two', 'take/one']);
  });

  it('a TGA sequence is found; another extension, or a name with no number, is ignored', () => {
    const { sequences, ignored } = findImageSequences([
      f('t_1.tga'),
      f('t_2.TGA'),
      f('notes.txt'),
      f('cover.png'),
      f('clip_1.jpg'),
    ]);
    expect(sequences.map((s) => [s.ext, s.frames.length])).toEqual([['tga', 2]]);
    expect(ignored.map((x) => x.name)).toEqual(['notes.txt', 'cover.png', 'clip_1.jpg']);
  });

  it('a second file with a number already taken is a DUPLICATE, not a second frame', () => {
    const { sequences } = findImageSequences([f('f1.png'), f('f01.png'), f('f2.png')]);
    expect(sequences[0]?.frames).toHaveLength(2);
    expect(sequences[0]?.duplicates.map((x) => x.name)).toEqual(['f01.png']);
  });

  it('labels and the asset name', () => {
    const { sequences } = findImageSequences([f('lower_third_001.png'), f('lower_third_002.png')]);
    const seq = sequences[0];
    if (seq === undefined) throw new Error('no sequence');
    expect(sequenceLabel(seq)).toBe('lower_third_001.png … lower_third_002.png (2 frames)');
    expect(sequenceAssetName(seq)).toBe('lower_third.webm');
  });
});

describe('D-164 — the frame size, from the header', () => {
  it('reads a PNG IHDR', () => {
    const png = new Uint8Array(24);
    png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const view = new DataView(png.buffer);
    view.setUint32(16, 1920);
    view.setUint32(20, 1080);
    expect(frameSizeFromHeader(png, 'png')).toEqual({ width: 1920, height: 1080 });
  });

  it('reads a TGA header', () => {
    const tga = new Uint8Array(18);
    tga[2] = 2; // uncompressed true-colour
    const view = new DataView(tga.buffer);
    view.setUint16(12, 1280, true);
    view.setUint16(14, 720, true);
    expect(frameSizeFromHeader(tga, 'tga')).toEqual({ width: 1280, height: 720 });
  });

  it('bytes that are not the format read null', () => {
    expect(frameSizeFromHeader(new Uint8Array(24), 'png')).toBeNull();
    expect(frameSizeFromHeader(new Uint8Array(18), 'tga')).toBeNull();
  });
});

describe('D-164 — sizeMismatches', () => {
  it("🔴 names the frame whose size is not the sequence's own", () => {
    const frames = [f('f1.png'), f('f2.png'), f('f3.png')];
    const full = { width: 1920, height: 1080 };
    const { size, mismatches } = sizeMismatches(frames, [full, { width: 1280, height: 720 }, full]);
    expect(size).toEqual(full);
    expect(mismatches.map((m) => [m.file.name, m.width, m.height])).toEqual([
      ['f2.png', 1280, 720],
    ]);
  });

  it('a frame whose header cannot be read is reported, not skipped', () => {
    const frames = [f('f1.png'), f('f2.png')];
    const { mismatches } = sizeMismatches(frames, [{ width: 64, height: 64 }, null]);
    expect(mismatches.map((m) => m.file.name)).toEqual(['f2.png']);
  });
});

describe('D-164 — framesToConvert: one frame per number, a hole HELD', () => {
  const names = (frames: readonly { name: string }[]): string[] => frames.map((x) => x.name);
  const only = (files: ReturnType<typeof f>[]) => {
    const seq = findImageSequences(files).sequences[0];
    if (seq === undefined) throw new Error('no sequence');
    return seq;
  };

  it('🔴 a GAP is filled with the frame before it — every later frame keeps its time', () => {
    const seq = only([f('f1.png'), f('f2.png'), f('f4.png'), f('f5.png')]);
    const { frames, held } = framesToConvert(seq);
    // Control: closing the gap up would give 4 frames and put f4 at slot 3.
    expect(names(frames)).toEqual(['f1.png', 'f2.png', 'f2.png', 'f4.png', 'f5.png']);
    expect(held).toBe(1);
  });

  it('🔴 a frame LEFT OUT (another size, unreadable) is held the same way, never scaled', () => {
    const files = [f('f1.png'), f('f2.png'), f('f3.png')];
    const seq = only(files);
    const odd = seq.frames[1]!.file;
    const { frames, held } = framesToConvert(seq, new Set([odd]));
    expect(names(frames)).toEqual(['f1.png', 'f1.png', 'f3.png']);
    expect(held).toBe(1);
  });

  it('a hole BEFORE the first usable frame holds that frame', () => {
    const seq = only([f('f1.png'), f('f2.png'), f('f3.png')]);
    const { frames } = framesToConvert(seq, new Set([seq.frames[0]!.file]));
    expect(names(frames)).toEqual(['f2.png', 'f2.png', 'f3.png']);
  });

  it('no usable frame gives nothing to convert', () => {
    const seq = only([f('f1.png'), f('f2.png')]);
    expect(framesToConvert(seq, new Set(seq.frames.map((x) => x.file)))).toEqual({
      frames: [],
      held: 0,
    });
  });

  it('a whole sequence is passed through untouched', () => {
    const seq = only([f('f3.png'), f('f1.png'), f('f2.png')]);
    expect(names(framesToConvert(seq).frames)).toEqual(['f1.png', 'f2.png', 'f3.png']);
  });
});
