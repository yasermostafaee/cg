import { describe, expect, it } from 'vitest';
import type { AssetMeta } from '@cg/shared-ipc';
import {
  buildConvertArgs,
  buildPosterArgs,
  buildProvenance,
  clampCrop,
  CONVERTER_REVISION,
  cropsEqual,
  findDuplicateVideoAsset,
  fpsConformNotice,
  parseProbeLog,
  posterTimeMs,
} from '../src/renderer/features/assets/video-convert-args.js';

describe('D-128 — buildConvertArgs (the DECIDED VP8+alpha recipe)', () => {
  it('always strips audio, encodes VP8+alpha, and conforms to the target fps', () => {
    const args = buildConvertArgs({
      inputPath: '/mnt/clip.avi',
      outputPath: '/out.webm',
      targetFps: 50,
    });
    expect(args).toContain('-an');
    expect(args).toContain('libvpx');
    expect(args).not.toContain('libvpx-vp9'); // VP9 is OUT (unproducible in-app — design.md)
    expect(args).toContain('yuva420p');
    const altRef = args.indexOf('-auto-alt-ref');
    expect(args[altRef + 1]).toBe('0');
    const r = args.indexOf('-r');
    expect(args[r + 1]).toBe('50');
    // `-r` is an OUTPUT option — it must come after `-i <input>`
    expect(r).toBeGreaterThan(args.indexOf('/mnt/clip.avi'));
    expect(args.at(-1)).toBe('/out.webm');
  });

  it('BROADCAST QUALITY (lossy-alpha-leak fix): bounded quantiser + 1s GOP', () => {
    // The alpha plane is a second VP8 stream sharing the SAME quantiser as colour; the
    // old crf 12 / b:v 2M let motion crumble alpha (source-α=0 pixels decoded at α≤30
    // over black — the on-air smudges). crf 4 + qmax 16 BOUND the quantiser; b:v 20M is
    // a never-binding ceiling. -g 25 = 1s keyframes (cheap seeks, the resume finding).
    const args = buildConvertArgs({
      inputPath: '/mnt/clip.avi',
      outputPath: '/out.webm',
      targetFps: 50,
    });
    expect(args[args.indexOf('-crf') + 1]).toBe('4');
    expect(args[args.indexOf('-qmax') + 1]).toBe('16');
    expect(args[args.indexOf('-b:v') + 1]).toBe('20M');
    expect(args[args.indexOf('-g') + 1]).toBe('25');
  });

  it('FAST PATH: a default import (no corrections) runs NO filter at all — the spike shape', () => {
    // The owner's "minutes vs the spike's 13 seconds": the pixel-math stages
    // were unconditionally on the hot path. A default import must be filterless.
    const args = buildConvertArgs({
      inputPath: '/mnt/clip.avi',
      outputPath: '/out.webm',
      targetFps: 25,
    });
    expect(args).not.toContain('-filter_complex');
    expect(args).not.toContain('-vf');
    expect(args.join(' ')).not.toMatch(/geq=|boxblur|overlay|alphamerge|alphaextract/);
  });

  it('FAST PATH: a default import with a crop rides a plain -vf crop (no format round-trip)', () => {
    const args = buildConvertArgs({
      inputPath: '/mnt/clip.avi',
      outputPath: '/out.webm',
      targetFps: 25,
      crop: { x: 10, y: 20, width: 640, height: 360 },
    });
    expect(args).not.toContain('-filter_complex');
    const vf = args.indexOf('-vf');
    expect(vf).toBeGreaterThan(args.indexOf('/mnt/clip.avi'));
    expect(args[vf + 1]).toBe('crop=640:360:10:20');
    expect(args.join(' ')).not.toMatch(/geq=|boxblur|overlay|alphamerge|format=rgba/);
  });

  it('the QUALITY settings are present in every graph shape (they stay on the default path)', () => {
    // crf 4 / qmax 16 / -g 25 cost under a second and are what fixed the alpha
    // leak (56.7% → ~0%) — they are NOT corrections and never turn off.
    for (const corr of [
      {},
      { premultipliedAlpha: true },
      { alphaBleed: true },
      { premultipliedAlpha: true, alphaBleed: true },
    ]) {
      const args = buildConvertArgs({
        inputPath: '/mnt/clip.avi',
        outputPath: '/out.webm',
        targetFps: 50,
        ...corr,
      });
      expect(args[args.indexOf('-crf') + 1]).toBe('4');
      expect(args[args.indexOf('-qmax') + 1]).toBe('16');
      expect(args[args.indexOf('-b:v') + 1]).toBe('20M');
      expect(args[args.indexOf('-g') + 1]).toBe('25');
      expect(args).toContain('yuva420p');
      expect(args).toContain('-an');
    }
  });
});

