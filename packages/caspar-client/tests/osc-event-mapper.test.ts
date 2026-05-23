import { describe, expect, it } from 'vitest';
import { messageToEvent } from '../src/osc/event-mapper.js';

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

  it('maps /foreground/file/path', () => {
    expect(
      messageToEvent({
        kind: 'message',
        address: '/channel/1/stage/layer/10/foreground/file/path',
        args: ['file:///x.html'],
      }),
    ).toEqual({
      kind: 'osc.layer.foreground.file',
      channel: 1,
      layer: 10,
      path: 'file:///x.html',
    });
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
