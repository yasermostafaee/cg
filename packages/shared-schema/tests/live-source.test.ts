import { describe, expect, it } from 'vitest';
import {
  FieldBindingSchema,
  LiveSourceIdSchema,
  VideoPlaceholderElementSchema,
} from '../src/index.js';

/**
 * D-137 phase 1 — the Live Source's schema half: the symbolic-id refinement, the
 * additive `keySourceId`, and the `live-source-id` binding target.
 *
 * Maps `specs/designer-live-source/spec.md`:
 *   - "The element carries its ids and is placeable" (the round-trip half)
 *   - "A stored scene authored before this change still parses"
 *   - "A device reference is refused as a source id" (the schema-boundary half)
 *   - "A bound id is settable at playout" (the target's own shape)
 */

const base = {
  id: 'el-1',
  name: 'Guest box',
  visible: true,
  locked: false,
  opacity: 1,
  zIndex: 0,
  transform: {
    position: { x: 100, y: 100 },
    size: { w: 640, h: 360 },
    rotation: 0,
    scale: { x: 1, y: 1 },
    anchor: { x: 0.5, y: 0.5 },
  },
};

describe('LiveSourceIdSchema — symbolic, and what it REFUSES is the point', () => {
  it.each(['guest-1', 'guest_1', 'GUEST1', 'a', '1', 'live-source-42'])(
    'accepts the symbolic id %j',
    (id) => {
      expect(LiveSourceIdSchema.safeParse(id).success).toBe(true);
    },
  );

  it.each([
    ['DECKLINK DEVICE 3', 'a device reference — spaces'],
    ['route://1-1', 'a route URL — colon and slashes'],
    ['C:\\media\\guest.mp4', 'a Windows file path — colon and backslashes'],
    ['/media/guest.mp4', 'a POSIX file path — slashes'],
    ['-leading-dash', 'must start alphanumeric'],
    ['', 'empty'],
    ['ndi source', 'any space at all'],
  ])('refuses %j (%s)', (id) => {
    expect(LiveSourceIdSchema.safeParse(id).success).toBe(false);
  });

  it('the refusal message says WHERE the mapping belongs, not just that it is invalid', () => {
    const res = LiveSourceIdSchema.safeParse('DECKLINK DEVICE 3');
    expect(res.success).toBe(false);
    if (res.success) return;
    // An author who typed a device name has a real intent; the message has to tell
    // them where that intent belongs rather than only that the field is wrong.
    expect(res.error.issues[0]?.message).toMatch(/installation/i);
  });
});

describe('VideoPlaceholderElementSchema — additive, and still frozen for D-128', () => {
  it('a scene written BEFORE this change still parses, unchanged — no migration', () => {
    // The exact pre-change shape (no keySourceId). This is the D-128 freeze test's
    // fixture, re-asserted here for the additive claim in `tasks.md` 1.1.
    const v = {
      ...base,
      type: 'video-placeholder' as const,
      posterAssetId: 'asset-poster',
      expectedAspect: 4 / 3,
      routeKey: 'guest-1',
    };
    expect(VideoPlaceholderElementSchema.parse(v)).toEqual(v);
  });

  it('carries the FULL set: source id, optional key id, expectedAspect, optional poster', () => {
    const v = {
      ...base,
      type: 'video-placeholder' as const,
      posterAssetId: 'asset-poster',
      expectedAspect: 16 / 9,
      routeKey: 'guest-1',
      keySourceId: 'guest-1-key',
    };
    // Round-trips byte-for-byte: nothing is defaulted in, nothing is dropped.
    expect(VideoPlaceholderElementSchema.parse(v)).toEqual(v);
  });

  it('a device-shaped source id is refused AT THE SCHEMA BOUNDARY', () => {
    for (const routeKey of ['DECKLINK DEVICE 3', 'route://1-1', 'C:\\media\\guest.mp4']) {
      const res = VideoPlaceholderElementSchema.safeParse({
        ...base,
        type: 'video-placeholder',
        expectedAspect: 16 / 9,
        routeKey,
      });
      expect(res.success, routeKey).toBe(false);
    }
  });

  it('a device-shaped KEY id is refused too — the key is not a laxer field', () => {
    const res = VideoPlaceholderElementSchema.safeParse({
      ...base,
      type: 'video-placeholder',
      expectedAspect: 16 / 9,
      routeKey: 'guest-1',
      keySourceId: 'DECKLINK DEVICE 4',
    });
    expect(res.success).toBe(false);
  });
});

describe('the `live-source-id` binding target', () => {
  it('parses, and DEFAULTS the role to fill', () => {
    const parsed = FieldBindingSchema.parse({
      fieldId: 'guest',
      target: { kind: 'live-source-id', elementId: 'el-1' },
    });
    // Absent role ⇒ 'fill': the only id every Live Source has, and the only one v1
    // composites. A key bound where a fill was meant is a hole that stays empty.
    expect(parsed.target).toEqual({ kind: 'live-source-id', elementId: 'el-1', role: 'fill' });
  });

  it('takes an explicit key role', () => {
    const parsed = FieldBindingSchema.parse({
      fieldId: 'guest-key',
      target: { kind: 'live-source-id', elementId: 'el-1', role: 'key' },
    });
    expect(parsed.target).toMatchObject({ role: 'key' });
  });

  it('refuses a role that is neither', () => {
    expect(
      FieldBindingSchema.safeParse({
        fieldId: 'guest',
        target: { kind: 'live-source-id', elementId: 'el-1', role: 'alpha' },
      }).success,
    ).toBe(false);
  });
});
