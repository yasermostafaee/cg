import { describe, expect, it } from 'vitest';
import {
  DUPLICATE_NAME_REASON,
  INPUT_GONE_REASON,
  MEDIA_GONE_REASON,
  OTHER_SERVER_REASON,
  ROUTE_NOT_SUPPORTED_YET,
  ROUTE_NO_LAYER_REASON,
  buildPlayoutSourceCatalog,
  foldPlayoutInputsRead,
  parsePlayoutInputs,
  parsePlayoutMediaPage,
  redactCatalogForConsole,
  redactUrlCredentials,
  sourceBindable,
  sourceSeatable,
  unseatableClause,
  unseatableWords,
  type BoundMediaItem,
  type PlayoutCatalogInput,
  type PlayoutInput,
} from '../src/playout-sources.js';

/** `PLAYOUT-SOURCES-01` — the fake station: server `127.0.0.1`, channels 1 and 2 declared. */
const station = {
  hostIsOurs: (host: string): boolean => host === '127.0.0.1',
  channelFor: (host: string, channel: number): number | null =>
    host === '127.0.0.1' && (channel === 1 || channel === 2) ? channel : null,
} satisfies Pick<PlayoutCatalogInput, 'hostIsOurs' | 'channelFor'>;

const studio: PlayoutInput = {
  id: 'li-1a2b3c4d',
  name: 'Studio 1',
  casparHost: '127.0.0.1',
  producer: { kind: 'ndi', source: 'STUDIO-PC (Cam 1)' },
  format: '1080i5000',
  aspect: 1.7778,
};
const camera: PlayoutInput = {
  id: 'li-cam',
  name: 'دوربین خبر',
  casparHost: '127.0.0.1',
  producer: { kind: 'stream', url: 'rtsp://cam:secret@10.0.0.21/live' },
  format: 'AUTO',
  aspect: 1.7778,
};
const input3: PlayoutInput = {
  id: 'li-in3',
  name: 'ورودی ۳',
  producer: { kind: 'route', channel: 9, layer: 12, videoMode: '1080i5000' },
  compatibleChannels: [
    { casparHost: '127.0.0.1', casparChannel: 1 },
    { casparHost: '127.0.0.1', casparChannel: 2 },
  ],
  available: true,
};
const input4: PlayoutInput = {
  id: 'li-in4',
  name: 'ورودی ۴',
  producer: { kind: 'route', channel: 9, layer: 13 },
  compatibleChannels: [{ casparHost: '127.0.0.1', casparChannel: 1 }],
  available: false,
  reason: 'no signal',
};

const catalogOf = (
  inputs: PlayoutInput[],
  media: BoundMediaItem[] = [],
  departed: PlayoutInput[] = [],
) => buildPlayoutSourceCatalog({ inputs: { inputs, departed }, media, ...station });

describe('redactUrlCredentials (§1.E)', () => {
  it('writes scheme://user:pass@ as scheme://***@, in a URL and inside an AMCP line', () => {
    expect(redactUrlCredentials('rtsp://cam:secret@10.0.0.21/live')).toBe(
      'rtsp://***@10.0.0.21/live',
    );
    expect(redactUrlCredentials('PLAY 2-60 "rtsp://cam:secret@10.0.0.21/live"')).toBe(
      'PLAY 2-60 "rtsp://***@10.0.0.21/live"',
    );
    // A password with an `@` in it is redacted whole.
    expect(redactUrlCredentials('rtsp://u:p@ss@host/x')).toBe('rtsp://***@host/x');
  });

  it('leaves a URL with no credentials unchanged, and is idempotent (the control)', () => {
    expect(redactUrlCredentials('udp://239.255.0.1:5000?reuse=1')).toBe(
      'udp://239.255.0.1:5000?reuse=1',
    );
    const once = redactUrlCredentials('srt://a:b@h:9000');
    expect(redactUrlCredentials(once)).toBe(once);
  });
});

describe('D10: parsePlayoutInputs (§1.H)', () => {
  it('keeps every input when there is no epoch (v1.2, and 2.9.0 with the holder off)', () => {
    const read = parsePlayoutInputs({ inputs: [studio, camera] });
    expect(read?.inputs.map((i) => i.id)).toEqual(['li-1a2b3c4d', 'li-cam']);
    expect(read).not.toHaveProperty('epoch');
  });

  it('stores an epoch when one is sent (the control)', () => {
    expect(parsePlayoutInputs({ epoch: 638_921, inputs: [studio] })?.epoch).toBe(638_921);
  });

  it('is not a D10 answer without an inputs array; an input without an id is dropped', () => {
    expect(parsePlayoutInputs({ channels: [] })).toBeNull();
    expect(
      parsePlayoutInputs({ inputs: [{ name: 'x', producer: {} }, studio] })?.inputs,
    ).toHaveLength(1);
  });
});

