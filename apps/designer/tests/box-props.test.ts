import { afterEach, describe, expect, it } from 'vitest';
import { MemoryKv, MemoryWorkspace } from '@cg/storage';
import { ProjectStore } from '../src/platform/ProjectStore.js';
import { designerStore, editSceneOf } from '../src/renderer/state/store.js';
import {
  defaultClock,
  defaultSequence,
  defaultShape,
  defaultText,
  defaultTicker,
} from '../src/renderer/state/element-defaults.js';
import {
  descriptorsForKind,
  isKeyframeable,
} from '../src/renderer/features/inspector/field-registry.js';
import { hasKeyframeAt } from '../src/renderer/features/timeline/keyframe-helpers.js';
import type { Element } from '@cg/shared-schema';

afterEach(() => designerStore._reset());

function freshScene(): void {
  const projects = new ProjectStore(new MemoryWorkspace(), new MemoryKv());
  const { scene } = projects.newScene('demo', 'lower-third');
  designerStore.setScene(scene, null);
}
function layer() {
  const st = designerStore.get();
  return editSceneOf(st.scene, st.activeCompositionId)!.layers[0]!;
}
function elById(id: string): Element {
  return layer().children.find((c) => c.id === id)!;
}
const props = (type: Element['type']): string[] => descriptorsForKind(type).map((d) => d.property);

describe('D-042 — box-style registry presence + keyframe-ability', () => {
  it('only shape + text expose stroke + cornerRadius (D-056); content-driven kinds + repeater/image expose neither', () => {
    for (const t of ['shape', 'text'] as const) {
      expect(props(t)).toEqual(
        expect.arrayContaining(['stroke.color', 'stroke.width', 'stroke.dash', 'cornerRadius']),
      );
    }
    // D-056 — ticker/clock/sequence no longer carry box styling.
    for (const t of ['ticker', 'clock', 'sequence', 'repeater', 'image'] as const) {
      expect(props(t)).not.toContain('stroke.width');
      expect(props(t)).not.toContain('cornerRadius');
    }
  });

  it('stroke + cornerRadius are keyframe-able on shapes only (D-056); text stroke static + radius animates; content-driven kinds expose neither', () => {
    expect(isKeyframeable(defaultShape('s', 0, 0), 'stroke.width')).toBe(true);
    expect(isKeyframeable(defaultShape('s', 0, 0), 'cornerRadius')).toBe(true);
    // Text: stroke stays static; cornerRadius animates (unchanged).
    expect(isKeyframeable(defaultText('t', 0, 0), 'stroke.width')).toBe(false);
    expect(isKeyframeable(defaultText('t', 0, 0), 'cornerRadius')).toBe(true);
    // D-056 — content-driven kinds expose no stroke / cornerRadius at all.
    for (const el of [
      defaultTicker('k', 0, 0),
      defaultClock('c', 0, 0),
      defaultSequence('q', 0, 0),
    ]) {
      expect(isKeyframeable(el, 'stroke.width')).toBe(false);
      expect(isKeyframeable(el, 'cornerRadius')).toBe(false);
    }
  });

  it('per-corner sub-tracks are keyframe-able only in per-corner mode; the uniform value only in uniform mode', () => {
    const uniform = { ...defaultText('u', 0, 0), cornerRadius: 6 } as Element;
    expect(isKeyframeable(uniform, 'cornerRadius')).toBe(true);
    expect(isKeyframeable(uniform, 'cornerRadius.tl')).toBe(false);

    const perCorner = { ...defaultText('p', 0, 0), cornerRadius: [1, 2, 3, 4] } as Element;
    expect(isKeyframeable(perCorner, 'cornerRadius')).toBe(false);
    for (const c of [
      'cornerRadius.tl',
      'cornerRadius.tr',
      'cornerRadius.br',
      'cornerRadius.bl',
    ] as const)
      expect(isKeyframeable(perCorner, c)).toBe(true);
  });
});

