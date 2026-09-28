import { describe, expect, it } from 'vitest';
import { messageToEvent } from '../src/osc/event-mapper.js';
import { OscClipTimeTap } from '../src/osc/clip-time-tap.js';
import { OscInterestFilter } from '../src/osc/interest.js';

/**
 * `MEDIA-PLATES-01` — a media clip's clock from OSC: `foreground/file/time` (elapsed, length —
 * seconds, as 2.5.0's `av_producer.cpp` sends it) mapped to one event, read by a passive tap, and
 * never dispatched into the event stream.
 */

const TIME = '/channel/1/stage/layer/60/foreground/file/time';

describe('the mapper', () => {
  it('maps `file/time` to (elapsed, total) — floats or ints', () => {
    expect(messageToEvent({ address: TIME, args: [3.25, 30] })).toEqual({
      kind: 'osc.layer.foreground.time',
      channel: 1,
      layer: 60,
      elapsed: 3.25,
      total: 30,
    });
  });

  it('control: a `file/time` without both numbers is not this address', () => {
    expect(messageToEvent({ address: TIME, args: [3.25] })).toBeNull();
    expect(messageToEvent({ address: TIME, args: ['3', 30] })).toBeNull();
    expect(messageToEvent({ address: TIME, args: [-1, 30] })).toBeNull();
  });
});

describe('the tap', () => {
  it('🔴 keeps the last reported clock with the reported pause, and answers only while fresh', () => {
    const tap = new OscClipTimeTap();
    tap.note(
      { kind: 'osc.layer.foreground.time', channel: 1, layer: 60, elapsed: 4, total: 30 },
      1_000,
    );
    tap.note({ kind: 'osc.layer.foreground.paused', channel: 1, layer: 60, paused: true }, 1_010);
    expect(tap.read(1, 60, 500, 1_100)).toEqual({ elapsed: 4, total: 30, paused: true, at: 1_000 });
    // No evidence past the window: `null`, never a guess.
    expect(tap.read(1, 60, 500, 2_000)).toBeNull();
    expect(tap.read(1, 61, 500, 1_100)).toBeNull();
  });

  it('🔴 forgets a layer once its producer is anything but a clip, and everything on reset', () => {
    const tap = new OscClipTimeTap();
    tap.note(
      { kind: 'osc.layer.foreground.time', channel: 1, layer: 60, elapsed: 4, total: 30 },
      1_000,
    );
    tap.note(
      { kind: 'osc.layer.foreground.producer', channel: 1, layer: 60, producer: 'ffmpeg' },
      1_001,
    );
    expect(tap.read(1, 60, 500, 1_100)).not.toBeNull();
    tap.note(
      { kind: 'osc.layer.foreground.producer', channel: 1, layer: 60, producer: 'empty' },
      1_002,
    );
    expect(tap.read(1, 60, 500, 1_100)).toBeNull();
    tap.note(
      { kind: 'osc.layer.foreground.time', channel: 1, layer: 61, elapsed: 1, total: 9 },
      1_000,
    );
    tap.reset();
    expect(tap.read(1, 61, 500, 1_100)).toBeNull();
  });
});

describe('the stream', () => {
  it('🔴 a clip clock is never dispatched, and is not counted as dropped; control: a producer event of a layer in interest is', () => {
    const filter = new OscInterestFilter();
    filter.add(1, 60);
    expect(
      filter.shouldEmit({
        kind: 'osc.layer.foreground.time',
        channel: 1,
        layer: 60,
        elapsed: 1,
        total: 2,
      }),
    ).toBe(false);
    expect(filter.droppedCount).toBe(0);
    expect(
      filter.shouldEmit({
        kind: 'osc.layer.foreground.producer',
        channel: 1,
        layer: 60,
        producer: 'ffmpeg',
      }),
    ).toBe(true);
  });
});
