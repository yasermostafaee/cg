import { afterEach, describe, expect, it } from 'vitest';
import { compositionInstancesOf } from '@cg/shared-schema';
import { MemoryKv, MemoryWorkspace } from '@cg/storage';
import { ProjectStore } from '../src/platform/ProjectStore.js';
import { designerStore, editSceneOf } from '../src/renderer/state/store.js';
import { defaultField } from '../src/renderer/features/fields/field-defaults.js';
import { defaultText } from '../src/renderer/state/element-defaults.js';

afterEach(() => {
  designerStore._reset();
});

function fresh(): void {
  const projects = new ProjectStore(new MemoryWorkspace(), new MemoryKv());
  const { scene } = projects.newScene('scoping', 'custom');
  designerStore.setScene(scene, null);
}

/** The active composition's own fields. */
function activeFields() {
  const st = designerStore.get();
  return editSceneOf(st.scene, st.activeCompositionId)!.fields;
}

/** Composition instances of a composition by id. */
function instancesOf(compId: string) {
  const scene = designerStore.get().scene!;
  const c = scene.compositions!.find((x) => x.id === compId)!;
  return compositionInstancesOf(c);
}

describe('D-025 — fields are scoped per composition', () => {
  it('(Bug 1) a field added in one composition is not visible in another', () => {
    fresh();
    const a = designerStore.addComposition()!; // opens A
    designerStore.addField(defaultField('homeScore', 'text'));
    const b = designerStore.addComposition()!; // opens B
    designerStore.addField(defaultField('clockTime', 'text'));

    designerStore.setActiveComposition(a);
    expect(activeFields().map((f) => f.id)).toEqual(['homeScore']);

    designerStore.setActiveComposition(b);
    expect(activeFields().map((f) => f.id)).toEqual(['clockTime']);
  });
});

describe('D-025 — binding targets in a composition copy', () => {
  it('remaps nested element targets and preserves advanced bindings and field definitions', () => {
    fresh();
    const original = designerStore.get().activeCompositionId!;
    const title = defaultText('original-title', 20, 30);
    designerStore.addElement(title);
    const scene = designerStore.get().scene!;
    const [composition] = scene.compositions ?? [];
    const [layer] = composition!.layers;
    const { id, name, transform, visible, locked, zIndex, opacity } = title;
    designerStore.setScene(
      {
        ...scene,
        compositions: [
          {
            ...composition!,
            layers: [
              {
                ...layer!,
                children: [
                  {
                    id: id + '-group',
                    name,
                    type: 'container',
                    transform,
                    visible,
                    locked,
                    zIndex,
                    opacity,
                    clip: false,
                    children: [title],
                  },
                ],
              },
            ],
            fields: [
              defaultField('title', 'text'),
              defaultField('background', 'color'),
              defaultField('unbound', 'text'),
            ],
            bindings: [
              {
                fieldId: 'title',
                target: { kind: 'text', elementId: title.id, placeholder: '{{title}}' },
                transform: 'uppercase',
              },
              { fieldId: 'background', target: { kind: 'scene-background' } },
            ],
          },
        ],
      },
      null,
    );

    const copy = designerStore.duplicateComposition(original);
    expect(copy).not.toBeNull();
    const [authored, duplicate] = designerStore.get().scene?.compositions ?? [];
    const group = duplicate?.layers[0]?.children[0];
    if (group?.type !== 'container') throw new Error('Missing copied group');
    const copiedTitle = group.children[0];
    expect(copiedTitle?.id).not.toBe(title.id);
    expect(duplicate?.fields).toEqual(authored?.fields);
    expect(duplicate?.bindings).toEqual([
      {
        fieldId: 'title',
        target: { kind: 'text', elementId: copiedTitle?.id, placeholder: '{{title}}' },
        transform: 'uppercase',
      },
      { fieldId: 'background', target: { kind: 'scene-background' } },
    ]);
    expect(authored?.bindings?.[0]?.target).toEqual({
      kind: 'text',
      elementId: title.id,
      placeholder: '{{title}}',
    });
  });
});

describe('D-025 — (e) instance names are unique within a parent', () => {
  it('instancing the same child twice gives two distinct namespaces', () => {
    fresh();
    const child = designerStore.addComposition()!; // A
    const parent = designerStore.addComposition()!; // B (active)
    designerStore.setActiveComposition(parent);

    expect(designerStore.addCompositionInstance(child)).not.toBeNull();
    expect(designerStore.addCompositionInstance(child)).not.toBeNull();

    const names = instancesOf(parent).map((i) => i.name);
    expect(names).toHaveLength(2);
    expect(new Set(names).size).toBe(2); // distinct
  });

  it('renaming an instance to a taken name is uniquified', () => {
    fresh();
    const child = designerStore.addComposition()!;
    const parent = designerStore.addComposition()!;
    designerStore.setActiveComposition(parent);
    designerStore.addCompositionInstance(child);
    designerStore.addCompositionInstance(child);

    const insts = instancesOf(parent);
    const first = insts[0]!;
    const second = insts[1]!;
    // Rename the second to collide with the first's name.
    designerStore.updateElement(second.id, { name: first.name });

    const names = instancesOf(parent).map((i) => i.name);
    expect(new Set(names).size).toBe(2); // still unique
  });
});
