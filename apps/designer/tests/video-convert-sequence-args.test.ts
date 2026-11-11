import { describe, expect, it } from 'vitest';
import { VideoProvenanceSchema } from '@cg/shared-schema';
import {
  CONVERTER_REVISION,
  buildConvertArgs,
  buildPosterArgs,
  buildProvenance,
  encodedFrameOf,
  findDuplicateVideoAsset,
  isImageSequence,
  matchesConversionParams,
  parseProbeLog,
  sequenceFrameName,
  sequenceInput,
  sourceByteSize,
  sourceDisplayName,
  sourceHashInput,
  sourceSequenceFps,
  sourceSequenceProvenance,
  sourceWebmName,
  type ImageSequenceSource,
} from '../src/renderer/features/assets/video-convert-args.js';

/**
 * `D-164` — an image sequence through the SAME converter as a clip: the `image2` input (its rate
 * BEFORE `-i`), the renamed contiguous frames, the dedupe key that knows the rate, and the
 * provenance that says it was a sequence. A clip's args are byte-for-byte as before.
 */

const frame = (name: string, size: number) => ({ name, size }) as unknown as File;
const seq = (fps = 25): ImageSequenceSource => ({
  kind: 'image-sequence',
  frames: [frame('f_1.png', 100), frame('f_2.png', 120), frame('f_10.png', 130)],
  ext: 'png',
  fps,
  label: 'f_1.png … f_10.png (3 frames)',
  assetName: 'f.webm',
  firstFile: 'f_1.png',
  lastFile: 'f_10.png',
});
const normalization = { width: 320, height: 180, fit: 'contain' } as const;

describe('D-164 — the image2 input', () => {
  it('frames are mounted 000001.png … in the order they arrive', () => {
    expect([0, 1, 9].map((i) => sequenceFrameName(i, 'png'))).toEqual([
      '000001.png',
      '000002.png',
      '000010.png',
    ]);
    expect(sequenceFrameName(0, 'tga')).toBe('000001.tga');
  });

  it('🔴 the rate is -framerate BEFORE -i (not -r, which would re-time the input)', () => {
    expect(sequenceInput(seq(25), '/mnt')).toEqual({
      inputPath: '/mnt/%06d.png',
      inputOptions: ['-framerate', '25', '-start_number', '1'],
    });
  });

  it("🔴 the convert args carry the input options before -i, and are otherwise a clip's", () => {
    // The clip's args are pinned byte for byte by `video-convert-args.test.ts`; a sequence's are
    // exactly those with its input options inserted after `-y`.
    const { inputPath, inputOptions } = sequenceInput(seq(25), '/mnt');
    const clipShaped = buildConvertArgs({ inputPath, outputPath: '/out.webm', targetFps: 50 });
    expect(
      buildConvertArgs({ inputPath, inputOptions, outputPath: '/out.webm', targetFps: 50 }),
    ).toEqual(['-y', '-framerate', '25', '-start_number', '1', ...clipShaped.slice(1)]);
    expect(clipShaped.slice(0, 3)).toEqual(['-y', '-i', '/mnt/%06d.png']);
    expect(clipShaped.slice(-3)).toEqual(['-r', '50', '/out.webm']);
  });

  it('the poster seeks inside the sequence with the same input options', () => {
    expect(
      buildPosterArgs('/mnt/%06d.png', '/poster.png', 1.5, [
        '-framerate',
        '25',
        '-start_number',
        '1',
      ]),
    ).toEqual([
      '-y',
      '-framerate',
      '25',
      '-start_number',
      '1',
      '-ss',
      '1.500',
      '-i',
      '/mnt/%06d.png',
      '-map',
      '0:v:0',
      '-frames:v',
      '1',
      '-f',
      'image2',
      '/poster.png',
    ]);
  });

  it('normalizes frames before any crop or alpha correction and uses the same canvas for the poster', () => {
    const { inputPath, inputOptions } = sequenceInput({ ...seq(), normalization }, '/mnt');
    expect(inputOptions).toContain('-reinit_filter');
    expect(inputOptions[inputOptions.indexOf('-reinit_filter') + 1]).toBe('0');
    expect(inputOptions).toContain('-max_pixels');
    const args = buildConvertArgs({
      inputPath,
      inputOptions,
      outputPath: '/out.webm',
      targetFps: 25,
      sequenceNormalization: normalization,
      crop: { x: 4, y: 6, width: 120, height: 80 },
      alphaBleed: true,
    });
    const posterArgs = buildPosterArgs(
      inputPath,
      '/poster.png',
      0.04,
      inputOptions,
      undefined,
      'standard',
      normalization,
    );
    const posterFilter = posterArgs[posterArgs.indexOf('-vf') + 1];
    expect(posterFilter).toContain(
      'format=rgba,pad=320:180:(ow-iw)/2:(oh-ih)/2:color=black@0:eval=frame',
    );
    expect(args[args.indexOf('-filter_complex') + 1]).toContain(
      `${posterFilter},crop=120:80:4:6,format=rgba,split=3`,
    );
    expect(args).toContain('-xerror');
    expect(args).toContain('yuva420p');
  });

  it('checks the target raster and the full normalized pixel budget', () => {
    expect(() =>
      sequenceInput(
        {
          ...seq(),
          normalization: { ...normalization, width: 16384, height: 1 },
        },
        '/mnt',
      ),
    ).toThrow('resize limits');
    expect(() =>
      sequenceInput(
        {
          ...seq(),
          frames: Array<File>(200).fill(frame('f_1.png', 100)),
          normalization: { ...normalization, width: 7680, height: 4320 },
        },
        '/mnt',
      ),
    ).toThrow('resize limits');
  });

  it('probes source sizes with a single-digit axis', () => {
    expect(parseProbeLog(['Stream #0:0: Video: png, rgba(pc), 5x64, 25 fps'])).toMatchObject({
      width: 5,
      height: 64,
      fps: 25,
    });
  });

  it("progress in FRAMES is read from ffmpeg's own line", () => {
    expect(encodedFrameOf('frame=  123 fps=4.1 q=0.0 size=  1024kB time=00:00:04.92')).toBe(123);
    expect(encodedFrameOf('Stream #0:0: Video: png')).toBeNull();
  });
});

