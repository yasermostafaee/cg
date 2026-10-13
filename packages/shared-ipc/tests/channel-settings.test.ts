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
  videoModeFramePeriodMs,
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

  it('B-174 — videoModeFramePeriodMs: an interlaced mode ticks at HALF its named rate', () => {
    // The mode token names the FIELD rate; stage.cpp pulls both fields in one tick
    // ("it lets us tick at 25hz and avoids amcp changes starting on the second field"),
    // so 1080i5000 is a 40 ms channel frame while 1080p5000 is 20 ms. The unit the
    // look-switch mixer hold is denominated in — halve it wrongly and the hold is either
    // half the measured skew or double it.
    expect(videoModeFramePeriodMs('1080i5000')).toBe(40);
    expect(videoModeFramePeriodMs('1080p5000')).toBe(20);
    expect(videoModeFramePeriodMs('1080p2500')).toBe(40);
    expect(videoModeFramePeriodMs('720p5994')).toBeCloseTo(1000 / 59.94, 6);
    expect(videoModeFramePeriodMs('1080i5994')).toBeCloseTo(2000 / 59.94, 6);
    expect(videoModeFramePeriodMs('1080p2398')).toBeCloseTo(1000 / 23.98, 6);
    expect(videoModeFramePeriodMs('dci2160p2400')).toBeCloseTo(1000 / 24, 6);
    expect(videoModeFramePeriodMs(' 1080I5000 ')).toBe(40);
  });

  it('B-174 — videoModeFramePeriodMs: null for a rate-less or unknown token, never a guess', () => {
    // PAL/NTSC carry no rate digits; a guessed period would silently misplace the hold on
    // exactly the installs whose mode string this build has not met.
    expect(videoModeFramePeriodMs('PAL')).toBeNull();
    expect(videoModeFramePeriodMs('ntsc')).toBeNull();
    expect(videoModeFramePeriodMs('1080')).toBeNull();
    expect(videoModeFramePeriodMs('')).toBeNull();
    expect(videoModeFramePeriodMs('holographic')).toBeNull();
  });

  it('B-174 — a rate suffix outside the ×100 convention is UNREAD, not a slow mode', () => {
    /*
      🔴 The width of the rate suffix IS the convention check. `casparcg.config` may define a
      CUSTOM video mode whose id is any string, `INFO`'s `<format>` echoes it verbatim, and the
      human spelling of one is `1080p50`. Divided by 100 that reads as 0.5 Hz — a 2000 ms
      "channel frame", which `#lookMixerHoldMsFor` would have slept inside the seat lock with
      the page already flipped: two seconds of holes over the previous look's fills, on air.
      A token this build cannot read must reach the 40 ms fallback, never a plausible number.
    */
    expect(videoModeFramePeriodMs('1080p50')).toBeNull();
    expect(videoModeFramePeriodMs('1080i50')).toBeNull();
    expect(videoModeFramePeriodMs('720p60')).toBeNull();
    expect(videoModeFramePeriodMs('1080p250')).toBeNull();
    // Five digits stay READ — that is the ≥100 Hz future the width deliberately keeps room
    // for, and it is the only reason the bound is not an exact four.
    expect(videoModeFramePeriodMs('1080p10000')).toBe(10);
    expect(videoModeFramePeriodMs('1080i12000')).toBeCloseTo(2000 / 120, 6);
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

  /**
   * 🔴 `B-189` — **the REAL reply, verbatim, and the reason this fixture exists at all.**
   *
   * The payload below is the exact byte sequence CasparCG 2.5.0 `69e8ad5` returned for
   * `INFO 1` on 2026-08-31 (127.0.0.1:5250, the owner's local install; captured with a raw
   * socket by `SKEW-HOLD-01`, status line `201 INFO OK\r\n` stripped, terminal `\r\n`
   * stripped — the string here is the ONE payload chunk between them, bare `\n` interior
   * included). It carries `<format>`, never `<video-mode>`: the old parser found nothing in
   * it, and no test could notice because every fixture was written from the parser's own
   * expectation. A mock that agrees with the code only proves the code agrees with itself —
   * THIS string is the one input whose provenance is the server, so a parser that drifts
   * from the real dialect reddens here first.
   */
  it('B-189 — parses the reply the REAL 2.5.0 actually sends (captured verbatim)', () => {
    const realReply =
      '<?xml version="1.0" encoding="utf-8"?>\n<channel>\n   <format>1080p5000</format>\n' +
      '   <framerate>50</framerate>\n   <framerate>1</framerate>\n   <mixer>\n      <audio>\n' +
      '         <volume>0</volume>\n         <volume>0</volume>\n         <volume>0</volume>\n' +
      '         <volume>0</volume>\n         <volume>0</volume>\n         <volume>0</volume>\n' +
      '         <volume>0</volume>\n         <volume>0</volume>\n         <volume>0</volume>\n' +
      '         <volume>0</volume>\n         <volume>0</volume>\n         <volume>0</volume>\n' +
      '         <volume>0</volume>\n         <volume>0</volume>\n         <volume>0</volume>\n' +
      '         <volume>0</volume>\n      </audio>\n   </mixer>\n   <output>\n      <port>\n' +
      '         <port_500>\n            <consumer>system-audio</consumer>\n         </port_500>\n' +
      '         <port_600>\n            <consumer>screen</consumer>\n            <screen>\n' +
      '               <always_on_top>false</always_on_top>\n               <index>0</index>\n' +
      '               <key_only>false</key_only>\n               <name>Screen consumer</name>\n' +
      '            </screen>\n         </port_600>\n      </port>\n   </output>\n</channel>\n';
    expect(parseVideoModeFromInfo(realReply)).toBe('1080p5000');
    // And the raster derivation composes on the real token, end to end.
    expect(videoModeRaster(parseVideoModeFromInfo(realReply) ?? '')).toEqual({
      width: 1920,
      height: 1080,
    });
    // `<format>` wins when both spellings appear — it is the measured dialect; the legacy
    // tag is a fallback, never an override.
    expect(
      parseVideoModeFromInfo('<format>1080i5000</format><video-mode>720p5000</video-mode>'),
    ).toBe('1080i5000');
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
