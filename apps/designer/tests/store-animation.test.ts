import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AnimatableProperty, Element, ShapeElement } from '@cg/shared-schema';
import { MemoryKv, MemoryWorkspace } from '@cg/storage';
import { ProjectStore } from '../src/platform/ProjectStore.js';
import { designerStore, editSceneOf } from '../src/renderer/state/store.js';
import { defaultShape } from '../src/renderer/state/element-defaults.js';
import {
  effectiveAnimatableValue,
  effectiveColorAt,
  effectiveRowValue,
  effectiveTransformAt,
  keyframeVariantFor,
  timelineGroupsFor,
  type TimelineRow,
} from '../src/renderer/features/timeline/keyframe-helpers.js';
import { togglePropertyKeyframe } from '../src/renderer/features/inspector/TransformSection.js';
import { addOrToggleKeyframeAtFrame } from '../src/renderer/features/timeline/TrackRow.js';

/** Find the timeline row spec for `property` (the row the diamond is rendered for). */
function rowFor(el: Element, property: AnimatableProperty): TimelineRow {
  for (const group of timelineGroupsFor(el)) {
    for (const entry of group.rows) {
      if (entry.kind === 'animatable' && entry.row.property === property) return entry.row;
    }
  }
  throw new Error(`no timeline row for ${property}`);
}

function freshSceneWithShape(): ShapeElement {
  const projects = new ProjectStore(new MemoryWorkspace(), new MemoryKv());
  const { scene } = projects.newScene('anim-test', 'custom');
  designerStore.setScene(scene, null);
  const shape = defaultShape('el-1', 50, 60);
  designerStore.addElement(shape);
  return shape;
}

function selected(): Element {
  const state = designerStore.get();
  const el = editSceneOf(state.scene, state.activeCompositionId)!.layers[0]!.children[0]!;
  return el;
}

/** Children of the first layer of the active document (may be empty after deletes). */
function firstLayerChildren(): readonly Element[] {
  const state = designerStore.get();
  return editSceneOf(state.scene, state.activeCompositionId)!.layers[0]!.children;
}

beforeEach(() => {
  freshSceneWithShape();
});

afterEach(() => {
  designerStore._reset();
});

describe('designerStore — currentFrame + scrub', () => {
  it('setCurrentFrame clamps to the scene frameRange', () => {
    designerStore.setCurrentFrame(-10);
    expect(designerStore.get().currentFrame).toBe(0);
    designerStore.setCurrentFrame(1_000);
    expect(designerStore.get().currentFrame).toBe(50);
    designerStore.setCurrentFrame(25);
    expect(designerStore.get().currentFrame).toBe(25);
  });

  it('setCurrentFrame rounds non-integer scrub positions to the nearest frame', () => {
    designerStore.setCurrentFrame(7.4);
    expect(designerStore.get().currentFrame).toBe(7);
    designerStore.setCurrentFrame(7.6);
    expect(designerStore.get().currentFrame).toBe(8);
  });
});

describe('designerStore — upsertKeyframe', () => {
  it('creates a track + keyframe when none exists', () => {
    designerStore.setCurrentFrame(10);
    designerStore.upsertKeyframe('el-1', 'position.x', 10, 100);
    const el = selected();
    expect(el.animation?.tracks['position.x']?.keyframes).toMatchObject([
      { frame: 10, value: 100, easing: 'linear' },
    ]);
  });

  it('keeps keyframes sorted by frame on insert', () => {
    designerStore.upsertKeyframe('el-1', 'position.x', 30, 300);
    designerStore.upsertKeyframe('el-1', 'position.x', 10, 100);
    designerStore.upsertKeyframe('el-1', 'position.x', 20, 200);
    const el = selected();
    const frames = el.animation?.tracks['position.x']?.keyframes.map((k) => k.frame);
    expect(frames).toEqual([10, 20, 30]);
  });

  it('overwrites the keyframe value when the frame already has one (no duplicates)', () => {
    designerStore.upsertKeyframe('el-1', 'position.x', 15, 100);
    designerStore.upsertKeyframe('el-1', 'position.x', 15, 222);
    const kfs = selected().animation?.tracks['position.x']?.keyframes;
    expect(kfs).toHaveLength(1);
    expect(kfs?.[0]?.value).toBe(222);
  });
});

