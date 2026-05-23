import { describe, expect, it } from 'vitest';
import { OscInterestFilter } from '../src/osc/interest.js';

describe('OscInterestFilter', () => {
  it('drops layer events for unallocated slots', () => {
    const f = new OscInterestFilter();
    expect(
      f.shouldEmit({
        kind: 'osc.layer.foreground.producer',
        channel: 1,
        layer: 10,
        producer: 'html',
      }),
    ).toBe(false);
    expect(f.droppedCount).toBe(1);
  });

  it('admits layer events once the slot is added', () => {
    const f = new OscInterestFilter();
    f.add(1, 10);
    expect(
      f.shouldEmit({
        kind: 'osc.layer.foreground.producer',
        channel: 1,
        layer: 10,
        producer: 'html',
      }),
    ).toBe(true);
    expect(f.droppedCount).toBe(0);
  });

  it('emits framerate events when ANY layer on the channel is allocated', () => {
    const f = new OscInterestFilter();
    f.add(1, 10);
    expect(f.shouldEmit({ kind: 'osc.framerate', channel: 1, num: 50, den: 1 })).toBe(true);
    expect(f.shouldEmit({ kind: 'osc.framerate', channel: 2, num: 50, den: 1 })).toBe(false);
  });

  it('always admits synthetic health events', () => {
    const f = new OscInterestFilter();
    expect(
      f.shouldEmit({ kind: 'osc.health', server: 'primary', healthy: true, uptimeSec: 0 }),
    ).toBe(true);
  });

  it('remove() reverts a slot to out-of-interest', () => {
    const f = new OscInterestFilter();
    f.add(1, 10);
    f.remove(1, 10);
    expect(f.isAllocated(1, 10)).toBe(false);
    expect(
      f.shouldEmit({
        kind: 'osc.layer.foreground.producer',
        channel: 1,
        layer: 10,
        producer: 'html',
      }),
    ).toBe(false);
  });

  it('clear() removes every slot', () => {
    const f = new OscInterestFilter();
    f.add(1, 10);
    f.add(1, 11);
    f.clear();
    expect(f.isAllocated(1, 10)).toBe(false);
    expect(f.channelHasInterest(1)).toBe(false);
  });

  it('resetDroppedCount() zeroes the counter without affecting the set', () => {
    const f = new OscInterestFilter();
    f.shouldEmit({
      kind: 'osc.layer.foreground.producer',
      channel: 1,
      layer: 10,
      producer: 'html',
    });
    expect(f.droppedCount).toBe(1);
    f.resetDroppedCount();
    expect(f.droppedCount).toBe(0);
  });
});
