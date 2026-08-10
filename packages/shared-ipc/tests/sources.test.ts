import { describe, expect, it } from 'vitest';
import {
  aspectForFormat,
  assignedSourceId,
  checkSourceAssignments,
  checkSourceCatalog,
  EMPTY_SOURCE_ASSIGNMENTS,
  EMPTY_SOURCE_CATALOG,
  LIVE_SOURCE_FORMATS,
  LiveSourceLayerRangeSchema,
  nextSourceId,
  pruneAssignmentsForCatalog,
  SOURCES_SET_ASSIGNMENTS_REASONS,
  SOURCES_SET_CONFIG_REASONS,
  SourceAssignmentsConfigError,
  SourceAssignmentsSchema,
  SourceCatalogConfigError,
  SourceCatalogSchema,
  SourceProducerSchema,
  sourceAspect,
  SUGGESTED_LIVE_SOURCE_LAYER_RANGE,
  unassignedPlateIds,
  validateSourceAssignments,
  validateSourceCatalog,
  type LiveSourceFormat,
  type SourceCatalog,
} from '../src/channels/sources.js';
import type { FixedLayerBank } from '../src/channels/fixedLayers.js';

/**
 * D-137 / C-015 phase 4 — the WIRE SHAPE of the installation's live sources,
 * after the 2026-08-10 reshape into a named CATALOG plus per-plate ASSIGNMENTS.
 *
 * The properties worth a test here are the ones that decide what reaches air: an
 * unreachable producer form must be refused at the BOUNDARY rather than become
 * an AMCP `400` at take time; the fit aspect must come from the FORMAT rather
 * than a number somebody typed; and deleting a source that is in use must
 * neither be refused nor leave a binding dangling until air.
 */

const routeProducer = { kind: 'route', channel: 2 } as const;

function source(id: string, name: string, extra: Record<string, unknown> = {}) {
  return { id, name, producer: routeProducer, ...extra };
}

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

    const routeWithKey = SourceProducerSchema.parse({ kind: 'route', channel: 1, keyDevice: 2 });
    expect(routeWithKey).not.toHaveProperty('keyDevice');
  });

  it('carries NO format on the DECKLINK arm — the ENTRY format is the one that fits', () => {
    // Two spellings of one fact, with nothing to say which the crop was computed
    // from, is precisely the drift §3a's decision exists to prevent.
    const parsed = SourceProducerSchema.parse({
      kind: 'decklink',
      device: 1,
      format: '1080i5000',
    });
    expect(parsed).not.toHaveProperty('format');
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
    // A format that determines a raster WINS over a typed number — the typed
    // number is the value that can be wrong on air while looking reasonable.
    expect(
      sourceAspect({ ...source('src-a', 'Studio A'), format: '1080i5000', aspect: 1.25 }),
    ).toBeCloseTo(16 / 9, 10);
    expect(sourceAspect({ ...source('src-a', 'Studio A'), format: 'AUTO', aspect: 1.25 })).toBe(
      1.25,
    );
    expect(sourceAspect({ ...source('src-a', 'Studio A'), aspect: 1.25 })).toBe(1.25);
    // Neither side states anything: `null`, and what happens then is phase 6's
    // (tasks.md 6.3), deliberately not decided here.
    expect(sourceAspect(source('src-a', 'Studio A'))).toBeNull();
  });
});