describe('designerStore — moveKeyframe', () => {
  it('moves a keyframe to a new frame and keeps the track sorted', () => {
    designerStore.upsertKeyframe('el-1', 'position.x', 5, 50);
    designerStore.upsertKeyframe('el-1', 'position.x', 25, 250);
    designerStore.moveKeyframe('el-1', 'position.x', 5, 40);
    const kfs = selected().animation?.tracks['position.x']?.keyframes;
    expect(kfs?.map((k) => k.frame)).toEqual([25, 40]);
    expect(kfs?.map((k) => k.value)).toEqual([250, 50]);
  });

  it('drops a colliding keyframe (moved one wins)', () => {
    designerStore.upsertKeyframe('el-1', 'position.x', 5, 50);
    designerStore.upsertKeyframe('el-1', 'position.x', 25, 250);
    designerStore.moveKeyframe('el-1', 'position.x', 5, 25);
    const kfs = selected().animation?.tracks['position.x']?.keyframes;
    expect(kfs).toHaveLength(1);
    expect(kfs?.[0]).toMatchObject({ frame: 25, value: 50, easing: 'linear' });
  });

  it('is a no-op when fromFrame has no keyframe', () => {
    designerStore.upsertKeyframe('el-1', 'position.x', 5, 50);
    designerStore.moveKeyframe('el-1', 'position.x', 999, 10);
    const kfs = selected().animation?.tracks['position.x']?.keyframes;
    expect(kfs).toMatchObject([{ frame: 5, value: 50, easing: 'linear' }]);
  });
});

describe('designerStore — moveKeyframeById (stacking)', () => {
  function ids(): string[] {
    return (selected().animation?.tracks['position.x']?.keyframes ?? []).map((k) => k.id ?? '');
  }

  it('upsert assigns a stable id to each keyframe', () => {
    designerStore.upsertKeyframe('el-1', 'position.x', 5, 50);
    designerStore.upsertKeyframe('el-1', 'position.x', 25, 250);
    const list = ids();
    expect(list).toHaveLength(2);
    expect(list[0]).toMatch(/^kf-/);
    expect(list[1]).not.toBe(list[0]);
  });

  it('moving a point onto another keeps BOTH (stacks on one frame)', () => {
    designerStore.upsertKeyframe('el-1', 'position.x', 5, 50);
    designerStore.upsertKeyframe('el-1', 'position.x', 25, 250);
    const movingId = ids()[0]!; // the one at frame 5
    designerStore.moveKeyframeById('el-1', 'position.x', movingId, 25);
    const kfs = selected().animation?.tracks['position.x']?.keyframes ?? [];
    expect(kfs).toHaveLength(2); // both kept
    expect(kfs.every((k) => k.frame === 25)).toBe(true);
    // The two distinct values are preserved (an instant step at frame 25).
    expect(new Set(kfs.map((k) => k.value))).toEqual(new Set([50, 250]));
  });

  it('a stacked point can be dragged back off the stack', () => {
    designerStore.upsertKeyframe('el-1', 'position.x', 25, 250);
    designerStore.upsertKeyframe('el-1', 'position.x', 5, 50);
    const movingId = (selected().animation?.tracks['position.x']?.keyframes ?? []).find(
      (k) => k.frame === 5,
    )!.id!;
    designerStore.moveKeyframeById('el-1', 'position.x', movingId, 25); // stack
    designerStore.moveKeyframeById('el-1', 'position.x', movingId, 40); // unstack
    const kfs = selected().animation?.tracks['position.x']?.keyframes ?? [];
    expect(kfs.map((k) => k.frame).sort((a, b) => a - b)).toEqual([25, 40]);
    expect(kfs.find((k) => k.id === movingId)?.frame).toBe(40);
  });
});

describe('designerStore — removeKeyframe', () => {
  it('drops the keyframe from the track', () => {
    designerStore.upsertKeyframe('el-1', 'position.x', 5, 50);
    designerStore.upsertKeyframe('el-1', 'position.x', 25, 250);
    designerStore.removeKeyframe('el-1', 'position.x', 5);
    const kfs = selected().animation?.tracks['position.x']?.keyframes;
    expect(kfs).toMatchObject([{ frame: 25, value: 250, easing: 'linear' }]);
  });

  it('removing the last keyframe prunes the track entry', () => {
    designerStore.upsertKeyframe('el-1', 'position.x', 5, 50);
    designerStore.removeKeyframe('el-1', 'position.x', 5);
    const el = selected();
    expect(el.animation).toBeUndefined();
  });
});

