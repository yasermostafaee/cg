import { describe, expect, it } from 'vitest';
import { OscChangeTracker } from '../src/osc/change-tracker.js';

describe('OscChangeTracker', () => {
  it('emits the first observation', () => {
    const t = new OscChangeTracker();
    expect(
      t.shouldEmit({
        kind: 'osc.layer.foreground.producer',
        channel: 1,
        layer: 10,
        producer: 'html',
      }),
    ).toBe(true);
  });

  it('suppresses identical repeats', () => {
    const t = new OscChangeTracker();
    const ev = {
      kind: 'osc.layer.foreground.producer' as const,
      channel: 1,
      layer: 10,
      producer: 'html',
    };
    expect(t.shouldEmit(ev)).toBe(true);
    expect(t.shouldEmit(ev)).toBe(false);
    expect(t.shouldEmit(ev)).toBe(false);
  });

  it('emits again when the value changes', () => {
    const t = new OscChangeTracker();
    t.shouldEmit({
      kind: 'osc.layer.foreground.producer',
      channel: 1,
      layer: 10,
      producer: 'html',
    });
    expect(
      t.shouldEmit({
        kind: 'osc.layer.foreground.producer',
        channel: 1,
        layer: 10,
        producer: 'empty',
      }),
    ).toBe(true);
  });

  it('treats different layers as different keys', () => {
    const t = new OscChangeTracker();
    t.shouldEmit({
      kind: 'osc.layer.foreground.producer',
      channel: 1,
      layer: 10,
      producer: 'html',
    });
    expect(
      t.shouldEmit({
        kind: 'osc.layer.foreground.producer',
        channel: 1,
        layer: 11,
        producer: 'html',
      }),
    ).toBe(true);
  });

  it('treats different event kinds as different keys', () => {
    const t = new OscChangeTracker();
    t.shouldEmit({
      kind: 'osc.layer.foreground.producer',
      channel: 1,
      layer: 10,
      producer: 'html',
    });
    expect(
      t.shouldEmit({
        kind: 'osc.layer.background.producer',
        channel: 1,
        layer: 10,
        producer: 'html',
      }),
    ).toBe(true);
  });

  it('handles framerate changes', () => {
    const t = new OscChangeTracker();
    expect(t.shouldEmit({ kind: 'osc.framerate', channel: 1, num: 50, den: 1 })).toBe(true);
    expect(t.shouldEmit({ kind: 'osc.framerate', channel: 1, num: 50, den: 1 })).toBe(false);
    expect(t.shouldEmit({ kind: 'osc.framerate', channel: 1, num: 60, den: 1 })).toBe(true);
  });

  it('handles paused/path/health change events', () => {
    const t = new OscChangeTracker();
    expect(
      t.shouldEmit({
        kind: 'osc.layer.foreground.paused',
        channel: 1,
        layer: 10,
        paused: false,
      }),
    ).toBe(true);
    expect(
      t.shouldEmit({
        kind: 'osc.layer.foreground.paused',
        channel: 1,
        layer: 10,
        paused: false,
      }),
    ).toBe(false);
    expect(
      t.shouldEmit({
        kind: 'osc.layer.foreground.file',
        channel: 1,
        layer: 10,
        path: 'file:///a.html',
      }),
    ).toBe(true);
    expect(
      t.shouldEmit({ kind: 'osc.health', server: 'primary', healthy: true, uptimeSec: 10 }),
    ).toBe(true);
    expect(
      t.shouldEmit({ kind: 'osc.health', server: 'primary', healthy: true, uptimeSec: 10 }),
    ).toBe(false);
  });

  it('reset() clears all tracked values', () => {
    const t = new OscChangeTracker();
    const ev = {
      kind: 'osc.layer.foreground.producer' as const,
      channel: 1,
      layer: 10,
      producer: 'html',
    };
    t.shouldEmit(ev);
    t.reset();
    expect(t.shouldEmit(ev)).toBe(true);
  });
});
