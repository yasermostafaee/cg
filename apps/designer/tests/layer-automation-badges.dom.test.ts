/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { Element, Scene } from '@cg/shared-schema';
import { MemoryKv, MemoryWorkspace } from '@cg/storage';
import { ProjectStore } from '../src/platform/ProjectStore.js';
import { defaultClock, defaultShape } from '../src/renderer/state/element-defaults.js';
import { designerStore, editSceneOf } from '../src/renderer/state/store.js';
import { TimelineDock } from '../src/renderer/features/timeline/TimelineDock.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  const { scene } = new ProjectStore(new MemoryWorkspace(), new MemoryKv()).newScene(
    'badges',
    'custom',
  );
  designerStore.setScene(scene, null);
  designerStore.addElement(defaultShape('badge', 0, 0));
  designerStore.addElement(defaultClock('clock', 0, 0));
  designerStore.updateElement('badge', {
    valueRules: {
      input: { kind: 'field', fieldId: 'temperature' },
      rules: [
        {
          condition: { comparator: '>=', value: 30 },
          effect: { elementId: 'badge', property: 'fill', value: '#ff0000' },
        },
      ],
    },
  } as Partial<Element>);
  designerStore.updateElement('clock', {
    mode: 'countdown',
    target: { kind: 'duration', ms: 60_000 },
    steps: {
      steps: [
        {
          name: 'At zero',
          atMs: 0,
          changes: [{ elementId: 'badge', property: 'visible', value: false }],
        },
      ],
    },
  } as Partial<Element>);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  designerStore._reset();
});

function mount(): void {
  const st = designerStore.get();
  const scene = editSceneOf(st.scene, st.activeCompositionId) as Scene;
  act(() => {
    root.render(
      createElement(TimelineDock, {
        scene,
        selection: new Set<string>(),
        selectedKeyframe: null,
        selectedKeyframes: [],
      }),
    );
  });
}

describe('D-203 — Timeline automation badges', () => {
  it('shows Rule on its owner and Step on both the countdown and its explicit target', () => {
    mount();
    const badgeRow = host.querySelector<HTMLElement>('[data-element-id="badge"]');
    const clockRow = host.querySelector<HTMLElement>('[data-element-id="clock"]');
    expect(badgeRow?.querySelector('[data-testid="layer-has-rules"]')).not.toBeNull();
    expect(badgeRow?.querySelector('[data-testid="layer-has-steps"]')).not.toBeNull();
    expect(clockRow?.querySelector('[data-testid="layer-has-rules"]')).toBeNull();
    expect(clockRow?.querySelector('[data-testid="layer-has-steps"]')).not.toBeNull();
  });
});