describe('the catalog file', () => {
  it('an empty catalog is a legal file, and is what an ABSENT file means', () => {
    expect(SourceCatalogSchema.parse(EMPTY_SOURCE_CATALOG)).toEqual({ sources: [] });
  });

  it('a source needs a NAME — it is the only handle the operator ever sees', () => {
    expect(SourceCatalogSchema.safeParse({ sources: [source('src-a', 'Studio A')] }).success).toBe(
      true,
    );
    expect(SourceCatalogSchema.safeParse({ sources: [source('src-a', '   ')] }).success).toBe(
      false,
    );
    expect(
      SourceCatalogSchema.safeParse({ sources: [{ id: 'src-a', producer: routeProducer }] })
        .success,
    ).toBe(false);
  });

  it('carries the layer band, and refuses an inverted one', () => {
    expect(LiveSourceLayerRangeSchema.safeParse({ start: 10, end: 59 }).success).toBe(true);
    expect(LiveSourceLayerRangeSchema.safeParse({ start: 59, end: 10 }).success).toBe(false);
    expect(LiveSourceLayerRangeSchema.safeParse({ start: 10, end: 10 }).success).toBe(true);
  });

  it('the suggested band is design.md §4s 10-59 and is NOT applied on its own', () => {
    expect(SUGGESTED_LIVE_SOURCE_LAYER_RANGE).toEqual({ start: 10, end: 59 });
    // The empty catalog — what a station with no file has — declares NO band.
    expect(EMPTY_SOURCE_CATALOG.layerRange).toBeUndefined();
  });

  it('refuses a format outside the vocabulary', () => {
    const bad = SourceCatalogSchema.safeParse({
      sources: [source('src-a', 'Studio A', { format: '1080i50' })],
    });
    expect(bad.success).toBe(false);
  });
});

describe('nextSourceId — an id is NEVER reused', () => {
  it('never returns an id already in the list', () => {
    // Not tidiness: a re-issued id is a stale assignment silently re-binding to
    // a source nobody chose. Generated randomly, a retired id never comes back.
    const existing: string[] = [];
    for (let i = 0; i < 50; i += 1) {
      const id = nextSourceId(existing);
      expect(existing).not.toContain(id);
      existing.push(id);
    }
    expect(new Set(existing).size).toBe(50);
  });

  it('generates an id the schema accepts', () => {
    const id = nextSourceId([]);
    expect(SourceCatalogSchema.safeParse({ sources: [source(id, 'Studio A')] }).success).toBe(true);
  });
});