describe('designerStore — commitAnimatable (track-aware routing)', () => {
  it('updates the static value when the property has no track yet', () => {
    designerStore.setCurrentFrame(10);
    designerStore.commitAnimatable('el-1', 'position.x', 999);
    expect(selected().transform.position.x).toBe(999);
    expect(selected().animation).toBeUndefined();
  });

  it('replaces the keyframe value when a keyframe sits on the current frame', () => {
    designerStore.setCurrentFrame(20);
    designerStore.upsertKeyframe('el-1', 'position.x', 20, 200);
    designerStore.commitAnimatable('el-1', 'position.x', 555);
    const el = selected();
    expect(el.transform.position.x).toBe(50); // unchanged static
    const kfs = el.animation?.tracks['position.x']?.keyframes;
    expect(kfs).toHaveLength(1);
    expect(kfs?.[0]).toMatchObject({ frame: 20, value: 555 });
  });

  it('inserts a new keyframe at the current frame when the track already has one elsewhere', () => {
    // Author a keyframe at frame 10 first.
    designerStore.setCurrentFrame(10);
    designerStore.upsertKeyframe('el-1', 'position.x', 10, 100);
    // Move the playhead to frame 30 and edit the property as if dragging.
    designerStore.setCurrentFrame(30);
    designerStore.commitAnimatable('el-1', 'position.x', 777);
    const kfs = selected().animation?.tracks['position.x']?.keyframes;
    expect(kfs?.map((k) => ({ frame: k.frame, value: k.value }))).toEqual([
      { frame: 10, value: 100 },
      { frame: 30, value: 777 },
    ]);
    // Static must be unchanged once a track exists.
    expect(selected().transform.position.x).toBe(50);
  });

  it('updates static opacity off-track and inserts new opacity keyframe once a track exists', () => {
    designerStore.setCurrentFrame(5);
    designerStore.commitAnimatable('el-1', 'opacity', 0.5);
    expect(selected().opacity).toBe(0.5);

    // First keyframe establishes the track.
    designerStore.upsertKeyframe('el-1', 'opacity', 5, 0.5);
    designerStore.setCurrentFrame(15);
    designerStore.commitAnimatable('el-1', 'opacity', 0.2);
    const kfs = selected().animation?.tracks.opacity?.keyframes;
    expect(kfs?.map((k) => ({ frame: k.frame, value: k.value }))).toEqual([
      { frame: 5, value: 0.5 },
      { frame: 15, value: 0.2 },
    ]);
    expect(selected().opacity).toBe(0.5); // static unchanged
  });
});

describe('designerStore — selectedKeyframe', () => {
  it('setSelectedKeyframe stores the point reference', () => {
    designerStore.setSelectedKeyframe({ elementId: 'el-1', property: 'rotation', frame: 7 });
    expect(designerStore.get().selectedKeyframe).toEqual({
      elementId: 'el-1',
      property: 'rotation',
      frame: 7,
    });
    designerStore.setSelectedKeyframe(null);
    expect(designerStore.get().selectedKeyframe).toBeNull();
  });

  it('moveKeyframe of the selected point follows the new frame', () => {
    designerStore.upsertKeyframe('el-1', 'rotation', 10, 0);
    designerStore.setSelectedKeyframe({ elementId: 'el-1', property: 'rotation', frame: 10 });
    designerStore.moveKeyframe('el-1', 'rotation', 10, 25);
    expect(designerStore.get().selectedKeyframe).toEqual({
      elementId: 'el-1',
      property: 'rotation',
      frame: 25,
    });
  });

  it('removeKeyframe clears the selection when it referenced the removed point', () => {
    designerStore.upsertKeyframe('el-1', 'rotation', 10, 0);
    designerStore.setSelectedKeyframe({ elementId: 'el-1', property: 'rotation', frame: 10 });
    designerStore.removeKeyframe('el-1', 'rotation', 10);
    expect(designerStore.get().selectedKeyframe).toBeNull();
  });

  it('setKeyframeValue / setKeyframeEasing mutate the existing point in place', () => {
    designerStore.upsertKeyframe('el-1', 'scale.x', 12, 1.0);
    designerStore.setKeyframeValue('el-1', 'scale.x', 12, 2.5);
    designerStore.setKeyframeEasing('el-1', 'scale.x', 12, 'ease-in-out');
    const kf = selected().animation?.tracks['scale.x']?.keyframes[0];
    expect(kf).toMatchObject({ frame: 12, value: 2.5, easing: 'ease-in-out' });
  });

  it('setKeyframeBezier sets a custom curve (time components clamped) and clears it', () => {
    designerStore.upsertKeyframe('el-1', 'position.x', 8, 100);
    designerStore.setKeyframeBezier('el-1', 'position.x', 8, [1.5, 0.2, -0.3, 0.9]);
    let kf = selected().animation?.tracks['position.x']?.keyframes[0];
    expect(kf?.bezier).toEqual([1, 0.2, 0, 0.9]); // x's clamped to [0,1]
    designerStore.setKeyframeBezier('el-1', 'position.x', 8, null);
    kf = selected().animation?.tracks['position.x']?.keyframes[0];
    expect(kf?.bezier).toBeUndefined();
  });
});

