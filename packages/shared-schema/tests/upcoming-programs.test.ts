import { describe, expect, it } from 'vitest';
import { readCgControl, withCgControl } from '../src/control-payload.js';
import {
  UPCOMING_PROGRAM_MEDIA_PATH_RE,
  UpcomingProgramsOverridesSchema,
  upcomingProgramMediaAssetId,
  upcomingProgramMediaHash,
  upcomingProgramMediaPath,
  upcomingProgramsMediaHashes,
  upcomingProgramsOverrideIssue,
  type UpcomingProgramsTemplateMetadata,
} from '../src/upcoming-programs-control.js';
import {
  UpcomingProgramsCardStyleSchema,
  upcomingProgramsCardStyleOf,
} from '../src/upcoming-programs.js';

describe('Upcoming Programs Take data', () => {
  const sha = 'a'.repeat(64);
  const poster = 'b'.repeat(64);
  const metadata: UpcomingProgramsTemplateMetadata = {
    elements: [
      { id: 'cards', name: 'Cards', layout: 'carousel', mediaVisible: true, preparedItems: [] },
    ],
    assets: [{ id: 'approved-photo', name: 'Approved photo', kind: 'image' }],
  };
  const overrides = UpcomingProgramsOverridesSchema.parse({
    cards: [
      {
        id: 'one',
        title: 'برنامه ۲',
        airtime: '22:30',
        mediaAssetId: upcomingProgramMediaAssetId(sha),
        mediaKind: 'video',
        posterAssetId: upcomingProgramMediaAssetId(poster),
        url: 'https://untrusted.invalid/',
      },
      { id: 'two', title: 'دوم', mediaKind: 'image', mediaAssetId: 'approved-photo' },
      {
        id: 'third',
        title: '',
        mediaKind: 'image',
        mediaAssetId: upcomingProgramMediaAssetId(poster),
      },
    ],
  });

  it('round trips only typed values and drops a malformed member independently', () => {
    expect(readCgControl(withCgControl({}, { upcomingPrograms: overrides }))).toEqual({
      upcomingPrograms: overrides,
    });
    expect(overrides.cards?.[0]).not.toHaveProperty('url');
    expect(readCgControl({ __cg: { upcomingPrograms: { cards: [null] }, take: 'valid' } })).toEqual(
      {
        take: 'valid',
      },
    );
    expect(
      UpcomingProgramsOverridesSchema.safeParse({
        cards: [overrides.cards?.[0], overrides.cards?.[0]],
      }).success,
    ).toBe(false);
  });

  it('distinguishes allowed packaged and uploaded visuals without accepting URLs or audio', () => {
    const uploaded = new Map([
      [sha, 'video'],
      [poster, 'image'],
    ] as const);
    expect(upcomingProgramsOverrideIssue(metadata, overrides, uploaded)).toBeUndefined();
    expect(upcomingProgramsOverrideIssue(metadata, overrides, new Map())).toBe(
      'upcoming-program-media-unavailable',
    );
    expect(
      upcomingProgramsOverrideIssue(
        metadata,
        {
          cards: [
            {
              id: 'one',
              title: '',
              mediaKind: 'image',
              mediaAssetId: 'https://untrusted.invalid/',
            },
          ],
        },
        uploaded,
      ),
    ).toBe('upcoming-program-media-unavailable');
    expect(
      upcomingProgramsOverrideIssue(
        metadata,
        { cards: [{ id: 'one', title: '', audioAssetId: 'anything' }] },
        uploaded,
      ),
    ).toBe('upcoming-programs-invalid');
    expect(upcomingProgramsMediaHashes(overrides)).toEqual([sha, poster]);
    expect(upcomingProgramMediaHash(upcomingProgramMediaAssetId(sha))).toBe(sha);
    expect(upcomingProgramMediaHash('upcoming-media:../other')).toBeUndefined();
    expect(upcomingProgramMediaPath(sha)).toMatch(UPCOMING_PROGRAM_MEDIA_PATH_RE);
  });

  it('lets the operator edit titles with validated dormant media behind a hidden aperture', () => {
    expect(
      upcomingProgramsOverrideIssue(
        {
          ...metadata,
          elements: metadata.elements.map((element) => ({ ...element, mediaVisible: false })),
        },
        overrides,
        new Map([
          [sha, 'video'],
          [poster, 'image'],
        ]),
      ),
    ).toBeUndefined();
  });
});

