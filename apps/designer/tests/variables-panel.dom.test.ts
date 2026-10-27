/** @vitest-environment jsdom */
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import type {
  Composition,
  CompositionFieldGroup,
  DynamicField,
  Element,
  Layer,
  Scene,
} from '@cg/shared-schema';
import { MemoryKv, MemoryWorkspace } from '@cg/storage';
import { ProjectStore } from '../src/platform/ProjectStore.js';
import { DesignerRightPanel } from '../src/renderer/features/fields/DesignerRightPanel.js';
import { namespaceHasFields } from '../src/renderer/features/fields/FieldsPanel.js';
import { fixedFileFieldId } from '../src/renderer/features/fields/fixedFileField.js';
import { designerStore, editSceneOf } from '../src/renderer/state/store.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement | null = null;
let root: Root | null = null;

afterEach(() => {
  if (root !== null) act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  designerStore._reset();
});

function textField(id: string, label = id): DynamicField {
  return { id, label, required: false, type: 'text', default: '' };
}

function instance(id: string, compositionId: string, name: string): Element {
  return {
    id,
    name,
    type: 'composition',
    compositionId,
    transform: {
      position: { x: 0, y: 0 },
      size: { w: 100, h: 50 },
      scale: { x: 1, y: 1 },
      rotation: 0,
      anchor: { x: 0, y: 0 },
    },
    opacity: 1,
    visible: true,
    locked: false,
    zIndex: 0,
  };
}

function layer(children: Element[]): Layer {
  return {
    id: 'l-1',
    name: 'Layer',
    visible: true,
    locked: false,
    blendMode: 'normal',
    children,
  };
}

function composition(id: string, fields: DynamicField[] = []): Composition {
  return {
    id,
    name: id,
    resolution: { width: 1920, height: 1080 },
    frameRange: { in: 0, out: 50 },
    editorBackdrop: 'transparent',
    layers: [],
    fields,
    bindings: [],
  };
}

function setupVariablesScene(): Scene {
  const projects = new ProjectStore(new MemoryWorkspace(), new MemoryKv());
  const { scene } = projects.newScene('Variables', 'lower-third');
  const first = scene.compositions?.[0];
  if (first === undefined) throw new Error('new project has no composition');
  const child = composition('Child', [textField('nested', 'Nested title')]);
  const empty = composition('Empty');
  const main: Composition = {
    ...first,
    id: 'Main',
    name: 'Main',
    fields: [textField('headline', 'Headline')],
    bindings: [],
    layers: [
      layer([
        instance('child-inst', child.id, 'Child instance'),
        instance('empty-inst', empty.id, 'Empty instance'),
      ]),
    ],
  };
  const next = { ...scene, compositions: [main, child, empty] };
  designerStore.setScene(next, null);
  return projected();
}

function setupEmptyScene(): Scene {
  const projects = new ProjectStore(new MemoryWorkspace(), new MemoryKv());
  const { scene } = projects.newScene('Empty', 'lower-third');
  designerStore.setScene(scene, null);
  return projected();
}

function projected(): Scene {
  const state = designerStore.get();
  const scene = editSceneOf(state.scene, state.activeCompositionId);
  if (scene === null) throw new Error('no active composition');
  return scene;
}

function renderPanel(scene: Scene, selection: ReadonlySet<string> = new Set()): void {
  if (container === null) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }
  act(() => {
    root?.render(
      createElement(DesignerRightPanel, {
        scene,
        selection,
        selectedKeyframe: null,
        selectedKeyframes: [],
        keyframeInspectorOpen: false,
        bindModeFieldId: null,
      }),
    );
  });
}

function click(selector: string): void {
  const button = container?.querySelector<HTMLButtonElement>(selector);
  if (button === null || button === undefined) throw new Error(`missing button ${selector}`);
  act(() => button.dispatchEvent(new MouseEvent('click', { bubbles: true })));
}

function typeAndBlur(input: HTMLInputElement, value: string): void {
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
  });
}

