import { describe, expect, it } from 'vitest';
import { TemplateTypeSchema } from '@cg/shared-schema';
import { FIRST_ALLOCATABLE_LAYER } from '@cg/shared-ipc';
import {
  assertPolicyAboveFloor,
  DEFAULT_LAYER_POLICY,
  FixedPinnedConflictError,
  LayerManager,
  OutOfLayersError,
  UnknownTemplateTypeError,
  type LayerPolicy,
} from '../src/index.js';

/**
 * 🔴 **A TEST POLICY, and it is deliberately NOT the product map (`LAYER-BANDS-16`).**
 *
 * `DEFAULT_LAYER_POLICY` is EMPTY since the 2026-09-14 re-cut — placement is decided by a
 * graphic's ROLE band now, not by its `templateType` — so the mechanism tests below bring
 * their own ranges. They sit at 110+ on purpose: ABOVE the product's whole map, plainly a
 * fixture rather than a shipped number, and above `FIRST_ALLOCATABLE_LAYER`, so nothing in
 * this tree models allocating on the layers left free for the playout server. They were
 * 10-69 before, which is now exactly that free span.
 *
 * What these tests exercise is `allocate()`'s arithmetic — lowest-free, per-type ranges,
 * exhaustion, the pinned / fixed / reserved fences. None of it depends on which decades the
 * ranges name, which is why moving them costs the coverage nothing.
 */
const TEST_POLICY: LayerPolicy = {
  'lower-third': [110, 119],
  ticker: [120, 129],
  'breaking-news': [130, 139],
  'logo-bug': [140, 149],
  fullscreen: [150, 159],
  custom: [160, 169],
};