describe('D11: parsePlayoutMediaPage', () => {
  it('drops audio even if the Playout sends it; keeps total and the cursor', () => {
    const page = parsePlayoutMediaPage({
      items: [
        { id: 'm-1', name: 'a', clip: 'C:/a.mov', type: 'video' },
        { id: 'm-2', name: 'b', clip: 'C:/b.wav', type: 'audio' },
      ],
      total: 2,
      nextCursor: 'abc',
    });
    expect(page?.items.map((i) => i.id)).toEqual(['m-1']);
    expect(page?.total).toBe(2);
    expect(page?.nextCursor).toBe('abc');
  });
});

describe('buildPlayoutSourceCatalog (§1.B)', () => {
  it('prefixes ids, keeps the Playout order, and carries the producer as sent', () => {
    const catalog = catalogOf([studio, camera]);
    expect(catalog.sources.map((s) => s.id)).toEqual(['in-li-1a2b3c4d', 'in-li-cam']);
    expect(catalog.sources[0]).toMatchObject({
      name: 'Studio 1',
      origin: 'input',
      format: '1080i5000',
      producer: { kind: 'ndi', source: 'STUDIO-PC (Cam 1)' },
    });
    expect(sourceSeatable(catalog.sources[0]!)).toBe(true);
  });

  it('gates every route input, and a route with no layer is unusable (v1.3 rule 3)', () => {
    const noLayer: PlayoutInput = {
      ...input3,
      id: 'li-nolayer',
      name: 'No layer',
      producer: { kind: 'route', channel: 9 },
    };
    const [three, four, bare] = catalogOf([input3, input4, noLayer]).sources;
    expect(three).toMatchObject({
      status: 'unusable',
      reason: ROUTE_NOT_SUPPORTED_YET,
      channels: [1, 2],
    });
    expect(four).toMatchObject({
      status: 'unusable',
      reason: ROUTE_NOT_SUPPORTED_YET,
      channels: [1],
    });
    expect(bare).toMatchObject({ status: 'unusable', reason: ROUTE_NO_LAYER_REASON });
    expect(sourceBindable(three!)).toBe(false);
  });

  it('an unusable stream scheme is listed, with the validator reason, and never bound', () => {
    const odd: PlayoutInput = {
      ...camera,
      id: 'li-odd',
      name: 'Odd',
      producer: { kind: 'stream', url: 'gopher://x/y' },
    };
    const entry = catalogOf([odd]).sources[0]!;
    expect(entry.status).toBe('unusable');
    expect(entry.reason).toMatch(/gopher/);
    expect(sourceBindable(entry)).toBe(false);
  });

  it('an input for another server is unusable; one with no casparHost is ours (their answer S1)', () => {
    const elsewhere = { ...studio, id: 'li-else', name: 'Elsewhere', casparHost: '10.9.9.9' };
    const nowhere: PlayoutInput = {
      id: 'li-none',
      name: 'None',
      producer: { kind: 'ndi', source: 'X (Y)' },
    };
    const [e, n] = catalogOf([elsewhere, nowhere]).sources;
    expect(e).toMatchObject({ status: 'unusable', reason: OTHER_SERVER_REASON });
    expect(n?.status).toBeUndefined();
  });

  it('reads a format case-insensitively; an unknown one reads as AUTO with the Playout aspect', () => {
    const [lower, unknown] = catalogOf([
      { ...studio, id: 'li-a', name: 'A', format: '1080I5000' },
      { ...studio, id: 'li-b', name: 'B', format: '4320p5000', aspect: 1.25 },
    ]).sources;
    expect(lower?.format).toBe('1080i5000');
    expect(unknown).toMatchObject({ format: 'AUTO', aspect: 1.25 });
  });

  it('leaves out an input whose producer it cannot express, and never merges two names', () => {
    const alien: PlayoutInput = {
      id: 'li-z',
      name: 'Alien',
      producer: { kind: 'webrtc', name: 'x' },
    };
    const twin = { ...studio, id: 'li-twin', name: 'studio  1' };
    const sources = catalogOf([studio, alien, twin]).sources;
    expect(sources.map((s) => s.id)).toEqual(['in-li-1a2b3c4d', 'in-li-twin']);
    expect(sources.every((s) => s.reason === DUPLICATE_NAME_REASON)).toBe(true);
    expect(sources.every((s) => sourceBindable(s))).toBe(true);
  });

  it('a departed input stays listed, unavailable and not bindable; the Playout-marked one stays bindable', () => {
    const catalog = catalogOf([input4], [], [studio]);
    const gone = catalog.sources.find((s) => s.id === 'in-li-1a2b3c4d')!;
    expect(gone).toMatchObject({
      status: 'unavailable',
      departed: true,
      reason: INPUT_GONE_REASON,
    });
    expect(sourceBindable(gone)).toBe(false);
    expect(sourceSeatable(gone)).toBe(false);
  });

  it('bound media become media entries; a missing one is departed', () => {
    const item: BoundMediaItem = {
      id: 'm-26840fa3fd1c409f99f6b53e80a7ca0f',
      name: 'تیتراژ خبر ۲۰',
      clip: 'C:/Apasai CIaB/Engine/bin/engine/data/cache/05554c.mpg',
      type: 'video',
      width: 1920,
      height: 1080,
      durationMs: 20_480,
      folder: 'NEWS',
      lastBoundAt: '2026-09-27T10:00:00Z',
    };
    const [live, gone] = catalogOf(
      [],
      [item, { ...item, id: 'm-gone', unavailable: true }],
    ).sources;
    expect(live).toMatchObject({
      id: 'md-m-26840fa3fd1c409f99f6b53e80a7ca0f',
      origin: 'media',
      producer: { kind: 'media', file: item.clip },
      aspect: 1920 / 1080,
    });
    expect(gone).toMatchObject({
      status: 'unavailable',
      departed: true,
      reason: MEDIA_GONE_REASON,
    });
  });

  it('redacts stream credentials for the console, and only there', () => {
    const catalog = catalogOf([camera]);
    expect(redactCatalogForConsole(catalog).sources[0]?.producer).toEqual({
      kind: 'stream',
      url: 'rtsp://***@10.0.0.21/live',
    });
    expect(catalog.sources[0]?.producer).toEqual(camera.producer);
  });
});