describe('D-007 — top-level view routing + new-scene options', () => {
  it('store.view defaults to "landing"', () => {
    expect(designerStore.get().view).toBe('studio'); // after freshSceneWithShape
    designerStore.setScene(null, null);
    expect(designerStore.get().view).toBe('landing');
  });

  it('setScene(scene, path) flips view to "studio"', () => {
    designerStore.setScene(null, null);
    expect(designerStore.get().view).toBe('landing');
    // re-seat a scene via the platform path
    const projects = new ProjectStore(new MemoryWorkspace(), new MemoryKv());
    const { scene } = projects.newScene('back', 'custom');
    designerStore.setScene(scene, null);
    expect(designerStore.get().view).toBe('studio');
  });

  it('setView explicitly flips between landing and studio', () => {
    designerStore.setView('landing');
    expect(designerStore.get().view).toBe('landing');
    designerStore.setView('studio');
    expect(designerStore.get().view).toBe('studio');
  });

  it('ProjectStore.newScene honors resolution + frameRate overrides', () => {
    const projects = new ProjectStore(new MemoryWorkspace(), new MemoryKv());
    const { scene } = projects.newScene('opts', 'custom', {
      resolution: { width: 1280, height: 720 },
      frameRate: 25,
    });
    expect(scene.resolution).toEqual({ width: 1280, height: 720 });
    expect(scene.frameRate).toBe(25);
  });

  it('ProjectStore.newScene without options keeps the v1 defaults', () => {
    const projects = new ProjectStore(new MemoryWorkspace(), new MemoryKv());
    const { scene } = projects.newScene('defaults', 'custom');
    expect(scene.resolution).toEqual({ width: 1920, height: 1080 });
    expect(scene.frameRate).toBe(50);
  });
});

describe('B-002 — every keyframe on a track keeps its own distinct value', () => {
  it('three position.x keyframes can each hold a different value', () => {
    designerStore.upsertKeyframe('el-1', 'position.x', 0, 100);
    designerStore.upsertKeyframe('el-1', 'position.x', 25, 500);
    designerStore.upsertKeyframe('el-1', 'position.x', 50, 50);
    const kfs = selected().animation?.tracks['position.x']?.keyframes;
    expect(kfs?.map((k) => [k.frame, k.value])).toEqual([
      [0, 100],
      [25, 500],
      [50, 50],
    ]);
  });

  it('editing one keyframe does not touch the others (track-aware commit)', () => {
    designerStore.upsertKeyframe('el-1', 'position.x', 0, 100);
    designerStore.upsertKeyframe('el-1', 'position.x', 25, 500);
    designerStore.upsertKeyframe('el-1', 'position.x', 50, 50);
    // Scrub to frame 25 and re-commit a different value.
    designerStore.setCurrentFrame(25);
    designerStore.commitAnimatable('el-1', 'position.x', 999);
    const kfs = selected().animation?.tracks['position.x']?.keyframes;
    expect(kfs?.map((k) => [k.frame, k.value])).toEqual([
      [0, 100],
      [25, 999],
      [50, 50],
    ]);
  });
});

