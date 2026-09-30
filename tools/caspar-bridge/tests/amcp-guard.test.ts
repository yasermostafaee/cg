import { describe, expect, it } from 'vitest';
import { amcpLineRefusal, type AmcpGuardContext } from '../src/amcp-guard.js';

/**
 * `ROUTE-PLATES-01` §1.E / §2 — the send-seam guard, line by line: every forbidden form refused, each
 * beside the control that passes. Channel 2 is a declared programme channel, channel 9 the fake
 * Playout's holder channel (never declared), and 2-61 holds a seated plate.
 */
const context: AmcpGuardContext = {
  isDeclaredChannel: (channel) => channel === 1 || channel === 2,
  seatedPlateOn: (channel, layer) => channel === 2 && layer === 61,
};
const refused = (line: string): string | undefined => amcpLineRefusal(line, context)?.code;

describe('forbidden commands on a programme channel (C5)', () => {
  it.each([
    ['CLEAR 2', 'amcp-guard-forbidden'],
    ['MIXER 2 CLEAR', 'amcp-guard-forbidden'],
    ['SWAP 2-60 1-60', 'amcp-guard-forbidden'],
    ['SET 2 MODE 1080i5000', 'amcp-guard-forbidden'],
    ['ADD 2 DECKLINK 1', 'amcp-guard-forbidden'],
    ['REMOVE 2 DECKLINK 1', 'amcp-guard-forbidden'],
    ['CLEAR 2-5', 'amcp-guard-layer'],
    ['CLEAR 2-49', 'amcp-guard-layer'],
    ['CLEAR 2-100', 'amcp-guard-layer'],
    ['MIXER 2-61 CLEAR', 'amcp-guard-forbidden'],
    ['CLEAR ALL', 'amcp-guard-global'],
    ['CHANNEL_GRID', 'amcp-guard-global'],
  ])('%s is refused', (line, code) => {
    expect(refused(line)).toBe(code);
  });

  it.each([
    'CLEAR 2-60',
    'CLEAR 2-50',
    'CLEAR 2-99',
    'MIXER 2-60 CLEAR',
    'MIXER 2 COMMIT',
    'MIXER 2-60 OPACITY 0 DEFER',
    'CG 2-80 ADD 0 "http://127.0.0.1:7911/template/t" 0 "{}"',
    'CG 2-80 REMOVE 0',
    'PLAY 2-60 "route://9-12"',
    'LOADBG 2-60 "route://9-12"',
    'PLAY 2-60',
    'INFO 2',
    'INFO',
    'VERSION',
  ])('%s passes (the control)', (line) => {
    expect(refused(line)).toBeUndefined();
  });
});

describe('reserved channels (rule 3)', () => {
  it.each([
    'PLAY 9-12 "route://9-12"',
    'LOADBG 9-12 "route://1-10"',
    'CLEAR 9-60',
    'MIXER 9-60 VOLUME 0',
    'CALL 9-12 SEEK 0',
    'STOP 9-12',
    'PAUSE 9-12',
    'CG 9-80 ADD 0 "t" 0 "{}"',
  ])('%s — a command targeting the holder channel — is refused', (line) => {
    expect(refused(line)).toBe('amcp-guard-channel');
  });

  it('channel 2 passes the same verbs (the control)', () => {
    for (const line of ['CLEAR 2-60', 'MIXER 2-60 VOLUME 0', 'CALL 2-60 SEEK 0', 'STOP 2-60']) {
      expect(refused(line), line).toBeUndefined();
    }
  });
});

describe('a Playout route with no layer (rule 3)', () => {
  const playout = (line: string): string | undefined =>
    amcpLineRefusal(line, { ...context, playoutRoute: true })?.code;

  it('is refused on a PLAY and a LOADBG', () => {
    expect(playout('PLAY 2-60 "route://9"')).toBe('amcp-guard-route-layer');
    expect(playout('LOADBG 2-60 "route://9"')).toBe('amcp-guard-route-layer');
  });

  it('a Playout route with a layer passes (the control)', () => {
    expect(playout('PLAY 2-60 "route://9-12"')).toBeUndefined();
    expect(playout('LOADBG 2-60 "route://9-12"')).toBeUndefined();
  });

  it('🔴 a HAND-MADE route keeps its wire: `route://2` names a programme channel, not a holder', () => {
    // The hard stop: byte-identical for every plate not bound to a D10 input.
    expect(refused('PLAY 1-60 "route://2"')).toBeUndefined();
  });
});

describe('a CLEAR outside 50–99 on a layer the station itself declares', () => {
  const own = (line: string): string | undefined =>
    amcpLineRefusal(line, {
      ...context,
      isOwnLayer: (channel, layer) => channel === 2 && layer === 10,
    })?.code;

  it('passes: a configuration built past the boot keeps its wire', () => {
    expect(own('CLEAR 2-10')).toBeUndefined();
  });

  it('🔴 every other layer below 50 is still refused (the control)', () => {
    expect(own('CLEAR 2-11')).toBe('amcp-guard-layer');
    expect(own('CLEAR 2-5')).toBe('amcp-guard-layer');
    expect(own('CLEAR 1-10')).toBe('amcp-guard-layer');
  });
});