describe('LayerManager', () => {
  it('allocates the lowest free layer in the policy range', () => {
    const lm = new LayerManager({ policy: TEST_POLICY });
    const a = lm.allocate('lower-third', 1);
    expect(a).toEqual({ channel: 1, layer: 110 });
    const b = lm.allocate('lower-third', 1);
    expect(b).toEqual({ channel: 1, layer: 111 });
  });

  it('respects per-templateType ranges', () => {
    const lm = new LayerManager({ policy: TEST_POLICY });
    expect(lm.allocate('ticker', 1)).toEqual({ channel: 1, layer: 120 });
    expect(lm.allocate('breaking-news', 1)).toEqual({ channel: 1, layer: 130 });
    expect(lm.allocate('fullscreen', 1)).toEqual({ channel: 1, layer: 150 });
  });

  it('throws OutOfLayersError when the range is exhausted', () => {
    const lm = new LayerManager({ policy: TEST_POLICY });
    const [low, high] = TEST_POLICY['lower-third']!;
    for (let i = low; i <= high; i++) lm.allocate('lower-third', 1);
    expect(() => lm.allocate('lower-third', 1)).toThrow(OutOfLayersError);
  });

  it('emits out-of-layers when exhausted', () => {
    const lm = new LayerManager({ policy: TEST_POLICY });
    const events: { templateType: string; channel: number }[] = [];
    lm.on('out-of-layers', (templateType, channel) => events.push({ templateType, channel }));
    const [low, high] = TEST_POLICY['lower-third']!;
    for (let i = low; i <= high; i++) lm.allocate('lower-third', 1);
    expect(() => lm.allocate('lower-third', 1)).toThrow();
    expect(events).toEqual([{ templateType: 'lower-third', channel: 1 }]);
  });

  it('throws UnknownTemplateTypeError for a templateType not in the policy', () => {
    const lm = new LayerManager({ policy: TEST_POLICY });
    expect(() => lm.allocate('imaginary', 1)).toThrow(UnknownTemplateTypeError);
  });

  it('deallocate() returns the slot to the free pool', () => {
    const lm = new LayerManager({ policy: TEST_POLICY });
    const a = lm.allocate('lower-third', 1);
    lm.deallocate(a);
    expect(lm.allocate('lower-third', 1)).toEqual(a);
  });

  it('emits released on deallocate', () => {
    const lm = new LayerManager({ policy: TEST_POLICY });
    const slot = lm.allocate('lower-third', 1);
    let released: typeof slot | null = null;
    lm.on('released', (s) => (released = s));
    lm.deallocate(slot);
    expect(released).toEqual(slot);
  });

  it('keeps separate allocations per channel', () => {
    const lm = new LayerManager({ policy: TEST_POLICY });
    expect(lm.allocate('lower-third', 1)).toEqual({ channel: 1, layer: 110 });
    expect(lm.allocate('lower-third', 2)).toEqual({ channel: 2, layer: 110 });
  });

  it('pinned slots are reported and not allocated by normal flow', () => {
    /*
      The pin sits on the FIRST layer of the fixture's `logo-bug` range, which is what
      makes the last assertion mean anything: the allocator has to skip it and hand out
      the next one. A pin outside the range would leave the allocator returning the
      range's first layer without ever having skipped anything.
    */
    const lm = new LayerManager({
      policy: TEST_POLICY,
      pinned: [{ channel: 1, layer: 140, templateId: 'net-logo-bug', autoStart: true }],
    });
    expect(lm.isPinned({ channel: 1, layer: 140 })).toBe(true);
    expect(lm.pinnedSlots()).toEqual([
      { channel: 1, layer: 140, templateId: 'net-logo-bug', autoStart: true },
    ]);
    // Allocator skips the pinned slot when looking for free space.
    expect(lm.allocate('logo-bug', 1)).toEqual({ channel: 1, layer: 141 });
  });

  it('deallocate() on a pinned slot is a no-op', () => {
    const lm = new LayerManager({
      policy: TEST_POLICY,
      pinned: [{ channel: 1, layer: 95, templateId: 'net-logo-bug', autoStart: true }],
    });
    lm.deallocate({ channel: 1, layer: 95 });
    expect(lm.isAllocated({ channel: 1, layer: 95 })).toBe(true);
  });

  it('observe() raises collision when OSC reports an unexpected producer', () => {
    const lm = new LayerManager({ policy: TEST_POLICY });
    let collision: { slot: { channel: number; layer: number }; producer: string } | null = null;
    lm.on('collision', (slot, producer) => (collision = { slot, producer }));
    const ok = lm.observe({ channel: 1, layer: 115 }, 'html');
    expect(ok).toBe(false);
    expect(collision).toEqual({ slot: { channel: 1, layer: 115 }, producer: 'html' });
  });

  it('observe() matches an allocated slot to OSC truth without emitting collision', () => {
    const lm = new LayerManager({ policy: TEST_POLICY });
    let collided = false;
    lm.on('collision', () => (collided = true));
    const slot = lm.allocate('lower-third', 1);
    expect(lm.observe(slot, 'html')).toBe(true);
    expect(collided).toBe(false);
  });

  it('observe(empty) returns true even when previously allocated (caller deallocates)', () => {
    const lm = new LayerManager({ policy: TEST_POLICY });
    const slot = lm.allocate('lower-third', 1);
    expect(lm.observe(slot, 'empty')).toBe(true);
  });

  it('observe(empty) ignores a pinned slot showing empty', () => {
    const lm = new LayerManager({
      policy: TEST_POLICY,
      pinned: [{ channel: 1, layer: 95, templateId: 'logo', autoStart: true }],
    });
    expect(lm.observe({ channel: 1, layer: 95 }, 'empty')).toBe(true);
  });

  it('quarantine() marks a slot occupied so subsequent allocate() skips it', () => {
    const lm = new LayerManager({ policy: TEST_POLICY });
    lm.quarantine({ channel: 1, layer: 110 });
    expect(lm.allocate('lower-third', 1)).toEqual({ channel: 1, layer: 111 });
  });

  it('allocations() lists every allocated (non-pinned) slot', () => {
    const lm = new LayerManager({ policy: TEST_POLICY });
    const a = lm.allocate('lower-third', 1);
    const b = lm.allocate('ticker', 1);
    const list = lm.allocations();
    expect(list).toContainEqual({ slot: a, templateType: 'lower-third' });
    expect(list).toContainEqual({ slot: b, templateType: 'ticker' });
  });

  it('isAllocated() reports correctly across pinned + allocated + free', () => {
    const lm = new LayerManager({
      policy: TEST_POLICY,
      pinned: [{ channel: 1, layer: 95, templateId: 'logo', autoStart: true }],
    });
    const slot = lm.allocate('lower-third', 1);
    expect(lm.isAllocated({ channel: 1, layer: 95 })).toBe(true);
    expect(lm.isAllocated(slot)).toBe(true);
    expect(lm.isAllocated({ channel: 1, layer: 112 })).toBe(false);
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
    { channel: 1, layer: 112 },
    { channel: 1, layer: 113 },
  ] as const;

  it('T1 — allocate() never returns a fixed slot, even with the range otherwise exhausted', () => {
    // Deliberately places the fixed slots INSIDE the lower-third fixture range
    // (110–119), to prove the FENCING mechanism independently of the
    // config-level disjointness prohibition (which forbids this arrangement
    // for a real install — the validator's tests cover that layer).
    const lm = new LayerManager({ policy: TEST_POLICY, fixed: [...FIXED] });
    const got: number[] = [];
    for (let i = 0; i < 8; i++) got.push(lm.allocate('lower-third', 1).layer);
    expect(got).toEqual([110, 111, 114, 115, 116, 117, 118, 119]); // 112/113 skipped
    expect(() => lm.allocate('lower-third', 1)).toThrow(OutOfLayersError);
  });

  it('T2 — deallocate() never frees a fixed slot', () => {
    const lm = new LayerManager({ policy: TEST_POLICY, fixed: [...FIXED] });
    lm.deallocate({ channel: 1, layer: 112 });
    expect(lm.isAllocated({ channel: 1, layer: 112 })).toBe(true);
    expect(lm.isFixed({ channel: 1, layer: 112 })).toBe(true);
  });

  it('T3 — bindFixed/unbindFixed round-trip; double-bind and non-fixed bind refuse; fence survives unbind', () => {
    const lm = new LayerManager({ policy: TEST_POLICY, fixed: [...FIXED] });
    const slot = { channel: 1, layer: 112 };

    expect(lm.bindFixed(slot, 'clock')).toBe(true);
    expect(lm.fixedBinding(slot)).toBe('clock');
    expect(lm.bindFixed(slot, 'other')).toBe(false); // already bound
    expect(lm.bindFixed({ channel: 1, layer: 140 }, 'clock')).toBe(false); // not fixed

    lm.unbindFixed(slot);
    expect(lm.fixedBinding(slot)).toBeUndefined();
    // Still fenced: dynamic allocation cannot land on it after unbind.
    expect(lm.allocate('lower-third', 1)).toEqual({ channel: 1, layer: 110 });
    expect(lm.allocate('lower-third', 1)).toEqual({ channel: 1, layer: 111 });
    expect(lm.allocate('lower-third', 1)).toEqual({ channel: 1, layer: 114 });
  });

  it('T3b — bindFixed emits allocated; unbindFixed emits released', () => {
    const lm = new LayerManager({ policy: TEST_POLICY, fixed: [...FIXED] });
    const events: string[] = [];
    lm.on('allocated', (s, t) => events.push(`alloc:${String(s.layer)}:${t}`));
    lm.on('released', (s) => events.push(`rel:${String(s.layer)}`));
    lm.bindFixed({ channel: 1, layer: 112 }, 'clock');
    lm.unbindFixed({ channel: 1, layer: 112 });
    expect(events).toEqual(['alloc:112:clock', 'rel:112']);
  });

  it('T4 — reserve() on a fixed slot returns false (bindFixed is the exact-slot path)', () => {
    const lm = new LayerManager({ policy: TEST_POLICY, fixed: [...FIXED] });
    expect(lm.reserve({ channel: 1, layer: 112 }, 'clock')).toBe(false);
  });

  it('T5 — unbound fixed slots are absent from allocations(); bound ones present with their type', () => {
    const lm = new LayerManager({ policy: TEST_POLICY, fixed: [...FIXED] });
    expect(lm.allocations()).toEqual([]); // fenced-but-unbound is not an allocation
    lm.bindFixed({ channel: 1, layer: 113 }, 'clock');
    expect(lm.allocations()).toEqual([{ slot: { channel: 1, layer: 113 }, templateType: 'clock' }]);
    expect(lm.fixedSlots()).toEqual([...FIXED]);
  });

  it('T6 — quarantine() on a fixed slot is a no-op; observe(fixed, non-html) emits no collision', () => {
    const lm = new LayerManager({ policy: TEST_POLICY, fixed: [...FIXED] });
    let collided = false;
    lm.on('collision', () => (collided = true));

    lm.quarantine({ channel: 1, layer: 112 });
    expect(lm.quarantined()).toEqual([]);

    expect(lm.observe({ channel: 1, layer: 112 }, 'decklink')).toBe(true);
    expect(collided).toBe(false);
    expect(lm.quarantined()).toEqual([]);
    // bindFixed still works after the foreign observation — the reason the
    // quarantine no-op exists.
    expect(lm.bindFixed({ channel: 1, layer: 112 }, 'clock')).toBe(true);
  });

  it('S3 — applyFixed: adds fenced, releases removed, refuses removing a BOUND slot, pinned untouched', () => {
    const lm = new LayerManager({
      policy: TEST_POLICY,
      pinned: [{ channel: 1, layer: 95, templateId: 'logo', autoStart: true }],
      fixed: [
        { channel: 1, layer: 112 },
        { channel: 1, layer: 113 },
      ],
    });

    // Grow: 14 joins the bank, immediately fenced from allocation.
    lm.applyFixed([
      { channel: 1, layer: 112 },
      { channel: 1, layer: 113 },
      { channel: 1, layer: 114 },
    ]);
    expect(lm.isFixed({ channel: 1, layer: 114 })).toBe(true);
    const got: number[] = [];
    for (let i = 0; i < 7; i++) got.push(lm.allocate('lower-third', 1).layer);
    expect(got).toEqual([110, 111, 115, 116, 117, 118, 119]); // 112/113/114 all skipped

    // Shrink: 14 leaves the bank and returns to the free pool.
    lm.applyFixed([
      { channel: 1, layer: 112 },
      { channel: 1, layer: 113 },
    ]);
    expect(lm.isFixed({ channel: 1, layer: 114 })).toBe(false);
    expect(lm.allocate('lower-third', 1)).toEqual({ channel: 1, layer: 114 });

    // A BOUND slot may never be removed — defence in depth behind the validator.
    lm.bindFixed({ channel: 1, layer: 112 }, 'clock');
    expect(() => lm.applyFixed([{ channel: 1, layer: 113 }])).toThrow(FixedPinnedConflictError);
    expect(lm.isFixed({ channel: 1, layer: 112 })).toBe(true); // nothing mutated
    expect(lm.fixedBinding({ channel: 1, layer: 112 })).toBe('clock');

    // Pinned stays pinned throughout; declaring a pinned slot fixed still throws.
    expect(lm.isPinned({ channel: 1, layer: 95 })).toBe(true);
    expect(() =>
      lm.applyFixed([
        { channel: 1, layer: 112 },
        { channel: 1, layer: 95 },
      ]),
    ).toThrow(FixedPinnedConflictError);
  });

  it('T7 — a slot declared both pinned and fixed throws, naming the slot', () => {
    expect(
      () =>
        new LayerManager({
          policy: TEST_POLICY,
          pinned: [{ channel: 1, layer: 112, templateId: 'logo', autoStart: true }],
          fixed: [{ channel: 1, layer: 112 }],
        }),
    ).toThrow(FixedPinnedConflictError);
    try {
      new LayerManager({
        policy: TEST_POLICY,
        pinned: [{ channel: 1, layer: 112, templateId: 'logo', autoStart: true }],
        fixed: [{ channel: 1, layer: 112 }],
      });
      expect.unreachable('constructor must throw');
    } catch (err) {
      expect((err as Error).message).toContain('1-112');
    }
  });
});

describe('LayerManager — reserved playout layers (R-028 / C-015)', () => {
  it('allocate() never returns a reserved layer, whatever the policy range says', () => {
    // The fixture policy's `custom` range is 160–169. With 160–168 reserved, allocation
    // must skip straight to 169.
    const lm = new LayerManager({
      policy: TEST_POLICY,
      reservedLayers: [160, 161, 162, 163, 164, 165, 166, 167, 168],
    });
    expect(lm.allocate('custom', 1)).toEqual({ channel: 1, layer: 169 });
    // Range now exhausted (everything else reserved): honest failure, no
    // silent spill onto a playout layer.
    expect(() => lm.allocate('custom', 1)).toThrow(OutOfLayersError);
  });

  it('reserve() refuses a reserved layer — a retained coordinate never lands on playout', () => {
    const lm = new LayerManager({ policy: TEST_POLICY, reservedLayers: [165] });
    expect(lm.reserve({ channel: 1, layer: 165 }, 'lower-third')).toBe(false);
    expect(lm.reserve({ channel: 1, layer: 166 }, 'lower-third')).toBe(true);
  });

  it('the fence is per layer NUMBER across channels (conservative for the split)', () => {
    const lm = new LayerManager({ policy: TEST_POLICY, reservedLayers: [160] });
    expect(lm.reserve({ channel: 2, layer: 160 }, 'x')).toBe(false);
  });
});

describe('R-028 (6.1/6.4) + LAYER-BANDS-16 — allocation is not the OPERATOR path, and is not retired either', () => {
  /**
   * The half that must PASS, stated as its own test so nobody satisfies 6.1 by
   * deleting the mechanism.
   *
   * 6.1 asserts the absence of an OPERATOR-graphic caller of `allocate()` (see
   * `apps/runtime/tests/noOperatorAllocation.test.ts`). Written as "no caller at
   * all" it would be a silently correct-looking fixture that forbids C-015's
   * third ownership class — bridge-owned Live Source layers, which ARE allocated,
   * on a declared range, and are never an operator's graphic. These two tests are
   * the two halves of one claim and should be read together.
   */
  it('a DECLARED, non-operator caller can still allocate on a policy it supplies', () => {
    const lm = new LayerManager({ policy: TEST_POLICY });
    expect(lm.allocate('lower-third', 1).layer).toBe(110);
    expect(lm.allocate('ticker', 1).layer).toBe(120);
    expect(lm.allocate('breaking-news', 1).layer).toBe(130);
    expect(lm.allocate('logo-bug', 1).layer).toBe(140);
    expect(lm.allocate('fullscreen', 1).layer).toBe(150);
  });

  /**
   * 🔴 `LAYER-BANDS-16` — **THE SHIPPED POLICY IS EMPTY, AND THAT IS THE DECISION.**
   *
   * R-028 6.4 recorded 10–59 as the span its narrowing FREED, and the six template-type
   * ranges were what lived there. The owner's 2026-09-14 re-cut answered the question the
   * other way round: 1–49 is left to the playout server and 50–99 is cut into three ROLE
   * bands, so a type-keyed range has nowhere legal to sit. Retiring the ranges is what
   * "the map is the policy" means in code.
   */
  it('ships NO dynamic ranges — a station allocating by templateType must declare its own', () => {
    expect(Object.keys(DEFAULT_LAYER_POLICY)).toEqual([]);
    const lm = new LayerManager();
    expect(() => lm.allocate('lower-third', 1)).toThrow(UnknownTemplateTypeError);
  });

  it('🔴 refuses a policy that would allocate below the floor', () => {
    // The guard that makes re-adding `lower-third: [10, 19]` a red rather than a silent
    // return to allocating on the playout server's layers.
    expect(() => {
      assertPolicyAboveFloor(DEFAULT_LAYER_POLICY);
    }).not.toThrow();
    expect(() => {
      assertPolicyAboveFloor({ 'lower-third': [10, 19] });
    }).toThrow(/allocates below layer 50/);
    expect(() => {
      assertPolicyAboveFloor({ fullscreen: [49, 59] });
    }).toThrow(/1-49 is left free for the playout server/);
    expect(() => {
      assertPolicyAboveFloor({ fullscreen: [FIRST_ALLOCATABLE_LAYER, 59] });
    }).not.toThrow();
  });

  it('🔴 `logo-bug` is still a scene templateType — the type did not go with the range', () => {
    // 6.4's record, made executable, and re-pointed at the thing that actually carries the
    // vocabulary. The range is gone; the type travels inside every `.vcg` ever exported and
    // deleting it would break those packages.
    expect(TemplateTypeSchema.safeParse('logo-bug').success).toBe(true);
    expect(DEFAULT_LAYER_POLICY['logo-bug']).toBeUndefined();
  });
});
