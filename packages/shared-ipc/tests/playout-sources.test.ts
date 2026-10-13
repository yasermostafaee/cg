import { describe, expect, it } from 'vitest';
import {
  DUPLICATE_NAME_REASON,
  INPUT_GONE_REASON,
  MEDIA_GONE_REASON,
  OTHER_SERVER_REASON,
  ROUTE_NO_LAYER_REASON,
  buildPlayoutSourceCatalog,
  canonicalPlayoutEpoch,
  foldPlayoutInputsRead,
  isPlayoutRoute,
  isPlaylistOutput,
  notShowableWords,
  PLAYLIST_UNAVAILABLE_WORDS,
  sourceLoopsOn,
  parsePlayoutJson,
  parsePlayoutInputs,
  parsePlayoutMediaPage,
  redactCatalogForConsole,
  redactUrlCredentials,
  sourceBindable,
  sourceSeatable,
  sourceShowableOn,
  unseatableClause,
  unseatableWords,
  boundMediaPlayback,
  toBoundMedia,
  type BoundMediaItem,
  type PlayoutCatalogInput,
  type PlayoutInput,
  type PlayoutMediaItem,
} from '../src/playout-sources.js';
import { MEDIA_PLAYBACK_DEFAULTS, mediaPlaybackOf } from '../src/channels/sources.js';

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

  /*
    `ROUTE-PLATES-01` §1.G — SUPERSEDED: this case pinned `PLAYOUT-SOURCES-01`'s gate (every `route`
    input `unusable`, "Not supported yet."). The gate is gone: a route WITH a layer is an ordinary
    bindable input, seated at the bridge by contract v1.3's rules; its availability is the Playout's
    own flag, and a route with no layer stays unusable (rule 3).
  */
  it('🔴 a route with a layer is bindable (the gate is gone); an unavailable one keeps its reason; one with no layer is unusable (v1.3 rule 3)', () => {
    const noLayer: PlayoutInput = {
      ...input3,
      id: 'li-nolayer',
      name: 'No layer',
      producer: { kind: 'route', channel: 9 },
    };
    const [three, four, bare] = catalogOf([input3, input4, noLayer]).sources;
    expect(three).toMatchObject({
      origin: 'input',
      producer: { kind: 'route', channel: 9, layer: 12 },
      channels: [1, 2],
    });
    expect(three?.status).toBeUndefined();
    expect(sourceBindable(three!)).toBe(true);
    expect(sourceSeatable(three!)).toBe(true);
    expect(four).toMatchObject({ status: 'unavailable', reason: 'no signal', channels: [1] });
    expect(sourceSeatable(four!)).toBe(false);
    expect(bare).toMatchObject({ status: 'unusable', reason: ROUTE_NO_LAYER_REASON });
    expect(sourceBindable(bare!)).toBe(false);
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

  it('🔴 `MEDIA-PLATES-01` — a clip’s two settings ride its entry; one without them reads as the defaults', () => {
    const base: BoundMediaItem = {
      id: 'm-promo',
      name: 'پرومو',
      clip: 'C:/Media/promo.mp4',
      type: 'video',
      lastBoundAt: '2026-09-28T08:00:00Z',
    };
    const [set, legacy] = catalogOf(
      [],
      [
        { ...base, loop: true, whenHidden: 'continue' },
        { ...base, id: 'm-legacy' },
      ],
    ).sources;
    expect(set?.media).toMatchObject({ loop: true, whenHidden: 'continue' });
    expect(mediaPlaybackOf(set ?? { media: undefined })).toEqual({
      loop: true,
      whenHidden: 'continue',
    });
    // Control: a reference persisted before the settings existed carries neither, and the ONE
    // reader answers the defaults for it — no other place spells them.
    expect(legacy?.media).not.toHaveProperty('loop');
    expect(legacy?.media).not.toHaveProperty('whenHidden');
    expect(mediaPlaybackOf(legacy ?? { media: undefined })).toEqual(MEDIA_PLAYBACK_DEFAULTS);
    expect(MEDIA_PLAYBACK_DEFAULTS).toEqual({ loop: false, whenHidden: 'pause' });
  });

  it('🔴 `MEDIA-PLATES-01` — a NEW reference is written with the defaults; a re-read keeps what the station set', () => {
    const read: PlayoutMediaItem = {
      id: 'm-promo',
      name: 'پرومو',
      clip: 'C:/Media/promo.mp4',
      type: 'video',
      durationMs: 30_000,
    };
    const bound = toBoundMedia(read, '2026-09-28T08:00:00Z');
    expect(bound).toMatchObject({ loop: false, whenHidden: 'pause' });
    const set: BoundMediaItem = { ...bound, loop: true, whenHidden: 'restart' };
    // The Playout moved the clip: the re-read refreshes the PATH and keeps the settings.
    const moved = toBoundMedia(
      { ...read, clip: 'C:/Cache/promo.mpg' },
      set.lastBoundAt,
      boundMediaPlayback(set),
    );
    expect(moved).toMatchObject({ clip: 'C:/Cache/promo.mpg', loop: true, whenHidden: 'restart' });
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
    const route = { name: 'No layer', status: 'unusable', reason: ROUTE_NO_LAYER_REASON } as const;
    expect(unseatableClause(route)).toBe(`“No layer” cannot be played: ${ROUTE_NO_LAYER_REASON}`);
  });
});