describe('B-005 — inspector diamond captures the evaluated value at the playhead', () => {
  it('the diamond at F2 adds a keyframe holding the F1 value, not the static base — no jump', () => {
    // A keyframe at F1=10 holds the moved value 300; the element's static base
    // stays at its default (50). At F2 the evaluated value clamps to 300.
    designerStore.upsertKeyframe('el-1', 'position.x', 10, 300);
    designerStore.setCurrentFrame(40);

    const before = selected();
    const staticBase = before.transform.position.x;
    expect(staticBase).toBe(50); // the OLD diamond captured this → the revert bug
    expect(effectiveAnimatableValue(before, 'position.x', 40, staticBase)).toBe(300);

    // Click the real diamond handler at F2.
    togglePropertyKeyframe(before, 'position.x', 40);

    const after = selected();
    const kf = after.animation?.tracks['position.x']?.keyframes.find((k) => k.frame === 40);
    expect(kf?.value).toBe(300); // captured the evaluated value V, not base 50
    // The shape does not jump: the value at F2 is unchanged after adding the key.
    expect(effectiveAnimatableValue(after, 'position.x', 40, after.transform.position.x)).toBe(300);
  });
});

describe('B-006 — colour field display tracks the evaluated value at the playhead', () => {
  it('editing a colour with a keyframe present updates both the keyframe (shape) and the displayed value', () => {
    // fill.color is animated; the static base stays at the shape default (#BEBEBE).
    designerStore.upsertKeyframe('el-1', 'fill.color', 0, '#FF0000');
    designerStore.setCurrentFrame(0);

    // Edit the colour — the working write path lands it as a keyframe at frame 0.
    designerStore.commitAnimatable('el-1', 'fill.color', '#00FF00');

    const el = selected();
    const staticFill = el.type === 'shape' && el.fill?.kind === 'solid' ? el.fill.color : '#000000';
    // The static value is NOT the edited colour — reading it (the old display path)
    // is exactly why the input looked stale while the shape changed.
    expect(staticFill).toBe('#BEBEBE');
    // The evaluated value the field now displays matches the shape (the keyframe).
    expect(effectiveColorAt(el, 'fill.color', 0, staticFill)).toBe('#00FF00');
    const kf = el.animation?.tracks['fill.color']?.keyframes.find((k) => k.frame === 0);
    expect(kf?.value).toBe('#00FF00'); // display and shape stay in sync
  });
});

describe('B-007 — timeline diamond add-keyframe captures the evaluated value (all value kinds)', () => {
  const F1 = 10;
  const F2 = 40;
  // One case per value KIND, to prove the single shared path handles them all.
  const cases: { name: string; property: AnimatableProperty; moved: number | string }[] = [
    { name: 'transform number (position.x)', property: 'position.x', moved: 200 },
    { name: 'dimension (size.w)', property: 'size.w', moved: 480 },
    { name: 'opacity (factored 0–1)', property: 'opacity', moved: 0.4 },
    { name: 'colour (fill.color, non-numeric)', property: 'fill.color', moved: '#FF0000' },
  ];

  for (const c of cases) {
    it(`${c.name}: diamond at F2 adds the moved value, not the stale base — no jump`, () => {
      // F1 holds the moved/edited value; the element's static base is unchanged.
      designerStore.upsertKeyframe('el-1', c.property, F1, c.moved);
      designerStore.setCurrentFrame(F2);

      const el = selected();
      const row = rowFor(el, c.property);
      // The OLD diamond captured `row.read(el)` — the stale base, which differs
      // from the moved value (that was the bug).
      expect(row.read(el)).not.toBe(c.moved);
      // The fixed diamond captures the EVALUATED value at F2 (held from F1).
      expect(effectiveRowValue(el, row, F2)).toBe(c.moved);

      // Click the real shared timeline diamond handler at F2.
      addOrToggleKeyframeAtFrame(el, row, F2);

      const after = selected();
      const kf = after.animation?.tracks[c.property]?.keyframes.find((k) => k.frame === F2);
      expect(kf?.value).toBe(c.moved); // captured the moved value, not the base
      // No jump: the evaluated value at F2 is unchanged after adding the keyframe.
      expect(effectiveRowValue(after, rowFor(after, c.property), F2)).toBe(c.moved);
    });
  }
});

