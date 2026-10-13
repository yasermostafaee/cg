import { describe, expect, it } from 'vitest';
import { CommandBuilder } from '../src/command-builder.js';
import {
  NO_BACKUP_CHANNELS,
  serverBLineFor,
  serverBLineRefusal,
  translateForServerB,
  type BackupChannelMap,
  type ServerBGuardContext,
} from '../src/server-b-line.js';

/**
 * 🔴 `RELEASE-0113-01` (`B-316`) — server B's line: the station's channel N rewritten to B's own M, or
 * nothing. The pair the Playout team builds: B's channel 1 is its OWN programme, the mirror of the station's
 * channel 1 is B's channel 2, of channel 2 B's channel 3; B also has preview channels 4 and 5, and the
 * station's channel 7 has no mirror at all.
 */
const PAIR: Readonly<Record<number, number>> = { 1: 2, 2: 3 };
const map: BackupChannelMap = {
  channelOnB: (n) => PAIR[n] ?? null,
  channelOnBAtTake: (n) => PAIR[n] ?? null,
  stationChannelOf: (m) => {
    const hit = Object.entries(PAIR).find(([, onB]) => onB === m);
    return hit === undefined ? null : Number(hit[0]);
  },
  release: () => undefined,
};
const ctx: ServerBGuardContext = { map, isOwnLayer: () => false };
const b = new CommandBuilder();
const slot = { channel: 1, layer: 80 };
const plate = { channel: 1, layer: 60 };

/** Every line shape the builder emits for the station's channel 1, and what B must get for each. */
const SHAPES: readonly [string, string][] = [
  [b.load(slot, 'http://h/t', { f: 'x' }), 'CG 2-80 ADD'],
  [b.take(slot), 'CG 2-80 PLAY 0'],
  [b.update(slot, { f: 'y' }), 'CG 2-80 UPDATE'],
  [b.stop(slot), 'CG 2-80 STOP 0'],
  [b.next(slot), 'CG 2-80 NEXT 0'],
  [b.info(1), 'INFO 2'],
  [b.out(slot), 'CLEAR 2-80'],
  [b.mixerVolume(plate, 0), 'MIXER 2-60 VOLUME 0'],
  [b.mixerOpacity(plate, 1), 'MIXER 2-60 OPACITY 1'],
  [b.deferMixer(b.mixerVolume(plate, 1, 25)), 'MIXER 2-60 VOLUME 1 25 DEFER'],
  ...b
    .mixerFit(plate, {
      fill: { x: 0.1, y: 0.2, width: 0.5, height: 0.5 },
      clip: { x: 0.1, y: 0.2, width: 0.5, height: 0.5 },
    })
    .map((line): [string, string] => [
      b.deferMixer(line),
      line.slice(0, 18).replace('1-60', '2-60'),
    ]),
  [b.mixerClear(plate), 'MIXER 2-60 CLEAR'],
  [b.mixerCommit(1), 'MIXER 2 COMMIT'],
  [
    b.playSource(plate, { kind: 'media', file: 'Promo/Studio 1.mov' }, { loop: true }),
    'PLAY 2-60 "Promo/Studio 1.mov" LOOP',
  ],
  [b.playSource(plate, { kind: 'decklink', device: 1 }), 'PLAY 2-60 DECKLINK DEVICE 1'],
  [b.playSource(plate, { kind: 'ndi', source: 'MTA (APASAI)' }), 'PLAY 2-60 [NDI] "MTA (APASAI)"'],
  [b.pause(plate), 'PAUSE 2-60'],
  [b.resume(plate), 'RESUME 2-60'],
  [b.seekFrame(plate, 0), 'CALL 2-60 SEEK 0'],
  [b.setLoop(plate, false), 'CALL 2-60 LOOP 0'],
  [b.playLoaded(plate), 'PLAY 2-60'],
];