describe('D-128 — the OPT-IN corrections: un-premultiply (fringe fix) + ALPHA BLEED (leak fix)', () => {
  const graphOf = (args: string[]): string => args[args.indexOf('-filter_complex') + 1] ?? '';
  const vfOf = (args: string[]): string => args[args.indexOf('-vf') + 1] ?? '';

  it('premultipliedAlpha ALONE ⇒ a single linear -vf chain: format=rgba + the unpremult geq, NO bleed', () => {
    const args = buildConvertArgs({
      inputPath: '/mnt/clip.avi',
      outputPath: '/out.webm',
      targetFps: 50,
      premultipliedAlpha: true,
    });
    expect(args).not.toContain('-filter_complex'); // no split/overlay graph for one linear stage
    const chain = vfOf(args);
    expect(chain).toContain('format=rgba');
    expect(chain).toContain('255*r(X,Y)/alpha(X,Y)'); // straight = premult · 255/α …
    expect(chain).toContain('gt(alpha(X,Y),0)'); // … α-guarded
    expect(chain).not.toMatch(/boxblur|overlay|alphamerge/); // the bleed is NOT silently attached
    // never ffmpeg's plane-0-dividing unpremultiply/premultiply filters (proven broken)
    expect(chain).not.toMatch(/[^n]unpremultiply|,premultiply/);
  });

  it('alphaBleed ALONE ⇒ the full bleed graph with the straight branch untouched (null)', () => {
    const args = buildConvertArgs({
      inputPath: '/mnt/clip.avi',
      outputPath: '/out.webm',
      targetFps: 50,
      alphaBleed: true,
    });
    const graph = graphOf(args);
    // the bleed: blur the premult image, divide by blurred alpha (opaque bled backdrop)
    expect(graph).toContain('boxblur=12:2');
    expect(graph).toContain('a=255'); // the bled backdrop is opaque
    expect(graph).toContain('[bled][straight]overlay');
    // the ORIGINAL alpha is re-attached bit-exact — the bleed never alters alpha
    expect(graph).toContain('alphaextract[am]');
    expect(graph).toContain('[comp][am]alphamerge[out]');
    expect(args[args.indexOf('-map') + 1]).toBe('[out]');
    // source colours NEVER brightened without the premultiplied opt-in…
    expect(graph).toContain('[fs]null[straight]');
    // …and the bleed branch premultiplies its own copy (straight source input)
    expect(graph).toContain('r(X,Y)*alpha(X,Y)/255');
  });

  it('BOTH corrections ⇒ the full graph with the unpremult straight branch', () => {
    const graph = graphOf(
      buildConvertArgs({
        inputPath: '/mnt/clip.avi',
        outputPath: '/out.webm',
        targetFps: 50,
        premultipliedAlpha: true,
        alphaBleed: true,
      }),
    );
    expect(graph).toContain('[fs]geq='); // the main branch is corrected…
    expect(graph).toContain('255*r(X,Y)/alpha(X,Y)');
    // …and the bleed branch divides the ALREADY-premultiplied input (truecolour·α)
    expect(graph).toContain('[fb]boxblur');
    expect(graph).toContain('[comp][am]alphamerge[out]');
  });

  it('each correction adds EXACTLY its own stage — never the other one', () => {
    const premultOnly = buildConvertArgs({
      inputPath: '/i',
      outputPath: '/o',
      targetFps: 50,
      premultipliedAlpha: true,
    }).join(' ');
    const bleedOnly = buildConvertArgs({
      inputPath: '/i',
      outputPath: '/o',
      targetFps: 50,
      alphaBleed: true,
    }).join(' ');
    expect(premultOnly).not.toMatch(/boxblur|overlay|alphamerge/);
    expect(bleedOnly).toContain('[fs]null[straight]'); // no unpremult smuggled in
  });

  it('crop + premultipliedAlpha ⇒ crop FIRST in the -vf chain', () => {
    const chain = vfOf(
      buildConvertArgs({
        inputPath: '/mnt/clip.avi',
        outputPath: '/out.webm',
        targetFps: 25,
        crop: { x: 10, y: 20, width: 640, height: 360 },
        premultipliedAlpha: true,
      }),
    );
    expect(chain.startsWith('crop=640:360:10:20,')).toBe(true);
    expect(chain.indexOf('crop=')).toBeLessThan(chain.indexOf('format=rgba'));
  });

  it('crop + alphaBleed ⇒ crop FIRST, then the split into the three branches', () => {
    const graph = graphOf(
      buildConvertArgs({
        inputPath: '/mnt/clip.avi',
        outputPath: '/out.webm',
        targetFps: 25,
        crop: { x: 10, y: 20, width: 640, height: 360 },
        alphaBleed: true,
      }),
    );
    expect(graph.indexOf('crop=640:360:10:20')).toBeLessThan(graph.indexOf('split=3'));
    expect(graph.indexOf('split=3')).toBeLessThan(graph.indexOf('boxblur'));
  });

  it('poster extraction pulls exactly one frame as image2 (frame 0 when no seek)', () => {
    expect(buildPosterArgs('/mnt/a.avi', '/poster.png')).toEqual([
      '-y',
      '-i',
      '/mnt/a.avi',
      '-frames:v',
      '1',
      '-f',
      'image2',
      '/poster.png',
    ]);
  });

  it('poster seeks MID-CLIP with a fast keyframe seek (-ss BEFORE -i) when a time is given', () => {
    expect(buildPosterArgs('/mnt/a.avi', '/poster.png', 20)).toEqual([
      '-y',
      '-ss',
      '20.000',
      '-i',
      '/mnt/a.avi',
      '-frames:v',
      '1',
      '-f',
      'image2',
      '/poster.png',
    ]);
    // a zero / negative time keeps the frame-0 form (no -ss)
    expect(buildPosterArgs('/mnt/a.avi', '/poster.png', 0)).not.toContain('-ss');
  });
});