describe('D-010 — timelineGroupsFor returns the right groups per element type', () => {
  it('a shape returns Transform · Path style · Border radius · Box Shadow · Filter', () => {
    const groups = timelineGroupsFor(selected());
    expect(groups.map((g) => g.title)).toEqual([
      'Transform',
      'Path Style',
      'Border Radius',
      // D-057 — shape's shadow group is relabelled "Box Shadow" (was "Drop Shadow").
      'Box Shadow',
      'Filter',
    ]);
  });

  it('Filter group always has the 9 CSS-filter rows', () => {
    const groups = timelineGroupsFor(selected());
    const filter = groups.find((g) => g.title === 'Filter');
    expect(filter?.rows).toHaveLength(9);
  });

  it('Path style rows for a shape read fill / stroke / stroke width / dasharray', () => {
    const groups = timelineGroupsFor(selected());
    const path = groups.find((g) => g.title === 'Path Style');
    expect(path?.rows.map((r) => (r.kind === 'display' ? r.row.label : r.row.label))).toEqual([
      'Fill',
      'Stroke',
      'Stroke width',
      'Stroke dasharray',
    ]);
  });
});

describe('D-010 — non-Transform properties are animatable', () => {
  it('commitAnimatable creates a track for cornerRadius (no track yet)', () => {
    designerStore.setCurrentFrame(0);
    designerStore.commitAnimatable('el-1', 'cornerRadius', 0); // sets static
    // First keyframe author needs an explicit upsert (track-aware
    // commitAnimatable falls back to static when no track exists yet).
    designerStore.upsertKeyframe('el-1', 'cornerRadius', 10, 12);
    expect(selected().animation?.tracks.cornerRadius?.keyframes).toMatchObject([
      { frame: 10, value: 12, easing: 'linear' },
    ]);
  });

  it('writeStaticAnimatable for filter.blur patches element.filter.blur', () => {
    designerStore.writeStaticAnimatable('el-1', 'filter.blur', 4);
    expect(selected().filter?.blur).toBe(4);
  });

  it('writeStaticAnimatable for padding.top patches text padding (no-op on shape)', () => {
    designerStore.writeStaticAnimatable('el-1', 'padding.top', 8);
    // selected() is a shape from freshSceneWithShape — padding is text-only
    expect((selected() as unknown as { padding?: unknown }).padding).toBeUndefined();
  });

  it('writeStaticAnimatable for stroke.width patches element.stroke.width', () => {
    designerStore.writeStaticAnimatable('el-1', 'stroke.width', 3);
    const stroke = (selected() as unknown as { stroke?: { width: number } }).stroke;
    expect(stroke?.width).toBe(3);
  });

  it('writeStaticAnimatable for shadow.offsetY creates shadow on a shape', () => {
    designerStore.writeStaticAnimatable('el-1', 'shadow.offsetY', 6);
    const shadow = (selected() as unknown as { shadow?: { offsetY: number } }).shadow;
    expect(shadow?.offsetY).toBe(6);
  });

  it('writeStaticAnimatable for fill.color updates the shape fill', () => {
    designerStore.writeStaticAnimatable('el-1', 'fill.color', '#FF0000');
    const fill = (selected() as unknown as { fill?: { color: string } }).fill;
    expect(fill?.color).toBe('#FF0000');
  });

  it('writeStaticAnimatable for stroke.color seeds a stroke on a shape', () => {
    designerStore.writeStaticAnimatable('el-1', 'stroke.color', '#00FF00');
    const stroke = (selected() as unknown as { stroke?: { color: string } }).stroke;
    expect(stroke?.color).toBe('#00FF00');
  });

  it('writeStaticAnimatable for shadow.color updates shadow colour', () => {
    designerStore.writeStaticAnimatable('el-1', 'shadow.color', '#123456');
    const shadow = (selected() as unknown as { shadow?: { color: string } }).shadow;
    expect(shadow?.color).toBe('#123456');
  });

  it('commitAnimatable accepts a colour string and upserts a keyframe', () => {
    designerStore.upsertKeyframe('el-1', 'fill.color', 5, '#AAAAAA');
    // Track now exists, so commit routes to upsert at currentFrame.
    designerStore.setCurrentFrame(20);
    designerStore.commitAnimatable('el-1', 'fill.color', '#BBBBBB');
    const kfs = selected().animation?.tracks['fill.color']?.keyframes;
    expect(kfs?.map((k) => [k.frame, k.value])).toEqual([
      [5, '#AAAAAA'],
      [20, '#BBBBBB'],
    ]);
  });
});

