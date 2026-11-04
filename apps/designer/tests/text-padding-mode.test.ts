/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { AnimatableProperty, Element, Keyframe, Padding } from '@cg/shared-schema';
import { MemoryKv, MemoryWorkspace } from '@cg/storage';
import { ProjectStore } from '../src/platform/ProjectStore.js';
import { designerStore, editSceneOf } from '../src/renderer/state/store.js';
import { defaultText } from '../src/renderer/state/element-defaults.js';
import { StyleSection } from '../src/renderer/features/inspector/StyleSection.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  if (root !== null) act(() => root!.unmount());
  root = null;
  container?.remove();
  container = null;
  designerStore._reset();
});

const SIDES = [
  'padding.top',
  'padding.right',
  'padding.bottom',
  'padding.left',
] as const satisfies readonly AnimatableProperty[];

function freshText(padding: Padding | undefined): void {
  const projects = new ProjectStore(new MemoryWorkspace(), new MemoryKv());
  const { scene } = projects.newScene('padding-mode', 'custom');
  designerStore.setScene(scene, null);
  designerStore.addElement({ ...defaultText('text-1', 40, 40), padding } as Element);
}

function current(): Element {
  const state = designerStore.get();
  return editSceneOf(state.scene, state.activeCompositionId)!.layers[0]!.children[0]!;
}

function padding(): unknown {
  return (current() as { padding?: unknown }).padding;
}

function tracks(): Record<string, { keyframes: Keyframe[] }> {
  return (
    (current() as { animation?: { tracks: Record<string, { keyframes: Keyframe[] }> } }).animation
      ?.tracks ?? {}
  );
}

function byValue(keyframe: Keyframe): Omit<Keyframe, 'id'> {
  const { id: _omit, ...rest } = keyframe;
  void _omit;
  return rest;
}

function renderCurrent(): HTMLDivElement {
  if (root !== null) act(() => root!.unmount());
  container?.remove();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() =>
    root!.render(createElement(StyleSection, { element: current(), selectedKeyframe: null })),
  );
  for (let i = 0; i < 20; i++) {
    const collapsed = container.querySelector<HTMLElement>('[aria-expanded="false"]');
    if (collapsed === null) break;
    act(() => collapsed.click());
  }
  return container;
}

function clickToggle(label: string): void {
  const rendered = renderCurrent();
  const button = rendered.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`);
  if (button === null) throw new Error(`no toggle button "${label}"`);
  act(() => button.click());
}

describe('D-172 — Text Padding mode', () => {
  it('writes the uniform static value through commitAnimatable', () => {
    freshText(undefined);
    designerStore.commitAnimatable('text-1', 'padding', 13);
    expect(padding()).toBe(13);
  });

  it('commits the uniform input through the ordinary animatable path', () => {
    freshText(undefined);
    const rendered = renderCurrent();
    const input = rendered.querySelector<HTMLInputElement>('input[aria-label="padding"]');
    if (input === null) throw new Error('no uniform padding input');

    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      setter?.call(input, '14');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });

    expect(padding()).toBe(14);
  });

  it('starts as one value and expands it into four labelled side controls', () => {
    freshText(12);
    const uniform = renderCurrent();
    expect(uniform.querySelector<HTMLInputElement>('input[aria-label="padding"]')?.value).toBe(
      '12',
    );
    expect(
      uniform.querySelector('[aria-label^="Toggle keyframe for padding at frame"]'),
    ).not.toBeNull();
    expect(uniform.querySelector('[aria-label="top padding"]')).toBeNull();

    clickToggle('Use per-side padding');
    expect(padding()).toEqual({ top: 12, right: 12, bottom: 12, left: 12 });

    const perSide = renderCurrent();
    for (const side of ['top', 'right', 'bottom', 'left']) {
      expect(
        perSide.querySelector<HTMLInputElement>(`input[aria-label="${side} padding"]`)?.value,
      ).toBe('12');
      expect(
        perSide.querySelector(`[aria-label^="Toggle keyframe for padding.${side} at frame"]`),
      ).not.toBeNull();
    }
    expect(perSide.querySelector('input[aria-label="padding"]')).toBeNull();
  });

  it('copies a uniform keyframe to every side with fresh ids', () => {
    freshText(8);
    designerStore.upsertKeyframe('text-1', 'padding', 0, 8, 'ease-in');
    designerStore.upsertKeyframe('text-1', 'padding', 25, 20, 'linear');
    const source = tracks()['padding']!.keyframes.map(byValue);

    clickToggle('Use per-side padding');

    const migrated = tracks();
    expect(migrated['padding']).toBeUndefined();
    const ids: string[] = [];
    for (const side of SIDES) {
      expect(migrated[side]!.keyframes.map(byValue)).toEqual(source);
      ids.push(...migrated[side]!.keyframes.map((keyframe) => keyframe.id!));
    }
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('uses top as the uniform representative and clears orphan side tracks', () => {
    freshText({ top: 5, right: 6, bottom: 7, left: 8 });
    designerStore.upsertKeyframe('text-1', 'padding.top', 0, 5, 'ease-out');
    designerStore.upsertKeyframe('text-1', 'padding.right', 0, 99, 'linear');
    const top = tracks()['padding.top']!.keyframes.map(byValue);

    clickToggle('Use a single padding value');

    expect(padding()).toBe(5);
    expect(tracks()['padding']!.keyframes.map(byValue)).toEqual(top);
    for (const side of SIDES) expect(tracks()[side]).toBeUndefined();
  });

  it('migrates the value and tracks as one undo entry', () => {
    freshText(9);
    designerStore.upsertKeyframe('text-1', 'padding', 0, 9, 'linear');
    const before = JSON.stringify(current());

    clickToggle('Use per-side padding');
    act(() => designerStore.undo());

    expect(JSON.stringify(current())).toBe(before);
  });
});
