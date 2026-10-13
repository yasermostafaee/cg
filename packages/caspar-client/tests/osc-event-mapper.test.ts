import { describe, expect, it } from 'vitest';
import { messageToEvent, oscProducerKind } from '../src/osc/event-mapper.js';

describe('messageToEvent', () => {
  it('maps /framerate to osc.framerate', () => {
    expect(
      messageToEvent({ kind: 'message', address: '/channel/1/framerate', args: [50, 1] }),
    ).toEqual({ kind: 'osc.framerate', channel: 1, num: 50, den: 1 });
  });

  it('drops /framerate with a non-positive numerator', () => {
    expect(
      messageToEvent({ kind: 'message', address: '/channel/1/framerate', args: [0, 1] }),
    ).toBeNull();
  });

  it('maps /foreground/producer', () => {
    expect(
      messageToEvent({
        kind: 'message',
        address: '/channel/1/stage/layer/10/foreground/producer',
        args: ['html'],
      }),
    ).toEqual({
      kind: 'osc.layer.foreground.producer',
      channel: 1,
      layer: 10,
      producer: 'html',
    });
  });

  it('maps /foreground/file/path — the FACT of a file event, never its path (`PLAYOUT-SOURCES-01` §1.E)', () => {
    /*
      Contract v1.3 §3.3: the core sends every AMCP client the full state, input addresses WITH
      CREDENTIALS included. The path is dropped at this one door, so it can be logged, stored,
      published or shown nowhere downstream.
    */
    expect(
      messageToEvent({
        kind: 'message',
        address: '/channel/1/stage/layer/10/foreground/file/path',
        args: ['rtsp://u:p@10.0.0.21/live'],
      }),
    ).toEqual({
      kind: 'osc.layer.foreground.file',
      channel: 1,
      layer: 10,
      path: '',
    });
    // Control: a malformed arg is still dropped entirely, as before.
    expect(
      messageToEvent({
        kind: 'message',
        address: '/channel/1/stage/layer/10/foreground/file/path',
        args: [7],
      }),
    ).toBeNull();
  });

  it('`PLAYOUT-SOURCES-01` §1.E — a producer value reduces to its KIND, never where it reads from', () => {
    const producer = (value: string): unknown =>
      messageToEvent({
        kind: 'message',
        address: '/channel/1/stage/layer/10/foreground/producer',
        args: [value],
      });
    expect(producer('rtsp://u:p@10.0.0.21/live')).toMatchObject({ producer: 'rtsp' });
    expect(JSON.stringify(producer('ffmpeg[rtsp://u:p@10.0.0.21/live]'))).not.toContain('u:p');
    // Control: the kind names CasparCG reports pass through unchanged — the fact still reaches.
    for (const kind of ['html', 'ffmpeg', 'route', 'empty', 'decklink']) {
      expect(producer(kind)).toMatchObject({ producer: kind });
    }
    expect(oscProducerKind('  html ')).toBe('html');
  });

  it('maps /foreground/paused with a boolean arg', () => {
    expect(
      messageToEvent({
        kind: 'message',
        address: '/channel/1/stage/layer/10/foreground/paused',
        args: [false],
      }),
    ).toEqual({ kind: 'osc.layer.foreground.paused', channel: 1, layer: 10, paused: false });
  });

  it('maps /foreground/paused with a 0/1 numeric arg (CasparCG quirk)', () => {
    expect(
      messageToEvent({
        kind: 'message',
        address: '/channel/1/stage/layer/10/foreground/paused',
        args: [1],
      }),
    ).toEqual({ kind: 'osc.layer.foreground.paused', channel: 1, layer: 10, paused: true });
  });

  it('maps /background/producer', () => {
    expect(
      messageToEvent({
        kind: 'message',
        address: '/channel/1/stage/layer/10/background/producer',
        args: ['empty'],
      }),
    ).toEqual({
      kind: 'osc.layer.background.producer',
      channel: 1,
      layer: 10,
      producer: 'empty',
    });
  });

  it('drops unknown addresses', () => {
    expect(
      messageToEvent({
        kind: 'message',
        address: '/channel/1/mixer/audio/volume',
        args: [0, 0, 0, 0, 0, 0, 0, 0],
      }),
    ).toBeNull();
  });

  it('drops a malformed message', () => {
    expect(
      messageToEvent({
        kind: 'message',
        address: '/channel/1/framerate',
        args: [],
        malformed: 'whatever',
      }),
    ).toBeNull();
  });

  it('drops a producer message with a non-string arg', () => {
    expect(
      messageToEvent({
        kind: 'message',
        address: '/channel/1/stage/layer/10/foreground/producer',
        args: [42],
      }),
    ).toBeNull();
  });

  it('drops a paused message with an unrecognized arg', () => {
    expect(
      messageToEvent({
        kind: 'message',
        address: '/channel/1/stage/layer/10/foreground/paused',
        args: ['maybe'],
      }),
    ).toBeNull();
  });
});
