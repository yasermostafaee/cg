import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LAYER_POLICY,
  LayerManager,
  OutOfLayersError,
  UnknownTemplateTypeError,
} from '../src/index.js';

describe('LayerManager', () => {
  it('allocates the lowest free layer in the policy range', () => {
    const lm = new LayerManager();
    const a = lm.allocate('lower-third', 1);
    expect(a).toEqual({ channel: 1, layer: 10 });
    const b = lm.allocate('lower-third', 1);
    expect(b).toEqual({ channel: 1, layer: 11 });
  });

  it('respects per-templateType ranges', () => {
    const lm = new LayerManager();
    expect(lm.allocate('ticker', 1)).toEqual({ channel: 1, layer: 20 });
    expect(lm.allocate('breaking-news', 1)).toEqual({ channel: 1, layer: 30 });
    expect(lm.allocate('fullscreen', 1)).toEqual({ channel: 1, layer: 50 });
  });

  it('throws OutOfLayersError when the range is exhausted', () => {
    const lm = new LayerManager();
    const [low, high] = DEFAULT_LAYER_POLICY['lower-third']!;
    for (let i = low; i <= high; i++) lm.allocate('lower-third', 1);
    expect(() => lm.allocate('lower-third', 1)).toThrow(OutOfLayersError);
  });

  it('emits out-of-layers when exhausted', () => {
    const lm = new LayerManager();
    const events: { templateType: string; channel: number }[] = [];
    lm.on('out-of-layers', (templateType, channel) => events.push({ templateType, channel }));
    const [low, high] = DEFAULT_LAYER_POLICY['lower-third']!;
    for (let i = low; i <= high; i++) lm.allocate('lower-third', 1);
    expect(() => lm.allocate('lower-third', 1)).toThrow();
    expect(events).toEqual([{ templateType: 'lower-third', channel: 1 }]);
  });

  it('throws UnknownTemplateTypeError for a templateType not in the policy', () => {
    const lm = new LayerManager();
    expect(() => lm.allocate('imaginary', 1)).toThrow(UnknownTemplateTypeError);
  });

  it('deallocate() returns the slot to the free pool', () => {
    const lm = new LayerManager();
    const a = lm.allocate('lower-third', 1);
    lm.deallocate(a);
    expect(lm.allocate('lower-third', 1)).toEqual(a);
  });

  it('emits released on deallocate', () => {
    const lm = new LayerManager();
    const slot = lm.allocate('lower-third', 1);
    let released: typeof slot | null = null;
    lm.on('released', (s) => (released = s));
    lm.deallocate(slot);
    expect(released).toEqual(slot);
  });

  it('keeps separate allocations per channel', () => {
    const lm = new LayerManager();
    expect(lm.allocate('lower-third', 1)).toEqual({ channel: 1, layer: 10 });
    expect(lm.allocate('lower-third', 2)).toEqual({ channel: 2, layer: 10 });
  });

  it('pinned slots are reported and not allocated by normal flow', () => {
    const lm = new LayerManager({
      pinned: [{ channel: 1, layer: 95, templateId: 'net-logo-bug', autoStart: true }],
    });
    expect(lm.isPinned({ channel: 1, layer: 95 })).toBe(true);
    expect(lm.pinnedSlots()).toEqual([
      { channel: 1, layer: 95, templateId: 'net-logo-bug', autoStart: true },
    ]);
    // Allocator skips the pinned slot when looking for free space.
    expect(lm.allocate('logo-bug', 1)).toEqual({ channel: 1, layer: 90 });
  });

  it('deallocate() on a pinned slot is a no-op', () => {
    const lm = new LayerManager({
      pinned: [{ channel: 1, layer: 95, templateId: 'net-logo-bug', autoStart: true }],
    });
    lm.deallocate({ channel: 1, layer: 95 });
    expect(lm.isAllocated({ channel: 1, layer: 95 })).toBe(true);
  });

  it('observe() raises collision when OSC reports an unexpected producer', () => {
    const lm = new LayerManager();
    let collision: { slot: { channel: number; layer: number }; producer: string } | null = null;
    lm.on('collision', (slot, producer) => (collision = { slot, producer }));
    const ok = lm.observe({ channel: 1, layer: 15 }, 'html');
    expect(ok).toBe(false);
    expect(collision).toEqual({ slot: { channel: 1, layer: 15 }, producer: 'html' });
  });

  it('observe() matches an allocated slot to OSC truth without emitting collision', () => {
    const lm = new LayerManager();
    let collided = false;
    lm.on('collision', () => (collided = true));
    const slot = lm.allocate('lower-third', 1);
    expect(lm.observe(slot, 'html')).toBe(true);
    expect(collided).toBe(false);
  });

  it('observe(empty) returns true even when previously allocated (caller deallocates)', () => {
    const lm = new LayerManager();
    const slot = lm.allocate('lower-third', 1);
    expect(lm.observe(slot, 'empty')).toBe(true);
  });

  it('observe(empty) ignores a pinned slot showing empty', () => {
    const lm = new LayerManager({
      pinned: [{ channel: 1, layer: 95, templateId: 'logo', autoStart: true }],
    });
    expect(lm.observe({ channel: 1, layer: 95 }, 'empty')).toBe(true);
  });

  it('quarantine() marks a slot occupied so subsequent allocate() skips it', () => {
    const lm = new LayerManager();
    lm.quarantine({ channel: 1, layer: 10 });
    expect(lm.allocate('lower-third', 1)).toEqual({ channel: 1, layer: 11 });
  });

  it('allocations() lists every allocated (non-pinned) slot', () => {
    const lm = new LayerManager();
    const a = lm.allocate('lower-third', 1);
    const b = lm.allocate('ticker', 1);
    const list = lm.allocations();
    expect(list).toContainEqual({ slot: a, templateType: 'lower-third' });
    expect(list).toContainEqual({ slot: b, templateType: 'ticker' });
  });

  it('isAllocated() reports correctly across pinned + allocated + free', () => {
    const lm = new LayerManager({
      pinned: [{ channel: 1, layer: 95, templateId: 'logo', autoStart: true }],
    });
    const slot = lm.allocate('lower-third', 1);
    expect(lm.isAllocated({ channel: 1, layer: 95 })).toBe(true);
    expect(lm.isAllocated(slot)).toBe(true);
    expect(lm.isAllocated({ channel: 1, layer: 12 })).toBe(false);
  });
});
