import { describe, expect, it, vi } from 'vitest';
import {
  artworkGroupRemainder,
  remainingArtworkClip,
  routedArtworkFit,
} from '../src/preset-artwork-route.js';
import { nativePresetProducerLayerState } from '../src/preset-fallback-producer.js';
import {
  artworkCommand,
  serverBLineFor,
  serverBLineRefusal,
  type ArtworkCommand,
} from '../src/server-b-line.js';

describe('native plate artwork route', () => {
  it('maps both STING sources and accepts only the exact leased composition on B', () => {
    const black = 'http://192.168.21.32:7911/pages/black.png?plate=1';
    const channelOnB = (channel: number) => (channel === 1 ? 2 : null);
    const ctx = {
      map: {
        channelOnB,
        channelOnBAtTake: channelOnB,
        release: vi.fn(),
        stationChannelOf: (channel: number) => (channel === 2 ? 1 : null),
      },
      isOwnLayer: () => false,
      ownsArtworkCommand: (station: number, cmd: ArtworkCommand) =>
        station === 1 &&
        (cmd.kind === 'sting'
          ? cmd.blackUri === black &&
            cmd.target === 65 &&
            cmd.matteLayer === 64 &&
            cmd.artworkLayer === 62
          : cmd.verb === 'PLAY' &&
            cmd.target === 68 &&
            cmd.source === 65 &&
            cmd.mixFields === 30_000),
    };
    const sting = (c: number) =>
      'PLAY ' + c + '-65 "' + black + '" STING "route://' + c + '-64" 0 "route://' + c + '-62"';
    expect(serverBLineFor(sting(1), ctx)).toEqual({ line: sting(2) });
    expect(serverBLineRefusal(sting(2), ctx)).toBeNull();
    expect(serverBLineFor('PLAY 1-68 "route://1-65" MIX 30000', ctx)).toEqual({
      line: 'PLAY 2-68 "route://2-65" MIX 30000',
    });
    for (const line of [
      sting(1).replace('plate=1', 'plate=2'),
      sting(1).replace('-64"', '-63"'),
      sting(1).replace('route://1-62', 'route://2-62'),
      sting(1) + ' LOOP',
      'PLAY 1-68 "route://1-65" MIX 1',
    ]) {
      expect(serverBLineFor(line, ctx)).toHaveProperty('refused');
    }
    expect(artworkCommand(sting(1) + '\n')).toBeUndefined();
  });
  const source = { x: 0.28, y: 0.51, width: 0.44, height: 0.44 };
  const others = [
    { x: 0.04, y: 0.05, width: 0.44, height: 0.44 },
    { x: 0.52, y: 0.05, width: 0.44, height: 0.44 },
  ];
  it('keeps the original foreground visible on unaffected plates and declines overlapping regions', () => {
    expect(remainingArtworkClip(source, others)).toEqual({ x: 0, y: 0, width: 1, height: 0.51 });
    expect(remainingArtworkClip(source, [...others, { ...source, x: 0.45 }])).toBeUndefined();
  });
  it('parks a nonempty viewport outside the output when every visible plate has its own surface', () => {
    for (const group of [[source], others, [source, ...others]]) {
      const parked = artworkGroupRemainder(group, []);
      expect(parked).toBeDefined();
      expect(parked!.x).toBeGreaterThanOrEqual(1);
      expect(parked!.width).toBeGreaterThan(0);
      expect(parked!.height).toBeGreaterThan(0);
    }
    expect(artworkGroupRemainder([{ ...source, x: -0.01 }, ...others], [])).toBeUndefined();
  });
  it('attaches every artwork pixel to the same interpolated picture through a slide and resize', () => {
    const to = { x: 0.08, y: -0.49, width: 0.5, height: 0.58 };
    const first = routedArtworkFit(source, source)!;
    const last = routedArtworkFit(source, to)!;
    for (const progress of [0, 0.2, 0.4, 0.6, 0.8, 1]) {
      const at = (a: number, b: number) => a + progress * (b - a);
      for (const anchor of [0.03, 0.25, 0.76, 0.97]) {
        for (const [axis, dimension] of [
          ['x', 'width'],
          ['y', 'height'],
        ] as const) {
          const inputPixel = source[axis] + source[dimension] * anchor;
          const screen =
            at(first.fill[axis], last.fill[axis]) +
            inputPixel * at(first.fill[dimension], last.fill[dimension]);
          expect(screen).toBeCloseTo(
            at(source[axis], to[axis]) + at(source[dimension], to[dimension]) * anchor,
            9,
          );
        }
      }
    }
  });
  it('samples only the leased foreground on the mapped engine and verifies the actual INFO source', () => {
    const backup = (n: number) => (n === 1 ? 2 : null);
    const map = {
      channelOnB: backup,
      channelOnBAtTake: backup,
      release: () => undefined,
      stationChannelOf: (n: number) => (n === 2 ? 1 : null),
    };
    const context = {
      map,
      isOwnLayer: () => false,
      ownsArtworkRoute: (n: number, target: number, from: number) =>
        n === 1 && target === 62 && from === 79,
    };
    expect(serverBLineFor('PLAY 1-62 "route://1-79"', context)).toEqual({
      line: 'PLAY 2-62 "route://2-79"',
    });
    for (const raw of [
      'PLAY 1-62 "route://1-5"',
      'PLAY 1-63 "route://1-79"',
      'PLAY 1-62 "route://2-79"',
    ]) {
      expect(serverBLineFor(raw, context)).toHaveProperty('refused');
    }
    const info =
      '<channel><stage><layer><layer_62><background><producer>empty</producer></background><foreground><producer>route</producer><route><channel>2</channel><layer>79</layer></route></foreground></layer_62></layer></stage></channel>';
    expect(
      nativePresetProducerLayerState(info, 62, { kind: 'artwork-route', channel: 2, layer: 79 }),
    ).toBe('native');
    expect(
      nativePresetProducerLayerState(info, 62, { kind: 'artwork-route', channel: 1, layer: 79 }),
    ).toBe('foreign');
  });
});
