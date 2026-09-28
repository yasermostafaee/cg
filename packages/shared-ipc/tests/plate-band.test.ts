import { describe, expect, it } from 'vitest';
import {
  ConsoleSourceCatalogSchema,
  SUGGESTED_LIVE_SOURCE_LAYER_RANGE,
  SourceCatalogSchema,
  consoleSourceCatalog,
  plateBandInForce,
  publishedPlateBand,
  type FixedLayerBank,
  type PlateBandStation,
} from '../src/index.js';

/**
 * 🔴 `PLATE-BAND-01` (the owner, 2026-09-28) — **A STATION LINKED TO THE PLAYOUT GETS THE PLATE BAND
 * 60–79 WITH NO HAND STEP, UNLESS ITS OWN CONFIG CLAIMS A LAYER THERE.** A declared band is used as
 * declared; a station not linked keeps the old rule (declared, or none). Every "none" below sits
 * beside the control that shows the same station WOULD get the default without the one thing named.
 */

/** A station as first-run leaves it: channel 2's bank, operator rows 80–99, beds 50–59. */
const BANK: FixedLayerBank = {
  channel: 2,
  start: 80,
  count: 20,
  low: { start: 50, count: 10 },
};

function station(over: Partial<PlateBandStation> = {}): PlateBandStation {
  return {
    declared: undefined,
    playoutLinked: true,
    banks: [BANK],
    reservedLayers: [],
    ...over,
  };
}

const DEFAULT = { range: { start: 60, end: 79 }, origin: 'default' };

describe('plateBandInForce — the three rules, in order', () => {
  it('🔴 linked, no band declared, nothing of its own in 60–79: the default 60–79', () => {
    expect(plateBandInForce(station())).toEqual(DEFAULT);
  });

  it('a declared band is used exactly as declared — on a linked station too', () => {
    expect(plateBandInForce(station({ declared: { start: 70, end: 79 } }))).toEqual({
      range: { start: 70, end: 79 },
      origin: 'declared',
    });
    // …and on an unlinked one.
    expect(
      plateBandInForce(station({ playoutLinked: false, declared: { start: 70, end: 79 } })),
    ).toEqual({ range: { start: 70, end: 79 }, origin: 'declared' });
  });

  it('🔴 a station reserving layer 65 gets NO default — control: a reservation outside the band leaves it', () => {
    expect(plateBandInForce(station({ reservedLayers: [65] }))).toBeNull();
    // Each end of the band counts, and nothing past it does.
    expect(plateBandInForce(station({ reservedLayers: [60] }))).toBeNull();
    expect(plateBandInForce(station({ reservedLayers: [79] }))).toBeNull();
    expect(plateBandInForce(station({ reservedLayers: [5, 49] }))).toEqual(DEFAULT);
  });

  it('an unlinked station keeps the old rule: none — control: the same station linked gets it', () => {
    expect(plateBandInForce(station({ playoutLinked: false }))).toBeNull();
    expect(plateBandInForce(station({ playoutLinked: true }))).toEqual(DEFAULT);
  });

  it('a bank row in 60–79 claims the band: no default — the boot never meets it', () => {
    const inBand: FixedLayerBank = {
      channel: 3,
      start: 60,
      count: 20,
      low: { start: 50, count: 10 },
    };
    expect(plateBandInForce(station({ banks: [BANK, inBand] }))).toBeNull();
    // Control: a second standard bank leaves it.
    expect(plateBandInForce(station({ banks: [BANK, { ...BANK, channel: 3 }] }))).toEqual(DEFAULT);
  });

  it('a deployment policy range in 60–79 claims the band too — control: one below it does not', () => {
    // The suite's own `TEST_LAYER_POLICY` gives `custom` 60–69: that allocator hands those layers out.
    expect(plateBandInForce(station({ policyRanges: [[60, 69]] }))).toBeNull();
    expect(plateBandInForce(station({ policyRanges: [[75, 99]] }))).toBeNull();
    expect(plateBandInForce(station({ policyRanges: [[10, 19]] }))).toEqual(DEFAULT);
  });

  it('a station still in first-run (no bank yet) gets it, if nothing is reserved there', () => {
    expect(plateBandInForce(station({ banks: [] }))).toEqual(DEFAULT);
    expect(plateBandInForce(station({ banks: [], reservedLayers: [70] }))).toBeNull();
  });

  it('the default is the layer map’s plate band, and a fresh value every time', () => {
    const one = plateBandInForce(station());
    expect(one?.range).toEqual(SUGGESTED_LIVE_SOURCE_LAYER_RANGE);
    expect(one?.range).not.toBe(SUGGESTED_LIVE_SOURCE_LAYER_RANGE);
    if (one !== null) one.range.start = 1;
    expect(plateBandInForce(station())).toEqual(DEFAULT);
    expect(SUGGESTED_LIVE_SOURCE_LAYER_RANGE).toEqual({ start: 60, end: 79 });
  });
});

describe('the default is PUBLISHED, never STORED', () => {
  it('🔴 the file’s schema has no field for it: a band in force written into a file is dropped on load', () => {
    const file = SourceCatalogSchema.parse({ sources: [], plateBand: DEFAULT });
    expect(file).toEqual({ sources: [] });
    expect('plateBand' in file).toBe(false);
    // Control: the console's schema carries it.
    expect(ConsoleSourceCatalogSchema.parse({ sources: [], plateBand: DEFAULT })).toEqual({
      sources: [],
      plateBand: DEFAULT,
    });
  });

  it('consoleSourceCatalog puts the band in force beside the catalogue, redacted as before', () => {
    const catalog = SourceCatalogSchema.parse({
      sources: [
        {
          id: 'in-cam',
          name: 'Cam',
          producer: { kind: 'stream', url: 'rtsp://user:secret@10.0.0.5/live' },
        },
      ],
    });
    const told = consoleSourceCatalog(catalog, plateBandInForce(station()));
    expect(told.plateBand).toEqual(DEFAULT);
    expect(told.layerRange).toBeUndefined();
    expect(JSON.stringify(told)).not.toContain('secret');
    // None in force: no field at all.
    expect('plateBand' in consoleSourceCatalog(catalog, null)).toBe(false);
  });

  it('publishedPlateBand reads the band in force; a bridge that sends none is read by its declared band', () => {
    expect(publishedPlateBand({ sources: [], plateBand: DEFAULT })).toEqual(DEFAULT);
    // A bridge from before `PLATE-BAND-01`: its band in force WAS its declared one.
    expect(publishedPlateBand({ sources: [], layerRange: { start: 70, end: 79 } })).toEqual({
      range: { start: 70, end: 79 },
      origin: 'declared',
    });
    expect(publishedPlateBand({ sources: [] })).toBeNull();
  });
});