describe('validateSourceCatalog — at load AND at change', () => {
  function bank(overrides: Partial<FixedLayerBank> = {}): FixedLayerBank {
    return { channel: 1, start: 70, count: 30, ...overrides };
  }

  const studioA = source('src-aaa', 'Studio A');

  function codeOf(fn: () => unknown): { code: string; message: string } {
    try {
      fn();
    } catch (err) {
      if (err instanceof SourceCatalogConfigError) return { code: err.code, message: err.message };
      throw err;
    }
    throw new Error('expected SourceCatalogConfigError');
  }

  it('accepts a band clear of both the bank and the reservation', () => {
    expect(() =>
      validateSourceCatalog(
        { sources: [studioA], layerRange: { start: 10, end: 59 } },
        { fixedBank: bank(), reservedLayers: [60, 61, 62] },
      ),
    ).not.toThrow();
  });

  it('refuses two sources claiming one id', () => {
    const { code, message } = codeOf(() =>
      validateSourceCatalog(
        { sources: [studioA, source('src-aaa', 'Baku')] },
        { fixedBank: null, reservedLayers: [] },
      ),
    );
    expect(code).toBe('duplicate-id');
    // Which producer an assignment reached would depend on array order — the
    // message has to say that, not merely "duplicate".
    expect(message).toContain('src-aaa');
    expect(message).toMatch(/order/i);
  });

  it('refuses two sources sharing the operator-facing NAME', () => {
    // The picker lists names. Two entries called "Studio A" leave the operator
    // choosing blind, and the wrong choice is a wrong camera behind a guest.
    const { code, message } = codeOf(() =>
      validateSourceCatalog(
        { sources: [studioA, source('src-bbb', ' studio  a ')] },
        { fixedBank: null, reservedLayers: [] },
      ),
    );
    expect(code).toBe('duplicate-name');
    expect(message).toMatch(/rename/i);
  });

  it('refuses a band overlapping the candidate bank, naming BOTH ranges', () => {
    const { code, message } = codeOf(() =>
      validateSourceCatalog(
        { sources: [], layerRange: { start: 50, end: 75 } },
        { fixedBank: bank(), reservedLayers: [] },
      ),
    );
    expect(code).toBe('overlaps-fixed-bank');
    expect(message).toContain('50-75');
    expect(message).toContain('70-99');
  });

  it('refuses a band overlapping the reserved playout range, naming the layers', () => {
    const { code, message } = codeOf(() =>
      validateSourceCatalog(
        { sources: [], layerRange: { start: 55, end: 65 } },
        { fixedBank: null, reservedLayers: [60, 61, 62, 63, 64, 65, 66, 67, 68, 69] },
      ),
    );
    expect(code).toBe('overlaps-reserved');
    expect(message).toContain('55-65');
    expect(message).toContain('60-69');
    expect(message).toContain('60, 61');
  });

  it('compares LAYER NUMBERS regardless of channel — the conservative direction', () => {
    // The band carries no channel because a Live Source lands on whatever
    // channel its template is on. Refusing an overlap the bank declares on
    // channel 2 refuses more than is strictly necessary, and that is right for
    // a check whose failure mode is a graphic landing on somebody else's layer.
    expect(() =>
      validateSourceCatalog(
        { sources: [], layerRange: { start: 70, end: 80 } },
        { fixedBank: bank({ channel: 2 }), reservedLayers: [] },
      ),
    ).toThrow(SourceCatalogConfigError);
  });

  it('checks nothing about layers when no band is declared', () => {
    // A catalog with no band is legal — nothing can be placed, which is phase
    // 5's problem, not a config error.
    expect(() =>
      validateSourceCatalog({ sources: [studioA] }, { fixedBank: bank(), reservedLayers: [60] }),
    ).not.toThrow();
  });

  it('checkSourceCatalog answers the same verdict as a RESULT', () => {
    // The bridge's `sources.set-config` and the offline mock both answer with
    // this shape, from this one function — a mock that refused differently from
    // the bridge would teach an operator a rule the real station does not have.
    expect(
      checkSourceCatalog({ sources: [studioA] }, { fixedBank: null, reservedLayers: [] }),
    ).toEqual({ ok: true });
    expect(
      checkSourceCatalog(
        { sources: [], layerRange: { start: 50, end: 75 } },
        { fixedBank: bank(), reservedLayers: [] },
      ),
    ).toMatchObject({ ok: false, reason: 'overlaps-fixed-bank' });
  });
});

describe('the assignments — the join the operator makes', () => {
  const catalog: SourceCatalog = {
    sources: [source('src-aaa', 'Studio A'), source('src-bbb', 'Baku')],
  };

  it('an empty set is a legal file, and is what an ABSENT file means', () => {
    expect(SourceAssignmentsSchema.parse(EMPTY_SOURCE_ASSIGNMENTS)).toEqual({ assignments: [] });
  });

  it('accepts a plate pointed at a defined source', () => {
    expect(() =>
      validateSourceAssignments(
        { assignments: [{ templateId: 'tpl-1', plateId: 'guest-1', sourceId: 'src-aaa' }] },
        { catalog },
      ),
    ).not.toThrow();
  });

  it('permits ONE source on TWO plates — two producers reading one input', () => {
    // Unremarkable for `route://`; a DECKLINK input may refuse a second open,
    // which is a RECON question for phase 6's measurement session and is
    // deliberately not presented as guaranteed anywhere in the UI.
    expect(() =>
      validateSourceAssignments(
        {
          assignments: [
            { templateId: 'tpl-1', plateId: 'guest-1', sourceId: 'src-aaa' },
            { templateId: 'tpl-1', plateId: 'guest-2', sourceId: 'src-aaa' },
          ],
        },
        { catalog },
      ),
    ).not.toThrow();
  });

  it('refuses one plate assigned twice', () => {
    expect(() =>
      validateSourceAssignments(
        {
          assignments: [
            { templateId: 'tpl-1', plateId: 'guest-1', sourceId: 'src-aaa' },
            { templateId: 'tpl-1', plateId: 'guest-1', sourceId: 'src-bbb' },
          ],
        },
        { catalog },
      ),
    ).toThrow(SourceAssignmentsConfigError);
  });

  it('refuses AT CHANGE a plate naming a source this installation does not define', () => {
    const verdict = checkSourceAssignments(
      { assignments: [{ templateId: 'tpl-1', plateId: 'guest-1', sourceId: 'src-gone' }] },
      { catalog },
    );
    expect(verdict).toMatchObject({ ok: false, reason: 'unknown-source' });
    expect(verdict.ok ? '' : verdict.message).toContain('guest-1');
  });

  it('reads back which source a plate uses, and which plates have none', () => {
    const assignments = {
      assignments: [{ templateId: 'tpl-1', plateId: 'guest-1', sourceId: 'src-aaa' }],
    };
    expect(assignedSourceId(assignments, 'tpl-1', 'guest-1')).toBe('src-aaa');
    expect(assignedSourceId(assignments, 'tpl-1', 'guest-2')).toBeNull();
    // A freshly imported template has ALL of its plates here, which is the
    // ordinary state and not an error.
    expect(unassignedPlateIds(assignments, 'tpl-1', ['guest-1', 'guest-2'])).toEqual(['guest-2']);
    expect(unassignedPlateIds(EMPTY_SOURCE_ASSIGNMENTS, 'tpl-1', ['guest-1', 'guest-2'])).toEqual([
      'guest-1',
      'guest-2',
    ]);
  });
});