describe('D-128 (a) — posterTimeMs (mid-clip poster rule)', () => {
  it('uses the clip midpoint when no In-point is marked', () => {
    expect(posterTimeMs(40_000)).toBe(20_000);
    expect(posterTimeMs(0)).toBe(0); // unknown duration → frame 0
  });

  it('uses the In-point (introEnd) when it is a valid mark inside the clip', () => {
    expect(posterTimeMs(40_000, 12_000)).toBe(12_000);
  });

  it('falls back to the midpoint when the In-point is 0, negative, or past the clip end', () => {
    expect(posterTimeMs(40_000, 0)).toBe(20_000);
    expect(posterTimeMs(40_000, 40_000)).toBe(20_000); // not strictly inside
    expect(posterTimeMs(40_000, 99_000)).toBe(20_000);
  });
});

describe('D-128 — parseProbeLog', () => {
  // Real lines from the Phase-1 spike's ffmpeg 5.1.4 banner for the BGRA fixture.
  const SPIKE_LOG = [
    "Input #0, avi, from '/mnt/box-64x64-bgra.avi':",
    '  Duration: 00:00:01.60, start: 0.000000, bitrate: 3310 kb/s',
    '  Stream #0:0: Video: rawvideo, bgra, 64x64, 3360 kb/s, SAR 1:1 DAR 1:1, 25 fps, 25 tbr, 25 tbn',
  ];

  it('extracts fps / dimensions / duration from the banner', () => {
    expect(parseProbeLog(SPIKE_LOG)).toEqual({
      fps: 25,
      width: 64,
      height: 64,
      durationMs: 1600,
    });
  });

  it('parses an NTSC fractional rate', () => {
    const probe = parseProbeLog([
      '  Duration: 00:01:30.50, start: 0.000000, bitrate: 1658984 kb/s',
      '  Stream #0:0: Video: rawvideo, bgra, 1920x1080, 1658984 kb/s, 29.97 fps, 29.97 tbr',
    ]);
    expect(probe?.fps).toBeCloseTo(29.97);
    expect(probe?.width).toBe(1920);
    expect(probe?.durationMs).toBe(90_500);
  });

  it('returns null when no video stream is present', () => {
    expect(parseProbeLog(['  Duration: 00:00:05.00', '  Stream #0:0: Audio: mp3'])).toBeNull();
  });

  it('an fps-less video line still probes (fps 0 = unknown ⇒ conform silently)', () => {
    const probe = parseProbeLog([
      '  Duration: 00:00:02.00, start: 0.000000',
      '  Stream #0:0: Video: vp8, yuv420p, 320x240, SAR 1:1 DAR 4:3',
    ]);
    expect(probe).not.toBeNull();
    expect(probe?.fps).toBe(0);
  });

  it('Duration: N/A still probes (durationMs 0 — the modal measures the OUTPUT instead)', () => {
    const probe = parseProbeLog([
      '  Duration: N/A, start: 0.000000, bitrate: N/A',
      '  Stream #0:0: Video: rawvideo (BGRA / 0x41524742), bgra, 720x576, 25 fps, 25 tbr, 25 tbn',
    ]);
    expect(probe).toEqual({ fps: 25, width: 720, height: 576, durationMs: 0 });
  });
});