describe('`MEDIA-PLATES-01` — `PAUSE`, `RESUME` and `CALL` reach only a seated clip of ours', () => {
  /** A clip is seated on 2-61; 2-60 carries a live input (a route, say). */
  const clips = (line: string): string | undefined =>
    amcpLineRefusal(line, {
      ...context,
      clipOn: (channel, layer) => channel === 2 && layer === 61,
    })?.code;

  it('🔴 each is refused on a coordinate that holds no clip — a route is never paused, and a CALL to a live producer hangs the core', () => {
    expect(clips('PAUSE 2-60')).toBe('amcp-guard-not-a-clip');
    expect(clips('RESUME 2-60')).toBe('amcp-guard-not-a-clip');
    expect(clips('CALL 2-60 SEEK 0')).toBe('amcp-guard-not-a-clip');
    expect(clips('CALL 2-60 LOOP 1')).toBe('amcp-guard-not-a-clip');
    // …and never channel-wide.
    expect(clips('PAUSE 2')).toBe('amcp-guard-not-a-clip');
  });

  it('control: each passes on the clip’s own coordinate', () => {
    expect(clips('PAUSE 2-61')).toBeUndefined();
    expect(clips('RESUME 2-61')).toBeUndefined();
    expect(clips('CALL 2-61 SEEK 0')).toBeUndefined();
    expect(clips('CALL 2-61 LOOP 0')).toBeUndefined();
  });

  it('control: a context with no ledger does not ask (and the channel fence still does)', () => {
    expect(refused('PAUSE 2-60')).toBeUndefined();
    expect(refused('PAUSE 9-60')).toBe('amcp-guard-channel');
  });
});

/**
 * `PLAYOUT-FEATURES-01` C (`design.md` §0.1) — ONLY OUR OWN LAYERS FOR EVERY VERB; never the Playout's playout
 * layer L; never a route's NEXT/BACKGROUND/BUFFER; never a VOLUME above 0 on the playlist box. Before this,
 * `PLAY`, `STOP` and `MIXER` to a layer below 50 were NOT refused — the first three cases below were red.
 */
describe('PLAYOUT-FEATURES-01 C — the playlist output’s rules at the seam', () => {
  const withPlaylist: AmcpGuardContext = {
    ...context,
    // The Playout's playout layer on channel 2 is 7 (D10); the station's own config claims 7 too, and
    // loses: no configuration makes their playlist's layer ours.
    isOwnLayer: (channel, layer) => channel === 2 && layer === 7,
    playoutLayerOn: (channel, layer) => channel === 2 && layer === 7,
    audioLockedOn: (channel, layer) => channel === 2 && layer === 60,
  };
  const why = (line: string, ctx: AmcpGuardContext = context): string | undefined =>
    amcpLineRefusal(line, ctx)?.code;

  it.each([
    ['PLAY 2-5 "x"', 'amcp-guard-layer'],
    ['STOP 2-5', 'amcp-guard-layer'],
    ['MIXER 2-5 VOLUME 1', 'amcp-guard-layer'],
    ['LOADBG 2-49 "x"', 'amcp-guard-layer'],
    ['CG 2-100 ADD 0 "t" 0 "{}"', 'amcp-guard-layer'],
    ['CALL 2-3 SEEK 0', 'amcp-guard-layer'],
  ])('%s — any verb outside 50–99 the station does not own — is refused', (line, code) => {
    expect(why(line)).toBe(code);
  });

  it.each(['MIXER 2-7 VOLUME 1', 'PLAY 2-7 "x"', 'STOP 2-7', 'CLEAR 2-7', 'MIXER 2-7 OPACITY 0'])(
    '%s — the Playout’s playout layer — is refused even though the config claims it',
    (line) => {
      expect(why(line, withPlaylist)).toBe('amcp-guard-playout-layer');
    },
  );

  it.each([
    'LOADBG 2-60 "route://2-7" BUFFER 2',
    'LOADBG 2-60 "route://2-7" NEXT',
    'PLAY 2-60 "route://2-7" BACKGROUND',
  ])('%s — a route’s preloaded or buffered form — is refused on a Playout route line', (line) => {
    expect(amcpLineRefusal(line, { ...withPlaylist, playoutRoute: true })?.code).toBe(
      'amcp-guard-route-form',
    );
  });

  it.each(['MIXER 2-60 VOLUME 1', 'MIXER 2-60 VOLUME 0.8 25 DEFER'])(
    '%s — a raise of the playlist box — is refused',
    (line) => {
      expect(why(line, withPlaylist)).toBe('amcp-guard-audio-locked');
    },
  );

  it.each([
    'MIXER 2-60 VOLUME 0',
    'MIXER 2-60 VOLUME',
    'MIXER 2-61 VOLUME 1 25',
    'LOADBG 2-60 "route://2-7"',
    'PLAY 2-60',
    'PLAY 2-60 "x"',
    'MIXER 2 COMMIT',
    'INFO 2',
  ])('control: %s passes', (line) => {
    expect(amcpLineRefusal(line, { ...withPlaylist, playoutRoute: line.includes('route') })).toBe(
      null,
    );
  });

  it('control: a layer below 50 the station’s config declares (a legacy bank row) passes for every verb', () => {
    const legacy: AmcpGuardContext = { ...context, isOwnLayer: (c, l) => c === 2 && l === 20 };
    for (const line of ['PLAY 2-20 "x"', 'STOP 2-20', 'MIXER 2-20 VOLUME 1', 'CLEAR 2-20']) {
      expect(amcpLineRefusal(line, legacy), line).toBe(null);
    }
  });
});