describe('Upcoming Programs card styling', () => {
  it('keeps legacy cards at their original size, opacity and direction defaults', () => {
    const style = upcomingProgramsCardStyleOf({});

    expect(style.carousel).toEqual({
      focusPosition: 'center',
      focusMovement: 'fixed',
      allowOverlap: false,
      focusMotionMs: 250,
      focusedScale: 1,
      unfocusedScale: 1,
      focusedOpacity: 1,
      unfocusedOpacity: 1,
    });
    expect(style.title.direction).toBe('auto');
    expect(style.airtime.direction).toBe('auto');
    expect(style.title.digits).toBe('as-typed');
    expect(style.airtime.digits).toBe('as-typed');
    expect(style.title.fontWeight).toBe(700);
    expect(style.airtime.fontWeight).toBe(600);
    expect(style.focusedTitle).toEqual(style.title);
    expect(style.focusedAirtime).toEqual(style.airtime);
  });

  it('resolves explicit vertical alignment while preserving legacy fixed Grid placement', () => {
    expect(
      upcomingProgramsCardStyleOf({ layout: 'carousel', cardStyle: { height: 120 } }).verticalAlign,
    ).toBe('center');
    expect(upcomingProgramsCardStyleOf({ layout: 'grid' }).verticalAlign).toBe('center');
    expect(
      upcomingProgramsCardStyleOf({ layout: 'grid', cardStyle: { height: 120 } }).verticalAlign,
    ).toBe('top');
    const cardStyle = UpcomingProgramsCardStyleSchema.parse({
      height: 120,
      verticalAlign: 'bottom',
    });
    expect(upcomingProgramsCardStyleOf({ layout: 'grid', cardStyle }).verticalAlign).toBe('bottom');
    expect(UpcomingProgramsCardStyleSchema.safeParse({ verticalAlign: 'start' }).success).toBe(
      false,
    );
  });

  it('validates title and airtime digits separately and resolves focused inheritance', () => {
    const cardStyle = UpcomingProgramsCardStyleSchema.parse({
      title: { digits: 'persian' },
      airtime: { digits: 'arabic-indic' },
      focusedTitle: { digits: 'latin' },
      focusedAirtime: { fontWeight: 800 },
    });
    const style = upcomingProgramsCardStyleOf({ cardStyle });

    expect(style.title.digits).toBe('persian');
    expect(style.airtime.digits).toBe('arabic-indic');
    expect(style.focusedTitle.digits).toBe('latin');
    expect(style.focusedAirtime.digits).toBe('arabic-indic');
    expect(
      upcomingProgramsCardStyleOf({
        cardStyle: { ...cardStyle, focusedAirtime: { digits: 'as-typed' } },
      }).focusedAirtime.digits,
    ).toBe('as-typed');
    expect(
      UpcomingProgramsCardStyleSchema.safeParse({ focusedAirtime: { digits: 'arabic' } }).success,
    ).toBe(false);
  });

  it('applies per-field focused changes while retaining the base text style', () => {
    const cardStyle = UpcomingProgramsCardStyleSchema.parse({
      title: {
        align: 'end',
        direction: 'rtl',
        fontFamily: 'Vazirmatn',
        fontSize: 32,
        fontWeight: 500,
        rect: { x: 0.05, y: 0.2, width: 0.9, height: 0.3 },
      },
      focusedTitle: { color: '#68EECD' },
      airtime: { align: 'start', direction: 'rtl', color: '#88FFFF', fontSize: 20 },
      focusedAirtime: { direction: 'auto', align: 'center', fontSize: null, fontWeight: 800 },
      carousel: { focusPosition: 'end', focusedScale: 1.2, unfocusedOpacity: 0 },
    });
    const style = upcomingProgramsCardStyleOf({ cardStyle });

    expect(style.focusedTitle).toEqual({ ...style.title, color: '#68EECD' });
    expect(style.focusedAirtime).toEqual({
      ...style.airtime,
      direction: 'auto',
      align: 'center',
      fontSize: undefined,
      fontWeight: 800,
    });
    expect(style.carousel).toEqual({
      focusPosition: 'end',
      focusMovement: 'fixed',
      allowOverlap: false,
      focusMotionMs: 250,
      focusedScale: 1.2,
      unfocusedScale: 1,
      focusedOpacity: 1,
      unfocusedOpacity: 0,
    });
  });

  it('retains across-card focus, overlap and an explicit cut as independent settings', () => {
    const carousel = {
      focusPosition: 'end',
      focusMovement: 'across',
      allowOverlap: true,
      focusMotionMs: 0,
    };
    const cardStyle = UpcomingProgramsCardStyleSchema.parse({ carousel });

    expect(cardStyle.carousel).toEqual(carousel);
    expect(upcomingProgramsCardStyleOf({ cardStyle }).carousel).toMatchObject(carousel);
  });

  it.each([-1, 0.5, Infinity, Number.MAX_SAFE_INTEGER + 1])(
    'rejects invalid focus motion duration %s',
    (focusMotionMs) => {
      expect(
        UpcomingProgramsCardStyleSchema.safeParse({ carousel: { focusMotionMs } }).success,
      ).toBe(false);
    },
  );

  it('keeps existing media frames square with no border and the original background', () => {
    const style = upcomingProgramsCardStyleOf({ cardStyle: { media: { visible: true } } });

    expect(style.media).toMatchObject({
      visible: true,
      borderWidth: 0,
      borderColor: '#8294A0',
      cornerRadius: 0,
      backgroundColor: '#18252D',
    });
  });

  it('resolves the media frame finish separately from the card finish', () => {
    const media = {
      borderWidth: 2.5,
      borderColor: '#DDCCBB',
      cornerRadius: 21,
      backgroundColor: '#554433AA',
    };
    const cardStyle = UpcomingProgramsCardStyleSchema.parse({
      borderWidth: 4,
      borderColor: '#112233',
      cornerRadius: 10,
      background: '#223344',
      media,
    });
    const style = upcomingProgramsCardStyleOf({ cardStyle });
    expect(style.media).toMatchObject(media);
    expect(style).toMatchObject({
      borderWidth: 4,
      borderColor: '#112233',
      cornerRadius: 10,
      background: '#223344',
    });
  });

  it('keeps automatic card spacing absent and retains an explicit zero gap', () => {
    expect(upcomingProgramsCardStyleOf({}).gap).toBeUndefined();
    expect(upcomingProgramsCardStyleOf({ cardStyle: { gap: 0 } }).gap).toBe(0);
    expect(upcomingProgramsCardStyleOf({ cardStyle: { gap: 32 } }).gap).toBe(32);
    expect(UpcomingProgramsCardStyleSchema.safeParse({ gap: -1 }).success).toBe(false);
    expect(UpcomingProgramsCardStyleSchema.safeParse({ gap: Infinity }).success).toBe(false);
  });

  it.each([{ borderWidth: -1 }, { cornerRadius: -1 }, { backgroundColor: 'black' }])(
    'rejects invalid media frame settings %o',
    (media) => {
      expect(UpcomingProgramsCardStyleSchema.safeParse({ media }).success).toBe(false);
    },
  );

  it.each([{ focusedScale: 0 }, { unfocusedScale: -1 }, { focusedOpacity: 1.1 }])(
    'rejects invalid carousel settings %o',
    (carousel) => {
      expect(UpcomingProgramsCardStyleSchema.safeParse({ carousel }).success).toBe(false);
    },
  );

  it.each([99, 901, 650.5])('rejects invalid authored font weight %d', (fontWeight) => {
    expect(UpcomingProgramsCardStyleSchema.safeParse({ title: { fontWeight } }).success).toBe(
      false,
    );
  });
});