describe('B-003 — keyframeVariantFor collapses to empty / at-frame', () => {
  it('returns empty when the property has no track', () => {
    expect(keyframeVariantFor(selected(), 'position.x', 10, null)).toBe('empty');
  });

  it('returns empty when the track exists but no keyframe at the current frame', () => {
    designerStore.upsertKeyframe('el-1', 'position.x', 10, 100);
    expect(keyframeVariantFor(selected(), 'position.x', 0, null)).toBe('empty');
  });

  it('returns at-frame when there IS a keyframe at the current frame', () => {
    designerStore.upsertKeyframe('el-1', 'position.x', 10, 100);
    expect(keyframeVariantFor(selected(), 'position.x', 10, null)).toBe('at-frame');
  });

  it('ignores selectedKeyframe — selection state never affects the indicator', () => {
    designerStore.upsertKeyframe('el-1', 'position.x', 10, 100);
    const sel = { elementId: 'el-1', property: 'position.x' as const, frame: 10 };
    // Selected keyframe at the current frame is still just 'at-frame'
    // (the lane diamond, not the indicator, reflects selection).
    expect(keyframeVariantFor(selected(), 'position.x', 10, sel)).toBe('at-frame');
    // Selected keyframe at a different frame leaves the indicator 'empty'.
    expect(keyframeVariantFor(selected(), 'position.x', 5, sel)).toBe('empty');
  });
});

describe('effectiveTransformAt — Gizmo / drag use interpolated values', () => {
  it('falls back to the static transform when no track exists', () => {
    const t = effectiveTransformAt(selected(), 10);
    expect(t.position).toEqual({ x: 50, y: 60 });
    expect(t.size).toEqual({ w: 320, h: 120 });
  });

  it('interpolates between two position.x keyframes', () => {
    designerStore.upsertKeyframe('el-1', 'position.x', 0, 100);
    designerStore.upsertKeyframe('el-1', 'position.x', 10, 200);
    const t = effectiveTransformAt(selected(), 5);
    expect(t.position.x).toBe(150);
    // Untouched static fields keep their static value
    expect(t.position.y).toBe(60);
    expect(t.size.w).toBe(320);
  });

  it('clamps to first keyframe before its frame', () => {
    designerStore.upsertKeyframe('el-1', 'position.x', 10, 200);
    const t = effectiveTransformAt(selected(), 0);
    expect(t.position.x).toBe(200);
  });

  it('clamps to last keyframe after its frame', () => {
    designerStore.upsertKeyframe('el-1', 'position.x', 0, 100);
    designerStore.upsertKeyframe('el-1', 'position.x', 10, 200);
    const t = effectiveTransformAt(selected(), 999);
    expect(t.position.x).toBe(200);
  });
});

