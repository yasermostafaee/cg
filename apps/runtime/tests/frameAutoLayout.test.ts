import { TemplateLiveSourcesSchema } from '@cg/shared-ipc';
import type { LiveFramePlacement, LiveFrameTarget } from '@cg/shared-schema';
import { afterEach, describe, expect, it } from 'vitest';
import { frameAutoLayoutAvailability } from '../src/renderer/features/inspector/FrameAutoLayout.js';
import {
  __resetDraftsForTest,
  snapshotFramePlacementDraft,
  stageFramePlacement,
  stageFramePlacements,
  subscribeDrafts,
} from '../src/renderer/features/inspector/draftStore.js';

const left = { x: 0, y: 0, width: 640, height: 360 };
const right = { ...left, x: 800 };
const leftFrame = {
  frameKey: 'pair/left',
  artworkKey: 'pair/left',
  resize: 'proportional',
} as const;
const rightFrame = { frameKey: 'pair/right', artworkKey: 'pair/right', resize: 'free' } as const;
const soloFrame = { ...leftFrame, frameKey: 'solo/left', artworkKey: 'solo' };

function carrier({
  allowed = true,
  pairFrames = { right: rightFrame, left: leftFrame },
  pairPermission,
}: {
  allowed?: boolean;
  pairFrames?: Record<string, LiveFrameTarget>;
  pairPermission?: boolean;
} = {}) {
  return TemplateLiveSourcesSchema.parse({
    resolution: { width: 1920, height: 1080 },
    defaultPosition: { anchor: 'center', offset: { x: 0, y: 0 } },
    ...(allowed && { allowOperatorAutoLayout: true }),
    sources: [
      { elementId: 'left', sourceId: 'left', rect: left, dynamic: false },
      { elementId: 'elsewhere', sourceId: 'elsewhere', rect: left, dynamic: false },
      { elementId: 'right', sourceId: 'right', rect: right, dynamic: false },
    ],
    defaultLookId: 'solo',
    looks: [
      {
        id: 'solo',
        name: 'Solo',
        entered: { mode: 'cut' },
        rects: { left },
        operatorFrames: { left: soloFrame },
      },
      {
        id: 'pair',
        name: 'Pair',
        entered: { mode: 'cut' },
        rects: { right, left },
        operatorFrames: pairFrames,
        ...(pairPermission !== undefined && { allowOperatorAutoLayout: pairPermission }),
      },
      {
        id: 'other',
        name: 'Other',
        entered: { mode: 'cut' },
        rects: { elsewhere: left },
      },
    ],
  });
}

afterEach(__resetDraftsForTest);

describe('Auto layout frame eligibility', () => {
  it('requires the authored permission, even with two individually editable frames', () => {
    expect(frameAutoLayoutAvailability(carrier({ allowed: false }), 'pair')).toEqual({
      kind: 'hidden',
    });
  });

  it('allows Auto layout for a preset with explicit permission', () => {
    const live = carrier({ allowed: false, pairPermission: true });
    expect(frameAutoLayoutAvailability(live, 'pair').kind).toBe('eligible');
  });

  it('hides Auto layout for an explicitly disabled preset even with legacy template permission', () => {
    const live = carrier({ pairPermission: false });
    expect(frameAutoLayoutAvailability(live, 'pair')).toEqual({ kind: 'hidden' });
  });

  it('uses only the active preset and returns its frames in declaration order', () => {
    const live = carrier();
    expect(frameAutoLayoutAvailability(live, undefined)).toEqual({ kind: 'hidden' });
    expect(frameAutoLayoutAvailability(live, 'pair')).toEqual({
      kind: 'eligible',
      frames: [
        { id: 'left', target: leftFrame, authored: left },
        { id: 'right', target: rightFrame, authored: right },
      ],
    });
  });

  const incompatible = [
    { name: 'locked', target: undefined },
    { name: 'move-only', target: { ...rightFrame, resize: 'move-only' } },
    { name: 'resize-only', target: { ...rightFrame, move: false } },
  ] as const;
  it.each(incompatible)('reports missing permissions if a frame is $name', ({ target }) => {
    const frames = { left: leftFrame, ...(target !== undefined && { right: target }) };
    expect(frameAutoLayoutAvailability(carrier({ pairFrames: frames }), 'pair')).toEqual({
      kind: 'permissions',
    });
  });
});

it('publishes all arranged frame drafts together and keeps a draft from another preset', () => {
  const itemId = 'live-row';
  const previous = { frameKey: soloFrame.frameKey, lookId: 'solo', rect: { ...left, y: 35 } };
  stageFramePlacement(itemId, previous, left);
  const layout = frameAutoLayoutAvailability(carrier(), 'pair');
  if (layout.kind !== 'eligible') throw new Error('The test needs an eligible pair');
  const updates = layout.frames.map(({ target, authored }) => ({
    placement: { frameKey: target.frameKey, lookId: 'pair', rect: { ...authored, y: 80 } },
    baseline: authored,
  }));

  const published: LiveFramePlacement[][] = [];
  const unsubscribe = subscribeDrafts(() => {
    published.push([...(snapshotFramePlacementDraft(itemId)?.edits.values() ?? [])]);
  });
  try {
    stageFramePlacements(itemId, updates);
    stageFramePlacements(
      itemId,
      updates.map(({ placement, baseline }) => ({
        placement: { ...placement, rect: { ...placement.rect } },
        baseline,
      })),
    );
    expect(published).toEqual([[previous, ...updates.map(({ placement }) => placement)]]);
  } finally {
    unsubscribe();
  }
});