describe('`ROUTE-PLATES-01` — the epoch, the route predicate, and rule 1', () => {
  const EPOCH = '638954123456789013';

  it('🔴 a 64-bit epoch survives the parse digit for digit — and plain `JSON.parse` does not (the control)', () => {
    const text = `{"epoch":${EPOCH},"inputs":[]}`;
    // The instrument is live: the loss is real on this runtime.
    expect(String((JSON.parse(text) as { epoch: number }).epoch)).not.toBe(EPOCH);
    expect((parsePlayoutJson(text) as { epoch: unknown }).epoch).toBe(EPOCH);
    expect(parsePlayoutInputs(parsePlayoutJson(text))?.epoch).toBe(EPOCH);
  });

  it('🔴 two consecutive epochs past 2^53 stay DIFFERENT through the parse', () => {
    const next = '638954123456789014';
    const a = parsePlayoutJson(`{"epoch":${EPOCH},"inputs":[]}`) as { epoch: unknown };
    const b = parsePlayoutJson(`{"epoch":${next},"inputs":[]}`) as { epoch: unknown };
    expect(a.epoch).not.toBe(b.epoch);
    // …which is exactly what `JSON.parse` could not tell apart.
    expect(JSON.parse(`{"e":${EPOCH}}`)).toEqual(JSON.parse(`{"e":${next}}`));
  });

  it('control: everything else in the body parses as JSON always did', () => {
    const body = parsePlayoutJson(
      '{"epoch":7,"inputs":[{"id":"li-a","name":"A","aspect":1.7778}]}',
    );
    expect(body).toEqual({ epoch: '7', inputs: [{ id: 'li-a', name: 'A', aspect: 1.7778 }] });
  });

  it('the one spelling: a number is its digits, a string itself trimmed, and empty is none', () => {
    expect(canonicalPlayoutEpoch(42)).toBe('42');
    expect(canonicalPlayoutEpoch(' epoch-2 ')).toBe('epoch-2');
    expect(canonicalPlayoutEpoch(EPOCH)).toBe(EPOCH);
    expect(canonicalPlayoutEpoch('  ')).toBeUndefined();
    expect(canonicalPlayoutEpoch(undefined)).toBeUndefined();
  });

  it('🔴 a PLAYOUT route is an input whose producer is a route; a hand-made route is not', () => {
    expect(isPlayoutRoute({ origin: 'input', producer: { kind: 'route' } })).toBe(true);
    expect(isPlayoutRoute({ producer: { kind: 'route' } })).toBe(false);
    expect(isPlayoutRoute({ origin: 'input', producer: { kind: 'ndi' } })).toBe(false);
  });

  it('🔴 rule 1: a Playout route only on a channel it names — none named is none; every other entry as before', () => {
    const [three] = catalogOf([input3]).sources;
    expect(sourceShowableOn(three!, 2)).toBe(true);
    expect(sourceShowableOn(three!, 3)).toBe(false);
    const unnamed = structuredClone(three!);
    delete unnamed.channels;
    expect(sourceShowableOn(unnamed, 2)).toBe(false);
    // Control: a hand-made route and a D10 stream with no channels named go anywhere, as before.
    const handMade = {
      id: 'src-pip',
      name: 'PiP',
      producer: { kind: 'route' as const, channel: 2 },
    };
    expect(sourceShowableOn(handMade, 1)).toBe(true);
    const [cam] = catalogOf([camera]).sources;
    expect(sourceShowableOn(cam!, 2)).toBe(true);
  });

  it('the clause names the entry apart from the words, for the console to isolate', () => {
    expect(notShowableWords('ورودی ۴', 2)).toEqual({
      name: 'ورودی ۴',
      rest: " can't be shown on CH 2.",
    });
  });
});

