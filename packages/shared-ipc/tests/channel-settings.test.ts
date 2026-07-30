import { describe, expect, it } from 'vitest';
import {
  ChannelRasterSchema,
  ChannelSettingsSchema,
  ChannelSettingsSetChannel,
  ChannelSettingsStateSchema,
  MAX_RASTER_DIMENSION,
  REFERENCE_RASTER,
  mismatchedChannels,
  parseVideoModeFromInfo,
  rasterVerdict,
  videoModeRaster,
  type ChannelSettingsState,
} from '../src/channels/channelSettings.js';

/**
 * R-030 — the channel raster wire contract, the video-mode token map, and the
 * ONE canonical configured-vs-real verdict.
 *
 * These live here rather than only in the bridge's suite because the map is
 * shared by BOTH tiers: the bridge reads `INFO <channel>` off the wire, and the
 * browser's `MockRuntime` reads the same map so test mode cannot disagree with
 * the bridge about what `1080i5000` means.
 */

const state = (
  settings: ChannelSettingsState['settings'],
  observed: ChannelSettingsState['observed'],
): ChannelSettingsState => ({ settings, observed });

describe('ChannelRasterSchema', () => {
  it('accepts a real raster and refuses the shapes that would break placement', () => {
    expect(ChannelRasterSchema.safeParse({ width: 1280, height: 720 }).success).toBe(true);
    // A zero or negative axis would make the uniform scale 0 (a blank output) or
    // negative (a mirrored one). Both are refusals, not clamps.
    expect(ChannelRasterSchema.safeParse({ width: 0, height: 720 }).success).toBe(false);
    expect(ChannelRasterSchema.safeParse({ width: -1920, height: 1080 }).success).toBe(false);
    expect(ChannelRasterSchema.safeParse({ width: 1920.5, height: 1080 }).success).toBe(false);
    // A typo'd dimension is a LEGIBLE refusal, never a scale of ~0 on air.
    expect(
      ChannelRasterSchema.safeParse({ width: MAX_RASTER_DIMENSION + 1, height: 1080 }).success,
    ).toBe(false);
  });

  it('REFERENCE_RASTER is 1920×1080 — the frame scenes are authored against', () => {
    expect(REFERENCE_RASTER).toEqual({ width: 1920, height: 1080 });
  });

  it('the settings + state schemas round-trip, and the set channel names its refusals', () => {
    const settings = { channel: 1, raster: { width: 1280, height: 720 } };
    expect(ChannelSettingsSchema.parse(settings)).toEqual(settings);
    const full = state([settings], [{ channel: 1, mode: '720p5000', raster: settings.raster }]);
    expect(ChannelSettingsStateSchema.parse(full)).toEqual(full);
    // `raster: null` is a REPRESENTABLE observation — "the mode was read but this
    // build cannot map it" is a different fact from "not read", and the wire has
    // to be able to carry it.
    expect(
      ChannelSettingsStateSchema.safeParse(
        state([settings], [{ channel: 1, mode: 'holographic', raster: null }]),
      ).success,
    ).toBe(true);
    expect(
      ChannelSettingsSetChannel.response.parse({ ok: false, reason: 'on-air-block' }),
    ).toMatchObject({ ok: false, reason: 'on-air-block' });
    expect(
      ChannelSettingsSetChannel.response.safeParse({ ok: false, reason: 'nope' }).success,
    ).toBe(false);
  });
});

