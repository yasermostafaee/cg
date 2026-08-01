import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LAYER_POLICY,
  FixedPinnedConflictError,
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
    /*
      The pin sits on the FIRST layer of the `logo-bug` range, which is what makes the
      last assertion mean anything: the allocator has to skip it and hand out the next
      one. The pin used to be layer 95 and the expected allocation 90, back when the
      range was 90–99; the range moved to 40–49 (the operator's candidate bank took
      70–99), so a pin at 95 would now be outside the range entirely and the allocator
      would return 40 without ever having skipped anything.
    */
    const lm = new LayerManager({
      pinned: [{ channel: 1, layer: 40, templateId: 'net-logo-bug', autoStart: true }],
    });
    expect(lm.isPinned({ channel: 1, layer: 40 })).toBe(true);
    expect(lm.pinnedSlots()).toEqual([
      { channel: 1, layer: 40, templateId: 'net-logo-bug', autoStart: true },
    ]);
    // Allocator skips the pinned slot when looking for free space.
    expect(lm.allocate('logo-bug', 1)).toEqual({ channel: 1, layer: 41 });
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

/**
 * R-021 stage 1 — the FIXED operator slot mechanism. Fixed slots are fenced
 * from birth (never allocated, never deallocated, never quarantined) and bind
 * items only through bindFixed/unbindFixed — the exact-slot path; reserve()
 * refuses them. NOT template-pinned: no templateId, no autoStart.
 */