/**
 * `PLAYOUT-FEATURES-01` B and C — D10's `ownOutputOf` (`2.9.1`) and the playlist output's row (`2.9.2`),
 * through the one builder.
 */
describe('PLAYOUT-FEATURES-01 — `ownOutputOf` and the playlist output', () => {
  const ndiOwn = (channel: number, host = '127.0.0.1'): PlayoutInput => ({
    ...studio,
    id: `li-own${String(channel)}`,
    name: `Own ${String(channel)}`,
    ownOutputOf: { casparHost: host, casparChannel: channel },
  });
  const playlist = (over: Partial<PlayoutInput> = {}): PlayoutInput => ({
    id: 'pl-apasai',
    name: 'خروجیِ پخش: آپاسای',
    casparHost: '127.0.0.1',
    producer: { kind: 'route', channel: 1, layer: 7, videoMode: '1080i5000' },
    compatibleChannels: [
      { casparHost: '127.0.0.1', casparChannel: 1 },
      { casparHost: '127.0.0.1', casparChannel: 2 },
    ],
    available: true,
    playlistOf: { casparHost: '127.0.0.1', casparChannel: 1 },
    ...over,
  });

  it('B — `ownOutputOf` joins OUR channel by D4’s rule; one naming none of ours loops nowhere; absent is absent', () => {
    const c = catalogOf([ndiOwn(2), ndiOwn(1, '192.0.2.99'), studio]);
    const by = (id: string) => c.sources.find((s) => s.id === `in-${id}`);
    expect(by('li-own2')?.ownOutputOf).toBe(2);
    expect(sourceLoopsOn(by('li-own2') ?? {}, 2)).toBe(true);
    expect(sourceLoopsOn(by('li-own2') ?? {}, 1)).toBe(false);
    // Another machine's channel 1 is not ours: nothing is marked.
    expect(by('li-own1')?.ownOutputOf).toBeUndefined();
    // No mark: unknown, never guessed — it loops nowhere.
    expect(by('li-1a2b3c4d')?.ownOutputOf).toBeUndefined();
    expect(sourceLoopsOn(by('li-1a2b3c4d') ?? {}, 1)).toBe(false);
  });

  it('C — the playlist row keeps the Playout’s own channel (even one this station does not declare) and its layer', () => {
    const c = catalogOf([playlist({ playlistOf: { casparHost: '127.0.0.1', casparChannel: 5 } })]);
    const entry = c.sources[0];
    expect(entry?.playlistOf).toBe(5);
    expect(entry?.producer).toMatchObject({ kind: 'route', channel: 1, layer: 7 });
    expect(isPlaylistOutput(entry ?? {})).toBe(true);
    // CONTROL — a camera route is not a playlist output.
    expect(isPlaylistOutput(catalogOf([input3]).sources[0] ?? {})).toBe(false);
  });

  it('C — a `pl-` row that lost `playlistOf` to a malformed value is STILL locked, by its id', () => {
    const c = catalogOf([playlist({ playlistOf: undefined })]);
    expect(c.sources[0]?.playlistOf).toBe(1);
  });

  it('C — `available: false` reads in words: `unlicensed` says the Playout clears the channel; an unknown code is shown as it came', () => {
    const unlicensed = catalogOf([playlist({ available: false, reason: 'unlicensed' })]).sources[0];
    expect(unlicensed).toMatchObject({ status: 'unavailable' });
    expect(unlicensed?.reason).toBe(PLAYLIST_UNAVAILABLE_WORDS.get('unlicensed'));
    expect(unlicensed?.reason).toMatch(/clears that channel/);
    const odd = catalogOf([playlist({ available: false, reason: 'constructor' })]).sources[0];
    expect(odd?.reason).toBe('constructor');
    // CONTROL — a camera route's reason is the Playout's own, untouched.
    expect(catalogOf([input4]).sources[0]?.reason).toBe('no signal');
  });
});