describe('videoModeRaster — the token → raster map', () => {
  it('maps the broadcast modes, ignoring scan type and frame rate', () => {
    // Scan type does not change the PIXEL raster, which is why it is matched and
    // discarded rather than folded into the answer.
    expect(videoModeRaster('1080i5000')).toEqual({ width: 1920, height: 1080 });
    expect(videoModeRaster('1080p2500')).toEqual({ width: 1920, height: 1080 });
    expect(videoModeRaster('720p5000')).toEqual({ width: 1280, height: 720 });
    expect(videoModeRaster('2160p2500')).toEqual({ width: 3840, height: 2160 });
    expect(videoModeRaster('576p2500')).toEqual({ width: 720, height: 576 });
    expect(videoModeRaster('1556p2398')).toEqual({ width: 2048, height: 1556 });
  });

  it('maps the SD names and the dci family, which digits alone would get wrong', () => {
    expect(videoModeRaster('PAL')).toEqual({ width: 720, height: 576 });
    expect(videoModeRaster('ntsc')).toEqual({ width: 720, height: 486 });
    // dci1080 is 2048 wide, NOT the 1920 a height-only rule would give.
    expect(videoModeRaster('dci1080p2400')).toEqual({ width: 2048, height: 1080 });
    expect(videoModeRaster('dci2160p2400')).toEqual({ width: 4096, height: 2160 });
  });

  it('answers null for a token this build does not recognise — never a guess', () => {
    // The honest answer. A guessed raster would then be compared against config
    // and reported as agreement or disagreement on no evidence at all.
    expect(videoModeRaster('8640p12000')).toBeNull();
    expect(videoModeRaster('holographic')).toBeNull();
    expect(videoModeRaster('1080')).toBeNull();
    expect(videoModeRaster('')).toBeNull();
    expect(videoModeRaster('   ')).toBeNull();
  });

  it('parses the video-mode leaf out of an INFO body, and only that leaf', () => {
    const xml = [
      '<channel>',
      '  <index>1</index>',
      '  <video-mode>1080i5000</video-mode>',
      '  <stage><layers/></stage>',
      '</channel>',
    ].join('\n');
    expect(parseVideoModeFromInfo(xml)).toBe('1080i5000');
    expect(parseVideoModeFromInfo('<channel><index>1</index></channel>')).toBeNull();
    expect(parseVideoModeFromInfo('<video-mode></video-mode>')).toBeNull();
    // Tolerates a shape it did not expect rather than throwing — the bridge needs
    // one leaf out of a document that differs across CasparCG versions.
    expect(parseVideoModeFromInfo('<VIDEO-MODE> 720p5000 </VIDEO-MODE>')).toBe('720p5000');
  });
});

describe('rasterVerdict — the ONE canonical comparison', () => {
  const configured1080 = [{ channel: 1, raster: { width: 1920, height: 1080 } }];

  it('reports match, mismatch, unreadable and unconfigured as four DIFFERENT facts', () => {
    expect(
      rasterVerdict(
        state(configured1080, [
          { channel: 1, mode: '1080i5000', raster: { width: 1920, height: 1080 } },
        ]),
        1,
      ),
    ).toBe('match');

    // The C-018 shape: the plant runs 1080i5000, the rebuilt 2.5.0 box is stock
    // 720p, and a 1920×1080 scene overflowed it.
    expect(
      rasterVerdict(
        state(configured1080, [
          { channel: 1, mode: '720p5000', raster: { width: 1280, height: 720 } },
        ]),
        1,
      ),
    ).toBe('mismatch');

    // A mode that was READ but is not mappable is `unreadable`, NOT a mismatch:
    // the check is unavailable, which is a gap, not evidence of a fault. Reading
    // it as a fault would train the operator to dismiss the alarm.
    expect(
      rasterVerdict(state(configured1080, [{ channel: 1, mode: 'holographic', raster: null }]), 1),
    ).toBe('unreadable');

    // Never read at all — also unreadable, and NEVER a match. Silence is not
    // agreement (the B-094 honesty class, applied to geometry).
    expect(rasterVerdict(state(configured1080, []), 1)).toBe('unreadable');

    // No claim to check.
    expect(rasterVerdict(state([], []), 1)).toBe('unconfigured');
    expect(rasterVerdict(state(configured1080, []), 2)).toBe('unconfigured');
  });

  it('mismatchedChannels surfaces only genuine contradictions', () => {
    const s = state(
      [
        { channel: 1, raster: { width: 1920, height: 1080 } },
        { channel: 2, raster: { width: 1920, height: 1080 } },
        { channel: 3, raster: { width: 1920, height: 1080 } },
        { channel: 4, raster: { width: 1280, height: 720 } },
      ],
      [
        { channel: 1, mode: '1080i5000', raster: { width: 1920, height: 1080 } },
        { channel: 2, mode: '720p5000', raster: { width: 1280, height: 720 } },
        { channel: 3, mode: 'holographic', raster: null },
        // Channel 4 has no reading at all.
      ],
    );
    expect(mismatchedChannels(s).map((c) => c.channel)).toEqual([2]);
  });
});