describe('B-316 — translateForServerB', () => {
  it.each(SHAPES)('`%s` reaches B as `%s…`, every other byte unchanged', (line, starts) => {
    const verdict = translateForServerB(line, map);
    expect(verdict).toHaveProperty('line');
    const onB = (verdict as { line: string }).line;
    expect(onB.startsWith(starts)).toBe(true);
    // Only the channel moved: the station line with its first `1-`/`1 ` written as B's.
    expect(onB).toBe(line.replace(/^(\S+ )1(?=[- ]|$)/, (_m, verb: string) => `${verb}2`));
  });

  it('the station’s channel 2 reaches B’s channel 3 — not B’s 2, which mirrors channel 1', () => {
    expect(translateForServerB('CG 2-80 PLAY 0', map)).toEqual({ line: 'CG 3-80 PLAY 0' });
  });

  it('🔴 a channel with no mirror is refused, naming it — nothing is guessed', () => {
    expect(translateForServerB('CG 7-80 ADD 0 "x" 0 "{}"', map)).toEqual({
      refused: 'backup-unmapped',
      reason: 'no backup channel is known for CH 7',
      channel: 7,
    });
    expect(translateForServerB('CG 1-80 PLAY 0', NO_BACKUP_CHANNELS)).toMatchObject({
      refused: 'backup-unmapped',
    });
  });

  it('🔴 no route:// of any kind reaches B — a Playout route and a hand-made one alike', () => {
    for (const line of [
      b.loadBackground(plate, { kind: 'route', channel: 5, layer: 10 }),
      b.playSource(plate, { kind: 'route', channel: 1, layer: 2 }),
    ]) {
      expect(translateForServerB(line, map)).toMatchObject({ refused: 'backup-route' });
    }
  });

  it('a line naming no channel reaches B as it is', () => {
    for (const line of ['VERSION', 'INFO', 'INFO CONFIG', 'INFO PATHS', 'OSC SUBSCRIBE 6252']) {
      expect(translateForServerB(line, map)).toEqual({ line });
    }
  });

  it('a line of no known shape is refused', () => {
    for (const line of ['SWAP 1-80 2-80', 'ADD 1 SCREEN', 'INFO DELAY 1', 'DATA STORE x "y"']) {
      expect(translateForServerB(line, map)).toMatchObject({ refused: 'backup-guard' });
    }
  });
});

describe('B-316 — serverBLineRefusal, the guard for server B', () => {
  it('🔴 a VERBATIM line — the primary’s number — is refused: B’s channel 1 is no mirror of ours', () => {
    expect(serverBLineRefusal('CG 1-80 ADD 0 "x" 0 "{}"', ctx)).toEqual({
      code: 'backup-guard',
      reason: "server B's channel 1 is not a mirror channel of this station",
    });
    expect(serverBLineFor('CG 1-80 PLAY 0', ctx, { verbatim: true })).toMatchObject({
      refused: 'backup-guard',
    });
    // CONTROL: the same line, translated, passes the same guard.
    expect(serverBLineFor('CG 1-80 PLAY 0', ctx)).toEqual({ line: 'CG 2-80 PLAY 0' });
  });

  it('a preview channel (4, 5) and any unmapped channel are refused', () => {
    for (const line of ['PLAY 4-60 "x"', 'MIXER 5 COMMIT', 'CLEAR 9-80']) {
      expect(serverBLineRefusal(line, ctx)).toMatchObject({ code: 'backup-guard' });
    }
  });

  it('a layer outside 50–99 is refused on B, unless the station configures it', () => {
    expect(serverBLineRefusal('PLAY 2-10 "x"', ctx)).toMatchObject({ code: 'backup-guard' });
    expect(
      serverBLineRefusal('PLAY 2-10 "x"', { map, isOwnLayer: (n, l) => n === 1 && l === 10 }),
    ).toBe(null);
  });

  it('a channel-wide line is only MIXER M COMMIT or INFO M', () => {
    expect(serverBLineRefusal('MIXER 2 COMMIT', ctx)).toBe(null);
    expect(serverBLineRefusal('INFO 2', ctx)).toBe(null);
    for (const line of ['CLEAR 2', 'MIXER 2 CLEAR', 'PLAY 2']) {
      expect(serverBLineRefusal(line, ctx)).toMatchObject({ code: 'backup-guard' });
    }
  });
});
