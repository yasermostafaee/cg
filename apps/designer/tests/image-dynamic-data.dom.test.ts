/** @vitest-environment jsdom */
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ImageElement, Scene } from '@cg/shared-schema';
import { MemoryKv, MemoryWorkspace } from '@cg/storage';
import { ProjectStore } from '../src/platform/ProjectStore.js';
import { DynamicDataSection } from '../src/renderer/features/inspector/DynamicDataSection.js';
import { defaultImage } from '../src/renderer/state/element-defaults.js';
import { designerStore, editSceneOf } from '../src/renderer/state/store.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLDivElement;

function projected(): Scene {
  const state = designerStore.get();
  const scene = editSceneOf(state.scene, state.activeCompositionId);
  if (scene === null) throw new Error('no active composition');
  return scene;
}

function logo(): ImageElement {
  const element = projected()
    .layers.flatMap((layer) => layer.children)
    .find((item) => item.id === 'logo');
  if (element === undefined || element.type !== 'image') throw new Error('no logo image');
  return element;
}

function render(): void {
  act(() =>
    root.render(createElement(DynamicDataSection, { element: logo(), scene: projected() })),
  );
}

beforeEach(() => {
  (window as unknown as { cg: unknown }).cg = {
    assets: {
      list: () => Promise.resolve([]),
      onImported: () => () => undefined,
    },
    sharedImages: {
      list: () => Promise.resolve([]),
      onImported: () => () => undefined,
    },
  };
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  const { scene } = new ProjectStore(new MemoryWorkspace(), new MemoryKv()).newScene(
    'image-data',
    'custom',
  );
  designerStore.setScene(scene, null);
  designerStore.addElement(defaultImage('logo', 0, 0, 'team-logo'));
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  designerStore._reset();
});

describe('dynamic image authoring', () => {
  it('exposes a normal Data key and authored operator image controls', () => {
    render();
    act(() =>
      host.querySelector<HTMLButtonElement>('[aria-label="Toggle Dynamic / Data"]')?.click(),
    );
    const input = host.querySelector<HTMLInputElement>('input[aria-label="Data key"]');
    if (input === null) throw new Error('Data key input missing');

    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      setter?.call(input, 'teamLogo');
      input.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    });
    render();

    expect(projected().fields).toContainEqual(
      expect.objectContaining({
        id: 'teamLogo',
        type: 'image',
        defaultAssetId: 'team-logo',
        inputMode: 'choices',
        assetOptions: [expect.objectContaining({ assetId: 'team-logo', source: 'project' })],
      }),
    );
    expect(projected().bindings).toContainEqual({
      fieldId: 'teamLogo',
      target: { kind: 'image', elementId: 'logo' },
    });
    expect(host.textContent).toContain('Operator control');
    expect(host.textContent).toContain('Choose images');
    expect(host.textContent).toContain('SVG is supported');
  });
});