describe('B-002 — single-click vs double-click on a timeline diamond', () => {
  it('setSelectedKeyframe alone does NOT open the keyframe inspector', () => {
    designerStore.upsertKeyframe('el-1', 'opacity', 8, 0.5);
    designerStore.setSelectedKeyframe({ elementId: 'el-1', property: 'opacity', frame: 8 });
    expect(designerStore.get().selectedKeyframe).toEqual({
      elementId: 'el-1',
      property: 'opacity',
      frame: 8,
    });
    expect(designerStore.get().keyframeInspectorOpen).toBe(false);
  });

  it('openKeyframeInspector flips the flag (the double-click path)', () => {
    designerStore.upsertKeyframe('el-1', 'opacity', 8, 0.5);
    designerStore.openKeyframeInspector({
      elementId: 'el-1',
      property: 'opacity',
      frame: 8,
    });
    const s = designerStore.get();
    expect(s.selectedKeyframe).toEqual({ elementId: 'el-1', property: 'opacity', frame: 8 });
    expect(s.keyframeInspectorOpen).toBe(true);
  });

  it('closeKeyframeInspector clears the flag but keeps the selection', () => {
    designerStore.upsertKeyframe('el-1', 'opacity', 8, 0.5);
    designerStore.openKeyframeInspector({
      elementId: 'el-1',
      property: 'opacity',
      frame: 8,
    });
    designerStore.closeKeyframeInspector();
    const s = designerStore.get();
    expect(s.keyframeInspectorOpen).toBe(false);
    expect(s.selectedKeyframe).toEqual({ elementId: 'el-1', property: 'opacity', frame: 8 });
  });

  it('single-clicking another keyframe closes the previously-opened inspector', () => {
    designerStore.upsertKeyframe('el-1', 'opacity', 8, 0.5);
    designerStore.upsertKeyframe('el-1', 'opacity', 20, 0.9);
    designerStore.openKeyframeInspector({
      elementId: 'el-1',
      property: 'opacity',
      frame: 8,
    });
    // Single-click on a DIFFERENT diamond.
    designerStore.setSelectedKeyframe({ elementId: 'el-1', property: 'opacity', frame: 20 });
    expect(designerStore.get().keyframeInspectorOpen).toBe(false);
    expect(designerStore.get().selectedKeyframe?.frame).toBe(20);
  });

  it('re-clicking the same diamond keeps the inspector open if it was open', () => {
    designerStore.upsertKeyframe('el-1', 'opacity', 8, 0.5);
    designerStore.openKeyframeInspector({
      elementId: 'el-1',
      property: 'opacity',
      frame: 8,
    });
    designerStore.setSelectedKeyframe({ elementId: 'el-1', property: 'opacity', frame: 8 });
    expect(designerStore.get().keyframeInspectorOpen).toBe(true);
  });
});

describe('designerStore — deleteSelection (Delete/Backspace precedence)', () => {
  it('keyframe selected → deletes the keyframe, keeps the layer/shape', () => {
    designerStore.setSelection(['el-1']);
    designerStore.upsertKeyframe('el-1', 'position.x', 10, 100);
    designerStore.setSelectedKeyframe({ elementId: 'el-1', property: 'position.x', frame: 10 });
    expect(designerStore.get().selectedKeyframes).toHaveLength(1);

    designerStore.deleteSelection();

    // Keyframe (its whole track, last point removed) is gone…
    expect(selected().animation).toBeUndefined();
    // …but the element is still there.
    expect(firstLayerChildren()).toHaveLength(1);
  });

  it('no keyframe selected → deletes the selected layer/shape', () => {
    designerStore.setSelection(['el-1']);
    expect(designerStore.get().selectedKeyframes).toHaveLength(0);

    designerStore.deleteSelection();

    expect(firstLayerChildren()).toHaveLength(0);
  });

  it('multi-select: deletes ALL selected keyframes (layer kept)', () => {
    designerStore.setSelection(['el-1']);
    designerStore.upsertKeyframe('el-1', 'position.x', 10, 100);
    designerStore.upsertKeyframe('el-1', 'position.x', 20, 200);
    designerStore.setSelectedKeyframe({ elementId: 'el-1', property: 'position.x', frame: 10 });
    designerStore.addKeyframeToSelection({ elementId: 'el-1', property: 'position.x', frame: 20 });
    expect(designerStore.get().selectedKeyframes).toHaveLength(2);

    designerStore.deleteSelection();

    expect(selected().animation).toBeUndefined(); // both points gone → track dropped
    expect(firstLayerChildren()).toHaveLength(1);
  });

  it('multi-select: with no keyframe, deletes ALL selected layers/shapes', () => {
    designerStore.addElement(defaultShape('el-2', 10, 20));
    designerStore.setSelection(['el-1', 'el-2']);

    designerStore.deleteSelection();

    expect(firstLayerChildren()).toHaveLength(0);
  });

  it('nothing selected → no-op', () => {
    designerStore.setSelection([]);
    designerStore.deleteSelection();
    expect(firstLayerChildren()).toHaveLength(1);
  });

  it('delete is a single undo step (restores everything it removed)', () => {
    designerStore.addElement(defaultShape('el-2', 10, 20));
    designerStore.setSelection(['el-1', 'el-2']);

    designerStore.markHistoryBoundary();
    designerStore.deleteSelection();
    expect(firstLayerChildren()).toHaveLength(0);

    designerStore.undo();
    expect(firstLayerChildren()).toHaveLength(2);
  });
});