describe('D-042 — store writes for the box style', () => {
  it('writeStaticAnimatable on a per-corner sub-prop sets one corner of the tuple', () => {
    freshScene();
    designerStore.addElement({ ...defaultText('t', 0, 0), cornerRadius: [1, 2, 3, 4] } as Element);
    designerStore.writeStaticAnimatable('t', 'cornerRadius.br', 9);
    expect((elById('t') as { cornerRadius?: unknown }).cornerRadius).toEqual([1, 2, 9, 4]);
  });

  it('writing a corner on a uniform (number) radius coerces it to a tuple', () => {
    freshScene();
    designerStore.addElement({ ...defaultText('t', 0, 0), cornerRadius: 5 } as Element);
    designerStore.writeStaticAnimatable('t', 'cornerRadius.tl', 12);
    expect((elById('t') as { cornerRadius?: unknown }).cornerRadius).toEqual([12, 5, 5, 5]);
  });

  it('D-056 — a static stroke write is a no-op on the content-driven kinds (boxKind narrowed to shape/text)', () => {
    freshScene();
    designerStore.addElement(defaultTicker('tk', 0, 0));
    designerStore.writeStaticAnimatable('tk', 'stroke.width', 4);
    designerStore.writeStaticAnimatable('tk', 'stroke.color', '#FF0000');
    expect((elById('tk') as { stroke?: unknown }).stroke).toBeUndefined();
  });

  it('regression — static stroke writes still work on shape and text (boxKind keeps shape/text)', () => {
    freshScene();
    designerStore.addElement(defaultShape('s', 0, 0));
    designerStore.writeStaticAnimatable('s', 'stroke.width', 3);
    expect((elById('s') as { stroke?: { width: number } }).stroke?.width).toBe(3);
    designerStore.addElement(defaultText('t', 0, 0));
    designerStore.writeStaticAnimatable('t', 'stroke.color', '#00FF00');
    expect((elById('t') as { stroke?: { color: string } }).stroke?.color).toBe('#00FF00');
  });
});

describe('D-042 — collapsing per-corner to uniform drops the sub-tracks in one undo (B-014 class)', () => {
  it('clears tl/tr/br/bl tracks as one undo step; one undo restores both value and tracks', () => {
    freshScene();
    designerStore.addElement({ ...defaultText('t', 0, 0), cornerRadius: [4, 8, 4, 8] } as Element);
    const f = designerStore.get().currentFrame;
    // Keyframe two corners (per-corner mode).
    designerStore.upsertKeyframe('t', 'cornerRadius.tl', f, 4);
    designerStore.upsertKeyframe('t', 'cornerRadius.tr', f, 8);
    expect(hasKeyframeAt(elById('t'), 'cornerRadius.tl', f)).toBe(true);
    designerStore.markHistoryBoundary();

    // Collapse to uniform — the BorderRadiusSection toggle's commit: set the scalar
    // value AND drop the per-corner tracks in ONE history entry.
    designerStore.runAsSingleHistoryEntry(() => {
      designerStore.updateElement('t', { cornerRadius: 4 } as Element);
      for (const c of [
        'cornerRadius.tl',
        'cornerRadius.tr',
        'cornerRadius.br',
        'cornerRadius.bl',
      ] as const)
        designerStore.clearKeyframeTrack('t', c);
    });
    expect((elById('t') as { cornerRadius?: unknown }).cornerRadius).toBe(4);
    expect(hasKeyframeAt(elById('t'), 'cornerRadius.tl', f)).toBe(false);
    expect(hasKeyframeAt(elById('t'), 'cornerRadius.tr', f)).toBe(false);

    // One undo restores the per-corner tuple AND its keyframe tracks (no orphans).
    designerStore.undo();
    expect((elById('t') as { cornerRadius?: unknown }).cornerRadius).toEqual([4, 8, 4, 8]);
    expect(hasKeyframeAt(elById('t'), 'cornerRadius.tl', f)).toBe(true);
    expect(hasKeyframeAt(elById('t'), 'cornerRadius.tr', f)).toBe(true);
  });
});