describe('LayerManager — fixed operator slots (R-021)', () => {
  const FIXED = [
    { channel: 1, layer: 12 },
    { channel: 1, layer: 13 },
  ] as const;

  it('T1 — allocate() never returns a fixed slot, even with the range otherwise exhausted', () => {
    // Deliberately places the fixed slots INSIDE the lower-third policy range
    // (10–19), to prove the FENCING mechanism independently of the
    // config-level disjointness prohibition (which forbids this arrangement
    // for a real install — the validator's tests cover that layer).
    const lm = new LayerManager({ fixed: [...FIXED] });
    const got: number[] = [];
    for (let i = 0; i < 8; i++) got.push(lm.allocate('lower-third', 1).layer);
    expect(got).toEqual([10, 11, 14, 15, 16, 17, 18, 19]); // 12/13 skipped
    expect(() => lm.allocate('lower-third', 1)).toThrow(OutOfLayersError);
  });

  it('T2 — deallocate() never frees a fixed slot', () => {
    const lm = new LayerManager({ fixed: [...FIXED] });
    lm.deallocate({ channel: 1, layer: 12 });
    expect(lm.isAllocated({ channel: 1, layer: 12 })).toBe(true);
    expect(lm.isFixed({ channel: 1, layer: 12 })).toBe(true);
  });

  it('T3 — bindFixed/unbindFixed round-trip; double-bind and non-fixed bind refuse; fence survives unbind', () => {
    const lm = new LayerManager({ fixed: [...FIXED] });
    const slot = { channel: 1, layer: 12 };

    expect(lm.bindFixed(slot, 'clock')).toBe(true);
    expect(lm.fixedBinding(slot)).toBe('clock');
    expect(lm.bindFixed(slot, 'other')).toBe(false); // already bound
    expect(lm.bindFixed({ channel: 1, layer: 40 }, 'clock')).toBe(false); // not fixed

    lm.unbindFixed(slot);
    expect(lm.fixedBinding(slot)).toBeUndefined();
    // Still fenced: dynamic allocation cannot land on it after unbind.
    expect(lm.allocate('lower-third', 1)).toEqual({ channel: 1, layer: 10 });
    expect(lm.allocate('lower-third', 1)).toEqual({ channel: 1, layer: 11 });
    expect(lm.allocate('lower-third', 1)).toEqual({ channel: 1, layer: 14 });
  });

  it('T3b — bindFixed emits allocated; unbindFixed emits released', () => {
    const lm = new LayerManager({ fixed: [...FIXED] });
    const events: string[] = [];
    lm.on('allocated', (s, t) => events.push(`alloc:${String(s.layer)}:${t}`));
    lm.on('released', (s) => events.push(`rel:${String(s.layer)}`));
    lm.bindFixed({ channel: 1, layer: 12 }, 'clock');
    lm.unbindFixed({ channel: 1, layer: 12 });
    expect(events).toEqual(['alloc:12:clock', 'rel:12']);
  });

  it('T4 — reserve() on a fixed slot returns false (bindFixed is the exact-slot path)', () => {
    const lm = new LayerManager({ fixed: [...FIXED] });
    expect(lm.reserve({ channel: 1, layer: 12 }, 'clock')).toBe(false);
  });

  it('T5 — unbound fixed slots are absent from allocations(); bound ones present with their type', () => {
    const lm = new LayerManager({ fixed: [...FIXED] });
    expect(lm.allocations()).toEqual([]); // fenced-but-unbound is not an allocation
    lm.bindFixed({ channel: 1, layer: 13 }, 'clock');
    expect(lm.allocations()).toEqual([{ slot: { channel: 1, layer: 13 }, templateType: 'clock' }]);
    expect(lm.fixedSlots()).toEqual([...FIXED]);
  });

  it('T6 — quarantine() on a fixed slot is a no-op; observe(fixed, non-html) emits no collision', () => {
    const lm = new LayerManager({ fixed: [...FIXED] });
    let collided = false;
    lm.on('collision', () => (collided = true));

    lm.quarantine({ channel: 1, layer: 12 });
    expect(lm.quarantined()).toEqual([]);

    expect(lm.observe({ channel: 1, layer: 12 }, 'decklink')).toBe(true);
    expect(collided).toBe(false);
    expect(lm.quarantined()).toEqual([]);
    // bindFixed still works after the foreign observation — the reason the
    // quarantine no-op exists.
    expect(lm.bindFixed({ channel: 1, layer: 12 }, 'clock')).toBe(true);
  });

  it('S3 — applyFixed: adds fenced, releases removed, refuses removing a BOUND slot, pinned untouched', () => {
    const lm = new LayerManager({
      pinned: [{ channel: 1, layer: 95, templateId: 'logo', autoStart: true }],
      fixed: [
        { channel: 1, layer: 12 },
        { channel: 1, layer: 13 },
      ],
    });

    // Grow: 14 joins the bank, immediately fenced from allocation.
    lm.applyFixed([
      { channel: 1, layer: 12 },
      { channel: 1, layer: 13 },
      { channel: 1, layer: 14 },
    ]);
    expect(lm.isFixed({ channel: 1, layer: 14 })).toBe(true);
    const got: number[] = [];
    for (let i = 0; i < 7; i++) got.push(lm.allocate('lower-third', 1).layer);
    expect(got).toEqual([10, 11, 15, 16, 17, 18, 19]); // 12/13/14 all skipped

    // Shrink: 14 leaves the bank and returns to the free pool.
    lm.applyFixed([
      { channel: 1, layer: 12 },
      { channel: 1, layer: 13 },
    ]);
    expect(lm.isFixed({ channel: 1, layer: 14 })).toBe(false);
    expect(lm.allocate('lower-third', 1)).toEqual({ channel: 1, layer: 14 });

    // A BOUND slot may never be removed — defence in depth behind the validator.
    lm.bindFixed({ channel: 1, layer: 12 }, 'clock');
    expect(() => lm.applyFixed([{ channel: 1, layer: 13 }])).toThrow(FixedPinnedConflictError);
    expect(lm.isFixed({ channel: 1, layer: 12 })).toBe(true); // nothing mutated
    expect(lm.fixedBinding({ channel: 1, layer: 12 })).toBe('clock');

    // Pinned stays pinned throughout; declaring a pinned slot fixed still throws.
    expect(lm.isPinned({ channel: 1, layer: 95 })).toBe(true);
    expect(() =>
      lm.applyFixed([
        { channel: 1, layer: 12 },
        { channel: 1, layer: 95 },
      ]),
    ).toThrow(FixedPinnedConflictError);
  });

  it('T7 — a slot declared both pinned and fixed throws, naming the slot', () => {
    expect(
      () =>
        new LayerManager({
          pinned: [{ channel: 1, layer: 12, templateId: 'logo', autoStart: true }],
          fixed: [{ channel: 1, layer: 12 }],
        }),
    ).toThrow(FixedPinnedConflictError);
    try {
      new LayerManager({
        pinned: [{ channel: 1, layer: 12, templateId: 'logo', autoStart: true }],
        fixed: [{ channel: 1, layer: 12 }],
      });
      expect.unreachable('constructor must throw');
    } catch (err) {
      expect((err as Error).message).toContain('1-12');
    }
  });
});

describe('LayerManager — reserved playout layers (R-028 / C-015)', () => {
  it('allocate() never returns a reserved layer, whatever the policy range says', () => {
    // The default policy's `custom` range is 60–69 — exactly where the playout
    // split lives. With 60–68 reserved, allocation must skip straight to 69.
    const lm = new LayerManager({
      reservedLayers: [60, 61, 62, 63, 64, 65, 66, 67, 68],
    });
    expect(lm.allocate('custom', 1)).toEqual({ channel: 1, layer: 69 });
    // Range now exhausted (everything else reserved): honest failure, no
    // silent spill onto a playout layer.
    expect(() => lm.allocate('custom', 1)).toThrow(OutOfLayersError);
  });

  it('reserve() refuses a reserved layer — a retained coordinate never lands on playout', () => {
    const lm = new LayerManager({ reservedLayers: [65] });
    expect(lm.reserve({ channel: 1, layer: 65 }, 'lower-third')).toBe(false);
    expect(lm.reserve({ channel: 1, layer: 66 }, 'lower-third')).toBe(true);
  });

  it('the fence is per layer NUMBER across channels (conservative for the split)', () => {
    const lm = new LayerManager({ reservedLayers: [60] });
    expect(lm.reserve({ channel: 2, layer: 60 }, 'x')).toBe(false);
  });
});
