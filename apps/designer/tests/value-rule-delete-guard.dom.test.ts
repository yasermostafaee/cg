/** @vitest-environment jsdom */
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Element, Scene } from '@cg/shared-schema';
import { MemoryKv, MemoryWorkspace } from '@cg/storage';
import { ProjectStore } from '../src/platform/ProjectStore.js';
import { ElementDeleteGuardDialog } from '../src/renderer/features/shell/ElementDeleteGuardDialog.js';
import {
  cancelElementDelete,
  pendingElementDelete,
  requestDeleteSelection,
  resetElementDeleteGuard,
} from '../src/renderer/features/shell/element-delete-guard.js';
import { defaultShape, defaultText } from '../src/renderer/state/element-defaults.js';
import { designerStore, editSceneOf } from '../src/renderer/state/store.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLDivElement;

function currentScene(): Scene {
  const state = designerStore.get();
  const scene = editSceneOf(state.scene, state.activeCompositionId);
  if (scene === null) throw new Error('no edit scene');
  return scene;
}

function findElement(id: string): Element | undefined {
  return currentScene()
    .layers.flatMap((layer) => layer.children)
    .find((element) => element.id === id);
}

beforeEach(() => {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  const { scene } = new ProjectStore(new MemoryWorkspace(), new MemoryKv()).newScene(
    'delete guard',
    'custom',
  );
  designerStore.setScene(scene, null);
  designerStore.addElement(defaultText('temperature-source', 0, 0));
  designerStore.addElement({
    ...defaultShape('temperature-badge', 0, 0),
    name: 'Temperature badge',
  });
  designerStore.setElementDataKey('temperature-source', 'temperature');
  designerStore.updateElement('temperature-badge', {
    valueRules: {
      input: { kind: 'field', fieldId: 'temperature' },
      rules: [
        {
          condition: { comparator: '>=', value: 30 },
          effect: {
            elementId: 'temperature-badge',
            property: 'fill',
            value: '#ff0000',
          },
        },
      ],
    },
  });
  designerStore.setSelection(['temperature-source']);
  act(() => root.render(createElement(ElementDeleteGuardDialog)));
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  resetElementDeleteGuard();
  designerStore._reset();
});

describe('D-180 — deleting a Value-rule input', () => {
  it('warns with the affected element and cancel changes nothing', () => {
    act(() => requestDeleteSelection());

    expect(document.querySelector('[role="dialog"]')?.textContent).toContain('Temperature badge');
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain('temperature');
    expect(findElement('temperature-source')).toBeDefined();

    act(() => cancelElementDelete());
    expect(pendingElementDelete()).toBeNull();
    expect(findElement('temperature-source')).toBeDefined();
    expect(findElement('temperature-badge')?.valueRules).toBeDefined();
  });

  it('confirmation removes the source and its dependent rules without retargeting', () => {
    act(() => requestDeleteSelection());
    const confirm = [...document.querySelectorAll<HTMLButtonElement>('button')].find((button) =>
      button.textContent?.includes('Delete elements and rules'),
    );
    act(() => confirm?.click());

    expect(findElement('temperature-source')).toBeUndefined();
    expect(findElement('temperature-badge')).toBeDefined();
    expect(findElement('temperature-badge')?.valueRules).toBeUndefined();
    expect(currentScene().fields.some((field) => field.id === 'temperature')).toBe(false);
  });

  it('a direct store deletion still cascades the rules for non-UI callers', () => {
    act(() => designerStore.removeElement('temperature-source'));
    expect(findElement('temperature-badge')?.valueRules).toBeUndefined();
  });
});
