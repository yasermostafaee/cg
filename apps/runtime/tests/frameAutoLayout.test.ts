import { TemplateLiveSourcesSchema } from '@cg/shared-ipc';
import type { LiveFramePlacement, LiveFrameTarget } from '@cg/shared-schema';
import { afterEach, describe, expect, it } from 'vitest';
import { autoLayoutFrames } from '../src/renderer/features/inspector/FrameAutoLayout.js';
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

function carrier(
  allowed = true,
  pairFrames: Record<string, LiveFrameTarget> = { right: rightFrame, left: leftFrame },
) {
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
    expect(autoLayoutFrames(carrier(false), 'pair')).toEqual([]);
  });

  it('uses only the active preset and returns its frames in declaration order', () => {
    const live = carrier();
    expect(autoLayoutFrames(live, undefined)).toEqual([]);
    expect(autoLayoutFrames(live, 'pair')).toEqual([
      { id: 'left', target: leftFrame, authored: left },
      { id: 'right', target: rightFrame, authored: right },
    ]);
  });

  const incompatible = [
    { name: 'locked', target: undefined },
    { name: 'move-only', target: { ...rightFrame, resize: 'move-only' } },
    { name: 'resize-only', target: { ...rightFrame, move: false } },
  ] as const;
  it.each(incompatible)('leaves the whole preset alone if a frame is $name', ({ target }) => {
    const frames = { left: leftFrame, ...(target !== undefined && { right: target }) };
    expect(autoLayoutFrames(carrier(true, frames), 'pair')).toEqual([]);
  });
});

it('publishes all arranged frame drafts together and keeps a draft from another preset', () => {
  const itemId = 'live-row';
  const previous = { frameKey: soloFrame.frameKey, lookId: 'solo', rect: { ...left, y: 35 } };
  stageFramePlacement(itemId, previous, left);
  const updates = autoLayoutFrames(carrier(), 'pair').map(({ target, authored }) => ({
    placement: { frameKey: target.frameKey, lookId: 'pair', rect: { ...authored, y: 80 } },
    baseline: authored,
  }));

  const published: LiveFramePlacement[][] = [];
  const unsubscribe = subscribeDrafts(() => {
    published.push([...(snapshotFramePlacementDraft(itemId)?.edits.values() ?? [])]);
  });
  try {
    stageFramePlacements(itemId, updates);
    expect(published).toEqual([[previous, ...updates.map(({ placement }) => placement)]]);
  } finally {
    unsubscribe();
  }
});