describe('deleting a source that is in use — cascades, never dangles', () => {
  const catalog: SourceCatalog = {
    sources: [source('src-aaa', 'Studio A'), source('src-bbb', 'Baku')],
  };
  const assignments = {
    assignments: [
      { templateId: 'tpl-1', plateId: 'guest-1', sourceId: 'src-aaa' },
      { templateId: 'tpl-1', plateId: 'guest-2', sourceId: 'src-bbb' },
      { templateId: 'tpl-2', plateId: 'guest-1', sourceId: 'src-bbb' },
    ],
  };

  it('drops exactly the assignments the new catalog orphans, and REPORTS them', () => {
    // The report is the whole point: the operator is told at the moment of
    // deletion which templates referenced it, rather than at a take.
    const withoutBaku: SourceCatalog = { sources: [source('src-aaa', 'Studio A')] };
    const pruned = pruneAssignmentsForCatalog(assignments, withoutBaku);
    expect(pruned.value.assignments).toEqual([
      { templateId: 'tpl-1', plateId: 'guest-1', sourceId: 'src-aaa' },
    ]);
    expect(pruned.dropped).toEqual([
      { templateId: 'tpl-1', plateId: 'guest-2', sourceId: 'src-bbb' },
      { templateId: 'tpl-2', plateId: 'guest-1', sourceId: 'src-bbb' },
    ]);
  });

  it('leaves the plates it dropped reading as UNASSIGNED, not as broken', () => {
    const withoutBaku: SourceCatalog = { sources: [source('src-aaa', 'Studio A')] };
    const pruned = pruneAssignmentsForCatalog(assignments, withoutBaku);
    expect(unassignedPlateIds(pruned.value, 'tpl-1', ['guest-1', 'guest-2'])).toEqual(['guest-2']);
  });

  it('returns the SAME object when nothing is orphaned', () => {
    // The identity matters: the bridge persists and publishes only when
    // something was dropped, and it decides that from `dropped.length`.
    const pruned = pruneAssignmentsForCatalog(assignments, catalog);
    expect(pruned.dropped).toEqual([]);
    expect(pruned.value).toBe(assignments);
  });
});

describe('the refusal codes are ONE definition', () => {
  it('names the four the catalog can raise and the two the assignments can', () => {
    // The stores DERIVE their error types from these arrays. A code added on one
    // side and not the other is exactly the drift the shared const prevents.
    expect([...SOURCES_SET_CONFIG_REASONS]).toEqual([
      'duplicate-id',
      'duplicate-name',
      'overlaps-fixed-bank',
      'overlaps-reserved',
    ]);
    expect([...SOURCES_SET_ASSIGNMENTS_REASONS]).toEqual(['duplicate-plate', 'unknown-source']);
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