describe('D-164 — a sequence as a source, beside a clip', () => {
  it('tells the two apart, names and sizes each', () => {
    const clip = frame('intro.avi', 4096);
    expect(isImageSequence(clip)).toBe(false);
    expect(isImageSequence(seq())).toBe(true);
    expect(sourceDisplayName(seq())).toBe('f_1.png … f_10.png (3 frames)');
    expect(sourceByteSize(seq())).toBe(350);
    expect(sourceWebmName(seq())).toBe('f.webm');
    expect(sourceWebmName(clip)).toBe('intro.webm');
  });

  it('hashes the frames in order, keys on its rate, and records first / last / count / rate', () => {
    const clip = frame('intro.avi', 4096);
    const s = seq(25);
    expect(sourceHashInput(clip)).toBe(clip);
    expect(sourceHashInput(s)).toBe(s.frames);
    expect(sourceSequenceFps(clip)).toBeUndefined();
    expect(sourceSequenceFps(s)).toBe(25);
    expect(sourceSequenceProvenance(clip)).toBeUndefined();
    expect(sourceSequenceProvenance(s)).toEqual({
      firstFile: 'f_1.png',
      lastFile: 'f_10.png',
      frameCount: 3,
      fps: 25,
    });
  });
});

describe('D-164 — dedupe and provenance', () => {
  const probe = { fps: 25, width: 1920, height: 1080, durationMs: 120 };
  const sequence = { firstFile: 'f_1.png', lastFile: 'f_10.png', frameCount: 3, fps: 25 };
  const p = buildProvenance({
    sourceFilename: 'f_1.png',
    probe,
    targetFps: 50,
    sourceSha256: 'a'.repeat(64),
    sourceBytes: 350,
    sequence,
  });

  it('🔴 provenance records the sequence, and parses', () => {
    expect(p.sequence).toEqual(sequence);
    expect(p.converterRevision).toBe(CONVERTER_REVISION);
    expect(VideoProvenanceSchema.safeParse(p).success).toBe(true);
  });

  it('🔴 the same frames at the same rate match; another rate, or a clip, does not', () => {
    const base = { targetFps: 50, crop: undefined };
    expect(matchesConversionParams(p, { ...base, sequenceFps: 25 })).toBe(true);
    expect(matchesConversionParams(p, { ...base, sequenceFps: 50 })).toBe(false);
    expect(matchesConversionParams(p, base)).toBe(false); // a clip never matches a sequence
    const clip = buildProvenance({ sourceFilename: 'intro.avi', probe, targetFps: 50 });
    expect(matchesConversionParams(clip, base)).toBe(true);
    expect(matchesConversionParams(clip, { ...base, sequenceFps: 25 })).toBe(false);
  });

  it('findDuplicateVideoAsset finds the sequence asset by hash and rate', () => {
    const assets = [{ kind: 'video', provenance: p }];
    expect(
      findDuplicateVideoAsset(assets, {
        sourceSha256: 'a'.repeat(64),
        targetFps: 50,
        crop: undefined,
        sequenceFps: 25,
      }),
    ).toBe(assets[0]);
    expect(
      findDuplicateVideoAsset(assets, {
        sourceSha256: 'a'.repeat(64),
        targetFps: 50,
        crop: undefined,
        sequenceFps: 30,
      }),
    ).toBeNull();
  });

  it('an asset stored before the field parses unchanged', () => {
    const old = buildProvenance({ sourceFilename: 'intro.avi', probe, targetFps: 50 });
    expect('sequence' in old).toBe(false);
    expect(VideoProvenanceSchema.safeParse(old).success).toBe(true);
  });

  it('matches the exact normalized target and keeps legacy sequence dedupe distinct', () => {
    const storedSequence = sourceSequenceProvenance({ ...seq(), normalization });
    expect(storedSequence?.normalization).toEqual(normalization);
    const normalized = { ...p, sequence: storedSequence };
    expect(VideoProvenanceSchema.parse(normalized).sequence?.normalization).toEqual(normalization);
    const match = { targetFps: 50, crop: undefined, sequenceFps: 25 };
    expect(
      matchesConversionParams(normalized, { ...match, sequenceNormalization: normalization }),
    ).toBe(true);
    expect(matchesConversionParams(normalized, match)).toBe(false);
    expect(matchesConversionParams(p, { ...match, sequenceNormalization: normalization })).toBe(
      false,
    );
    expect(
      matchesConversionParams(normalized, {
        ...match,
        sequenceNormalization: { ...normalization, height: 200 },
      }),
    ).toBe(false);
  });
});