describe('D-166 — composition Variables tab', () => {
  it('keeps Variables active across selection changes and renders only non-empty namespaces', () => {
    const scene = setupVariablesScene();
    renderPanel(scene);
    click('#designer-variables-tab');

    expect(container?.querySelector('#designer-variables-tab')?.getAttribute('aria-selected')).toBe(
      'true',
    );
    expect(container?.querySelector('[data-testid="field-card-headline"]')).not.toBeNull();
    expect(container?.querySelector('[data-testid="field-row-nested"]')).not.toBeNull();
    expect(container?.textContent).toContain('Child instance');
    expect(container?.textContent).not.toContain('Empty instance');
    expect(container?.textContent?.toLowerCase()).not.toContain('no fields');

    const table = container?.querySelector('[role="table"][aria-label="Composition variables"]');
    expect(table).not.toBeNull();
    expect(
      [...(table?.querySelectorAll('[role="columnheader"]') ?? [])].map(
        (header) => header.textContent,
      ),
    ).toEqual(['Key', 'Title', 'Type / binding', 'Actions']);
    expect(
      table
        ?.querySelector('[data-testid="field-card-headline"]')
        ?.querySelectorAll('[role="cell"]'),
    ).toHaveLength(4);
    expect(container?.textContent?.match(/variables/gi)).toHaveLength(1);

    renderPanel(scene, new Set(['child-inst']));
    expect(container?.querySelector('#designer-variables-tab')?.getAttribute('aria-selected')).toBe(
      'true',
    );
    expect(container?.querySelector('#designer-variables-panel')?.hasAttribute('hidden')).toBe(
      false,
    );
  });

  it('keeps the existing relabel and delete actions wired to the field store', () => {
    renderPanel(setupVariablesScene());
    click('#designer-variables-tab');
    const title = container?.querySelector<HTMLInputElement>(
      'input[aria-label="Title for headline"]',
    );
    if (title === null || title === undefined) throw new Error('missing title editor');
    typeAndBlur(title, 'Program headline');
    expect(projected().fields.find((field) => field.id === 'headline')?.label).toBe(
      'Program headline',
    );

    const card = container?.querySelector('[data-testid="field-card-headline"]');
    const remove = card?.querySelector<HTMLButtonElement>('button[title^="Delete this field"]');
    if (remove === null || remove === undefined) throw new Error('missing delete action');
    act(() => remove.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(projected().fields.some((field) => field.id === 'headline')).toBe(false);
  });

  it('shows one concise empty state and no per-sequence noise', () => {
    renderPanel(setupEmptyScene());
    click('#designer-variables-tab');
    const empty = [...(container?.querySelectorAll('p') ?? [])].filter(
      (node) => node.textContent === 'No variables.',
    );
    expect(empty).toHaveLength(1);
    expect(container?.textContent?.toLowerCase()).not.toContain('no fields');
  });

  it('does not expose an internal fixed-file connection as a Variable/Data key', () => {
    const scene = setupVariablesScene();
    const internal: DynamicField = {
      id: fixedFileFieldId('ticker-1'),
      label: 'Fixed file',
      required: false,
      type: 'list',
      default: [],
      allowFileSource: true,
      fileSource: {
        inputMode: 'file-only',
        bridgePath: 'headlines.txt',
        lockFile: true,
      },
    };
    renderPanel({ ...scene, fields: [...scene.fields, internal] });
    click('#designer-variables-tab');

    expect(container?.querySelector(`[data-testid="field-card-${internal.id}"]`)).toBeNull();
    expect(container?.querySelector('[data-testid="field-card-headline"]')).not.toBeNull();
  });
});

describe('namespaceHasFields', () => {
  const group = (
    fields: DynamicField[],
    groups: CompositionFieldGroup[] = [],
  ): CompositionFieldGroup => ({
    instanceId: 'instance',
    name: 'instance',
    compositionId: 'composition',
    aggregate: { fields, groups },
  });

  it('drops a wholly empty branch but keeps a field at any descendant depth', () => {
    expect(namespaceHasFields(group([], [group([])]))).toBe(false);
    expect(namespaceHasFields(group([], [group([], [group([textField('deep')])])]))).toBe(true);
    expect(namespaceHasFields(group([textField(fixedFileFieldId('ticker-1'))]))).toBe(false);
  });
});