describe('D-128 decision (d) — fps conform + warn (never block, never silently keep)', () => {
  it('warns with the consequence text when source ≠ channel rate', () => {
    const notice = fpsConformNotice(29.97, 50);
    expect(notice).toMatch(/29\.97 fps/);
    expect(notice).toMatch(/conforming to the project channel's 50 fps/);
    expect(notice).toMatch(/judder/);
  });

  it('no warning when the rates match', () => {
    expect(fpsConformNotice(50, 50)).toBeNull();
    expect(fpsConformNotice(29.970001, 29.97)).toBeNull();
  });

  it('no warning when the source rate is unknown (still conforms)', () => {
    expect(fpsConformNotice(0, 50)).toBeNull();
  });
});

describe('D-128 — provenance assembly + crop clamping', () => {
  const probe = { fps: 29.97, width: 1920, height: 1080, durationMs: 10_000 };

  it('captures source lineage incl. the baked crop + converter revision + BOTH correction flags', () => {
    expect(
      buildProvenance({
        sourceFilename: 'archive.avi',
        probe,
        targetFps: 50,
        crop: { x: 0, y: 0, width: 640, height: 480 },
        premultipliedAlpha: true,
        alphaBleed: false,
      }),
    ).toEqual({
      sourceFilename: 'archive.avi',
      sourceFps: 29.97,
      targetFps: 50,
      sourceWidth: 1920,
      sourceHeight: 1080,
      converterRevision: CONVERTER_REVISION,
      crop: { x: 0, y: 0, width: 640, height: 480 },
      premultipliedAlpha: true,
      alphaBleed: false, // recorded even when false — the lineage names what ran
    });
  });

  it('always records the converter revision (so a future item can flag stale assets)', () => {
    const p = buildProvenance({ sourceFilename: 'a.avi', probe, targetFps: 50 });
    expect(p.converterRevision).toBe(CONVERTER_REVISION);
    expect(CONVERTER_REVISION).toMatch(/^\d{4}-\d{2}-\d{2}\.\d+$/); // dated, monotonic counter
  });

  it('omits crop and the correction flags when not provided (full frame, unspecified)', () => {
    const p = buildProvenance({ sourceFilename: 'a.avi', probe, targetFps: 50 });
    expect('crop' in p).toBe(false);
    expect('premultipliedAlpha' in p).toBe(false);
    expect('alphaBleed' in p).toBe(false);
  });

  it('clampCrop keeps the rect inside the source bounds and integral', () => {
    expect(clampCrop({ x: -5, y: 2000, width: 99999, height: 10.6 }, 1920, 1080)).toEqual({
      x: 0,
      y: 1069,
      width: 1920,
      height: 11,
    });
    expect(clampCrop({ x: 1900, y: 0, width: 100, height: 100 }, 1920, 1080)).toEqual({
      x: 1820,
      y: 0,
      width: 100,
      height: 100,
    });
  });
});

describe('D-128 — pre-convert dedupe matching', () => {
  const crop = { x: 1, y: 2, width: 3, height: 4 };

  it('cropsEqual: both absent equal; one absent differs; exact match required', () => {
    expect(cropsEqual(undefined, undefined)).toBe(true);
    expect(cropsEqual(crop, undefined)).toBe(false);
    expect(cropsEqual(undefined, crop)).toBe(false);
    expect(cropsEqual(crop, { ...crop })).toBe(true);
    expect(cropsEqual(crop, { ...crop, x: 9 })).toBe(false);
  });

  const asset = (p: Partial<NonNullable<AssetMeta['provenance']>>): AssetMeta => ({
    assetId: 'a',
    kind: 'video',
    filename: 'a.webm',
    sha256: 'f'.repeat(64),
    byteSize: 1,
    workingPath: 'p',
    provenance: {
      sourceFilename: 's.avi',
      sourceFps: 25,
      targetFps: 50,
      sourceWidth: 640,
      sourceHeight: 360,
      sourceSha256: 'a'.repeat(64),
      converterRevision: CONVERTER_REVISION,
      ...p,
    },
  });
  const key = { sourceSha256: 'a'.repeat(64), targetFps: 50, crop: undefined };

  it('matches on source hash + target fps + crop (current revision, default corrections)', () => {
    expect(findDuplicateVideoAsset([asset({})], key)?.assetId).toBe('a');
  });

  it('does NOT match a different source hash', () => {
    expect(findDuplicateVideoAsset([asset({ sourceSha256: 'b'.repeat(64) })], key)).toBeNull();
  });

  it('does NOT match a different target fps (a re-conform genuinely differs)', () => {
    expect(findDuplicateVideoAsset([asset({ targetFps: 25 })], key)).toBeNull();
  });

  it('does NOT match a different crop (different output)', () => {
    expect(findDuplicateVideoAsset([asset({ crop })], key)).toBeNull();
    expect(findDuplicateVideoAsset([asset({})], { ...key, crop })).toBeNull();
  });

  it('does NOT match across converter revisions (older bytes are a different output; pre-.4 assets ran the bleed implicitly)', () => {
    expect(findDuplicateVideoAsset([asset({ converterRevision: '2026-07-24.3' })], key)).toBeNull();
    expect(findDuplicateVideoAsset([asset({ converterRevision: undefined })], key)).toBeNull();
  });

  it('does NOT match a different correction set — each correction genuinely changes the output', () => {
    expect(findDuplicateVideoAsset([asset({ premultipliedAlpha: true })], key)).toBeNull();
    expect(findDuplicateVideoAsset([asset({ alphaBleed: true })], key)).toBeNull();
    expect(findDuplicateVideoAsset([asset({})], { ...key, premultipliedAlpha: true })).toBeNull();
    expect(findDuplicateVideoAsset([asset({})], { ...key, alphaBleed: true })).toBeNull();
  });

  it('matches when the correction set agrees (explicit false ≡ absent)', () => {
    expect(
      findDuplicateVideoAsset([asset({ premultipliedAlpha: false, alphaBleed: false })], {
        ...key,
        premultipliedAlpha: false,
        alphaBleed: false,
      })?.assetId,
    ).toBe('a');
    expect(
      findDuplicateVideoAsset([asset({ premultipliedAlpha: true, alphaBleed: true })], {
        ...key,
        premultipliedAlpha: true,
        alphaBleed: true,
      })?.assetId,
    ).toBe('a');
  });

  it('ignores non-video assets and assets without provenance / source hash', () => {
    const img = { ...asset({}), kind: 'image' as const };
    const noProv = { ...asset({}), provenance: undefined };
    const noHash = asset({ sourceSha256: undefined });
    expect(findDuplicateVideoAsset([img, noProv, noHash], key)).toBeNull();
  });
});
