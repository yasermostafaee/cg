import { afterEach, describe, expect, it } from 'vitest';
import type { AnimatableProperty, Element, TextElement } from '@cg/shared-schema';
import { MemoryKv, MemoryWorkspace } from '@cg/storage';
import { ProjectStore } from '../src/platform/ProjectStore.js';
import { designerStore, editSceneOf } from '../src/renderer/state/store.js';
import { defaultText } from '../src/renderer/state/element-defaults.js';
import {
  hasSizeKeyframes,
  switchTextToAutoSize,
  switchTextToFixedSize,
} from '../src/renderer/features/inspector/sizing-commit.js';

/**
 * D-046 — the sizing=auto guard (store side). Switching a text element to Auto when it
 * has size keyframes must delete them (they become content-driven) as ONE undo step;
 * Auto→Fixed commits the measured size once (here the preview isn't registered, so it
 * falls back to transform.size). The confirm MODAL is exercised by the E2E.
 */

function freshScene(): void {
  const projects = new ProjectStore(new MemoryWorkspace(), new MemoryKv());
  const { scene } = projects.newScene('d046', 'custom');
  designerStore.setScene(scene, null);
}
function selected(id: string): Element {
  const st = designerStore.get();
  const doc = editSceneOf(st.scene, st.activeCompositionId)!;
  return doc.layers[0]!.children.find((c) => c.id === id)!;
}
function trackOf(id: string, p: AnimatableProperty): { keyframes: unknown[] } | undefined {
  return selected(id).animation?.tracks[p] as { keyframes: unknown[] } | undefined;
}
const fitOf = (id: string): string => (selected(id) as TextElement).fitMode;

afterEach(() => designerStore._reset());

describe('D-046 — hasSizeKeyframes', () => {
  it('is false with no tracks and true once size.w or size.h has a keyframe', () => {
    freshScene();
    designerStore.addElement(defaultText('t', 0, 0));
    expect(hasSizeKeyframes(selected('t'))).toBe(false);
    designerStore.upsertKeyframe('t', 'size.h', 0, 50);
    expect(hasSizeKeyframes(selected('t'))).toBe(true);
  });
});

describe('D-046 — switch to Auto deletes size keyframes as one undo step', () => {
  it('sets autosize, removes size.w/size.h, and one undo restores both', () => {
    freshScene();
    designerStore.addElement(defaultText('t', 0, 0)); // defaults to fitMode 'fixed'
    designerStore.upsertKeyframe('t', 'size.w', 0, 100);
    designerStore.upsertKeyframe('t', 'size.h', 0, 50);
    expect(fitOf('t')).toBe('fixed');

    switchTextToAutoSize(['t']);
    expect(fitOf('t')).toBe('autosize');
    expect(trackOf('t', 'size.w')).toBeUndefined();
    expect(trackOf('t', 'size.h')).toBeUndefined();

    designerStore.undo();
    expect(fitOf('t')).toBe('fixed');
    expect(trackOf('t', 'size.w')?.keyframes).toHaveLength(1);
    expect(trackOf('t', 'size.h')?.keyframes).toHaveLength(1);
  });

  it('multi-select aggregate: all switch, deletes where present, one undo reverts all', () => {
    freshScene();
    designerStore.addElement(defaultText('a', 0, 0));
    designerStore.addElement(defaultText('b', 0, 0));
    designerStore.upsertKeyframe('a', 'size.w', 0, 120); // only 'a' has a size keyframe

    switchTextToAutoSize(['a', 'b']);
    expect(fitOf('a')).toBe('autosize');
    expect(fitOf('b')).toBe('autosize');
    expect(trackOf('a', 'size.w')).toBeUndefined();

    designerStore.undo();
    expect(fitOf('a')).toBe('fixed');
    expect(fitOf('b')).toBe('fixed');
    expect(trackOf('a', 'size.w')?.keyframes).toHaveLength(1);
  });
});

describe('D-046 §E — Auto→Fixed commits a size (falls back to transform.size with no preview)', () => {
  it('sets fixed and keeps the existing transform.size when no measurement is available', () => {
    freshScene();
    designerStore.addElement(defaultText('t', 0, 0));
    designerStore.updateElement('t', { fitMode: 'autosize' } as Partial<Element>);
    const before = (selected('t') as TextElement).transform.size;

    switchTextToFixedSize(selected('t') as TextElement);

    const el = selected('t') as TextElement;
    expect(el.fitMode).toBe('fixed');
    // No preview document registered in the test env → measureElementSceneSize → null →
    // the one-shot commit falls back to the existing size (no snap to zero/garbage).
    expect(el.transform.size).toEqual(before);
  });
});
