import { describe, expect, it } from 'vitest';
import {
  aspectForFormat,
  EMPTY_SOURCE_MAPPINGS,
  LIVE_SOURCE_FORMATS,
  LiveSourceLayerRangeSchema,
  mappingAspect,
  SOURCES_SET_CONFIG_REASONS,
  SourceMappingsSchema,
  SourceProducerSchema,
  SUGGESTED_LIVE_SOURCE_LAYER_RANGE,
  type LiveSourceFormat,
} from '../src/channels/sources.js';

/**
 * D-137 / C-015 phase 4 — the installation mapping's WIRE SHAPE.
 *
 * The two properties worth a test here are the two that decide what reaches
 * air: an unreachable producer form must be refused at the BOUNDARY rather than
 * become an AMCP `400` at take time, and the fit aspect must come from the
 * FORMAT rather than from a number somebody typed.
 */

describe('the producer union refuses at the boundary', () => {
  it('accepts each of the four producer forms', () => {
    expect(SourceProducerSchema.safeParse({ kind: 'route', channel: 2 }).success).toBe(true);
    expect(SourceProducerSchema.safeParse({ kind: 'route', channel: 2, layer: 10 }).success).toBe(
      true,
    );
    expect(SourceProducerSchema.safeParse({ kind: 'decklink', device: 1 }).success).toBe(true);
    expect(SourceProducerSchema.safeParse({ kind: 'ndi', source: 'STUDIO (CAM2)' }).success).toBe(
      true,
    );
    expect(SourceProducerSchema.safeParse({ kind: 'media', file: 'AMB' }).success).toBe(true);
  });

  it('refuses a producer kind nothing can play', () => {
    // The whole reason this is a discriminated union and not a free string: a
    // `kind` the bridge has no verb for is a parse error at import, not a
    // refused take with a guest already sitting in the studio.
    expect(SourceProducerSchema.safeParse({ kind: 'sdi', device: 1 }).success).toBe(false);
  });

  it('offers keyDevice on the DECKLINK arm ALONE', () => {
    // §1a — fill+key is two physical SDI inputs. A route or an NDI source
    // carries its own alpha or none, so a key device there is a pair that
    // cannot exist, and zod's strip would have accepted it silently.
    const pair = SourceProducerSchema.safeParse({ kind: 'decklink', device: 1, keyDevice: 2 });
    expect(pair.success && pair.data).toEqual({ kind: 'decklink', device: 1, keyDevice: 2 });

    const routeWithKey = SourceProducerSchema.parse({
      kind: 'route',
      channel: 1,
      keyDevice: 2,
    });
    expect(routeWithKey).not.toHaveProperty('keyDevice');
  });
});

describe('the fit aspect derives from the format', () => {
  it('AUTO is the ONLY format that determines no aspect', () => {
    // A format added to the vocabulary without a raster beside it would fall
    // through the table and be indistinguishable, downstream, from an operator
    // who deliberately chose AUTO. This is the guard against that.
    const none = LIVE_SOURCE_FORMATS.filter((f) => aspectForFormat(f) === null);
    expect(none).toEqual(['AUTO']);
  });

  it('derives the display aspect, not the raster, for PAL and NTSC', () => {
    // 720x576 has non-square pixels: 720/576 = 1.25 is a shape no display shows,
    // and cropping a 4:3 feed to it cuts picture off the top and bottom.
    expect(aspectForFormat('PAL')).toBeCloseTo(4 / 3, 10);
    expect(aspectForFormat('NTSC')).toBeCloseTo(4 / 3, 10);
  });

  it('reads 16:9 off every HD/UHD mode, and DCI off the dci ones', () => {
    for (const format of ['720p5000', '1080i5000', '1080p2500', '2160p3000', '576p2500'] as const) {
      expect(aspectForFormat(format)).toBeCloseTo(16 / 9, 10);
    }
    // `dci1080p2500` also starts with a `1080p`-looking tail; 2048x1080 is
    // 1.896, and cropping it as 1.778 loses a strip down both sides.
    expect(aspectForFormat('dci1080p2500')).toBeCloseTo(2048 / 1080, 10);
    expect(aspectForFormat('dci2160p2400')).toBeCloseTo(4096 / 2160, 10);
    expect(aspectForFormat('1556p2500')).toBeCloseTo(2048 / 1556, 10);
  });

  it('consults the explicit aspect ONLY where the format determines none', () => {
    const producer = { kind: 'route', channel: 1 } as const;
    // A format that determines a raster WINS over a typed number — the typed
    // number is the value that can be wrong on air while looking reasonable.
    expect(mappingAspect({ id: 'a', format: '1080i5000', aspect: 1.25, producer })).toBeCloseTo(
      16 / 9,
      10,
    );
    expect(mappingAspect({ id: 'a', format: 'AUTO', aspect: 1.25, producer })).toBe(1.25);
    expect(mappingAspect({ id: 'a', aspect: 1.25, producer })).toBe(1.25);
    // Neither side states anything: `null`, and what happens then is phase 6's
    // (tasks.md 6.3), deliberately not decided here.
    expect(mappingAspect({ id: 'a', producer })).toBeNull();
  });
});

describe('the mapping file', () => {
  it('an empty mapping is a legal file, and is what an ABSENT file means', () => {
    expect(SourceMappingsSchema.parse(EMPTY_SOURCE_MAPPINGS)).toEqual({ mappings: [] });
  });

  it('carries the layer band, and refuses an inverted one', () => {
    expect(LiveSourceLayerRangeSchema.safeParse({ start: 10, end: 59 }).success).toBe(true);
    expect(LiveSourceLayerRangeSchema.safeParse({ start: 59, end: 10 }).success).toBe(false);
    expect(LiveSourceLayerRangeSchema.safeParse({ start: 10, end: 10 }).success).toBe(true);
  });

  it('the suggested band is design.md §4s 10-59 and is NOT applied on its own', () => {
    expect(SUGGESTED_LIVE_SOURCE_LAYER_RANGE).toEqual({ start: 10, end: 59 });
    // The empty mapping — what a station with no file has — declares NO band.
    expect(EMPTY_SOURCE_MAPPINGS.layerRange).toBeUndefined();
  });

  it('refuses a format outside the vocabulary', () => {
    const bad = SourceMappingsSchema.safeParse({
      mappings: [{ id: 'guest-1', format: '1080i50', producer: { kind: 'route', channel: 1 } }],
    });
    expect(bad.success).toBe(false);
  });
});

describe('the refusal codes are ONE definition', () => {
  it('names the three the store can raise', () => {
    // The store DERIVES its error type from this array. A code added on one
    // side and not the other is exactly the drift the shared const prevents.
    expect([...SOURCES_SET_CONFIG_REASONS]).toEqual([
      'duplicate-id',
      'overlaps-fixed-bank',
      'overlaps-reserved',
    ]);
  });
});

describe('the vocabulary is the artifacts, verbatim', () => {
  it('carries all 37 values with AUTO and PAL among them', () => {
    // `ChannelInput` -> `Format` in docs/recon/ciab-client-tools.json. Adopted
    // rather than invented, so an operator who configured the previous system
    // recognises every entry.
    expect(LIVE_SOURCE_FORMATS).toHaveLength(37);
    const set = new Set<LiveSourceFormat>(LIVE_SOURCE_FORMATS);
    expect(set.size).toBe(LIVE_SOURCE_FORMATS.length);
    expect(set.has('AUTO')).toBe(true);
    expect(set.has('PAL')).toBe(true);
    expect(set.has('1080i5000')).toBe(true);
  });
});