describe('foldPlayoutInputsRead (§1.C)', () => {
  it('moves an input the read no longer lists to departed, and back when it returns', () => {
    const first = foldPlayoutInputsRead(
      { inputs: [], departed: [] },
      { inputs: [studio, camera] },
      't1',
    );
    const second = foldPlayoutInputsRead(first, { inputs: [camera] }, 't2');
    expect(second.inputs.map((i) => i.id)).toEqual(['li-cam']);
    expect(second.departed.map((i) => i.id)).toEqual(['li-1a2b3c4d']);
    expect(second.readAt).toBe('t2');
    const third = foldPlayoutInputsRead(second, { inputs: [camera, studio], epoch: 7 }, 't3');
    expect(third.departed).toEqual([]);
    expect(third.epoch).toBe(7);
  });
});

describe('unseatableWords (§1.C) — one spelling for the bridge and the console', () => {
  it("an input the Playout stopped offering: “Studio 5” is not in the Playout's input list.", () => {
    const gone = {
      name: 'Studio 5',
      origin: 'input',
      status: 'unavailable',
      departed: true,
    } as const;
    expect(unseatableWords(gone)).toEqual({
      name: 'Studio 5',
      rest: " is not in the Playout's input list.",
    });
    expect(unseatableClause(gone)).toBe("“Studio 5” is not in the Playout's input list.");
  });

  it('a media item the Playout stopped offering: “…” is not available in the Playout right now.', () => {
    const gone = {
      name: 'تیتراژ خبر ۲۰',
      origin: 'media',
      status: 'unavailable',
      departed: true,
    } as const;
    expect(unseatableClause(gone)).toBe(
      '“تیتراژ خبر ۲۰” is not available in the Playout right now.',
    );
  });

  it('control: one the Playout still lists but marks unavailable carries ITS reason, not "stopped offering"', () => {
    const marked = {
      name: 'ورودی ۴',
      origin: 'input',
      status: 'unavailable',
      reason: 'no signal',
    } as const;
    expect(unseatableClause(marked)).toBe('“ورودی ۴” is unavailable: no signal');
  });

  it('control: an unusable entry says it cannot be played, with its reason', () => {
    const route = { name: 'ورودی ۳', status: 'unusable', reason: ROUTE_NOT_SUPPORTED_YET } as const;
    expect(unseatableClause(route)).toBe(`“ورودی ۳” cannot be played: ${ROUTE_NOT_SUPPORTED_YET}`);
  });
});
