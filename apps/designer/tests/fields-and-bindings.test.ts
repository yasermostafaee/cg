import { afterEach, describe, expect, it } from 'vitest';
import { DynamicFieldSchema, FieldBindingSchema, SceneSchema } from '@cg/shared-schema';
import { MemoryKv, MemoryWorkspace } from '@cg/storage';
import { ProjectStore } from '../src/platform/ProjectStore.js';
import { designerStore, editSceneOf } from '../src/renderer/state/store.js';
import { defaultShape, defaultText, defaultImage } from '../src/renderer/state/element-defaults.js';
import { defaultField, FIELD_KINDS } from '../src/renderer/features/fields/field-defaults.js';
import { resolveBinding } from '../src/renderer/features/fields/bind-resolver.js';
import { canBindFromCanvas } from '../src/renderer/features/fields/FieldsPanel.js';

afterEach(() => {
  designerStore._reset();
});

function freshScene(): void {
  const projects = new ProjectStore(new MemoryWorkspace(), new MemoryKv());
  const { scene } = projects.newScene('fld', 'lower-third');
  designerStore.setScene(scene, null);
}

/** Layers of the open composition (mutations target the active document). */
function layers() {
  const st = designerStore.get();
  return editSceneOf(st.scene, st.activeCompositionId)!.layers;
}

describe('field-defaults — schema-valid factories', () => {
  it('produces a parsable field for every supported kind', () => {
    for (const kind of FIELD_KINDS) {
      expect(() => DynamicFieldSchema.parse(defaultField('f1', kind))).not.toThrow();
    }
  });
});

describe('designerStore — fields + bindings', () => {
  it('addField appends and persists through the scene schema', () => {
    freshScene();
    designerStore.addField(defaultField('title', 'text'));
    designerStore.addField(defaultField('subtitle', 'multiline'));
    const s = designerStore.get().scene!;
    expect(s.fields).toHaveLength(2);
    expect(() => SceneSchema.parse(s)).not.toThrow();
  });

  it('updateField patches by id, leaves siblings alone', () => {
    freshScene();
    designerStore.addField(defaultField('title', 'text'));
    designerStore.addField(defaultField('count', 'number'));
    designerStore.updateField('title', { label: 'Title (FA)' });
    const fields = designerStore.get().scene!.fields;
    expect(fields.find((f) => f.id === 'title')?.label).toBe('Title (FA)');
    expect(fields.find((f) => f.id === 'count')?.label).toBe('count');
  });

  it('removeField also drops any bindings that referenced it', () => {
    freshScene();
    designerStore.addField(defaultField('title', 'text'));
    designerStore.addElement(defaultText('el-1', 0, 0));
    const field = designerStore.get().scene!.fields[0]!;
    const element = layers()[0]!.children[0]!;
    const binding = resolveBinding(field, element);
    designerStore.addBinding(binding!);
    expect(designerStore.get().scene!.bindings).toHaveLength(1);
    designerStore.removeField('title');
    expect(designerStore.get().scene!.fields).toHaveLength(0);
    expect(designerStore.get().scene!.bindings).toHaveLength(0);
  });

  it('removeBindingAt removes by index even when fieldId is duplicated', () => {
    freshScene();
    designerStore.addField(defaultField('title', 'text'));
    designerStore.addElement(defaultText('el-1', 0, 0));
    designerStore.addElement(defaultText('el-2', 0, 0));
    const field = designerStore.get().scene!.fields[0]!;
    const els = layers()[0]!.children;
    designerStore.addBinding(resolveBinding(field, els[0]!)!);
    designerStore.addBinding(resolveBinding(field, els[1]!)!);
    expect(designerStore.get().scene!.bindings).toHaveLength(2);
    designerStore.removeBindingAt(0);
    const remaining = designerStore.get().scene!.bindings;
    expect(remaining).toHaveLength(1);
    const target = remaining[0]!.target;
    if (target.kind === 'text') {
      expect(target.elementId).toBe('el-2');
    } else {
      throw new Error('unexpected binding kind');
    }
  });

  it('setBindMode toggles the global flag without clobbering selection', () => {
    freshScene();
    designerStore.addElement(defaultText('el-1', 0, 0));
    designerStore.setBindMode('title');
    expect(designerStore.get().bindModeFieldId).toBe('title');
    expect(designerStore.get().selection.has('el-1')).toBe(true);
    designerStore.setBindMode(null);
    expect(designerStore.get().bindModeFieldId).toBeNull();
  });
});

describe('B-008 — "Bind from canvas" adds exactly one binding per target (dedupe)', () => {
  it('one element → one binding; re-binding the SAME element adds none; a different element still binds', () => {
    freshScene();
    designerStore.addField(defaultField('title', 'text'));
    const el1 = defaultText('el-1', 0, 0);
    const el2 = defaultText('el-2', 0, 0);
    designerStore.addElement(el1);
    designerStore.addElement(el2);
    const field = designerStore.get().scene!.fields[0]!;

    // Simulate "Bind from canvas" → click el-1 (resolveBinding + addBinding).
    designerStore.addBinding(resolveBinding(field, el1)!);
    expect(designerStore.get().scene!.bindings).toHaveLength(1);

    // Re-activate + click the SAME element repeatedly → NO new bindings (the bug).
    for (let i = 0; i < 5; i++) designerStore.addBinding(resolveBinding(field, el1)!);
    expect(designerStore.get().scene!.bindings).toHaveLength(1);

    // Binding the field to a DIFFERENT element is still allowed.
    designerStore.addBinding(resolveBinding(field, el2)!);
    expect(designerStore.get().scene!.bindings).toHaveLength(2);
    // …and that one is deduped on repeat too.
    designerStore.addBinding(resolveBinding(field, el2)!);
    expect(designerStore.get().scene!.bindings).toHaveLength(2);
  });

  it('same field+element but a DIFFERENT target property is not a duplicate', () => {
    freshScene();
    designerStore.addField(defaultField('c', 'color'));
    const shape = defaultShape('s-1', 0, 0);
    designerStore.addElement(shape);
    const field = designerStore.get().scene!.fields[0]!;

    designerStore.addBinding(resolveBinding(field, shape)!); // → color.fill
    // A color binding on the SAME field+element but a different property differs.
    designerStore.addBinding({
      fieldId: field.id,
      target: { kind: 'color', elementId: 's-1', property: 'stroke' },
    });
    expect(designerStore.get().scene!.bindings).toHaveLength(2);
  });
});

describe('FieldsPanel — "Bind from canvas" is disabled while the field already has a binding', () => {
  it('enabled with zero bindings; disabled once bound; re-enabled after removing the binding', () => {
    freshScene();
    designerStore.addField(defaultField('title', 'text'));
    const el1 = defaultText('el-1', 0, 0);
    designerStore.addElement(el1);
    const field = designerStore.get().scene!.fields[0]!;

    // No binding yet → button enabled.
    expect(canBindFromCanvas(field.id, designerStore.get().scene!.bindings)).toBe(true);

    // Bind from canvas → now disabled (one binding per field).
    designerStore.addBinding(resolveBinding(field, el1)!);
    expect(canBindFromCanvas(field.id, designerStore.get().scene!.bindings)).toBe(false);

    // Removing the binding (×) re-enables it.
    designerStore.removeBindingAt(0);
    expect(canBindFromCanvas(field.id, designerStore.get().scene!.bindings)).toBe(true);
  });

  it("a binding on a DIFFERENT field does not disable this field's button", () => {
    freshScene();
    designerStore.addField(defaultField('title', 'text'));
    designerStore.addField(defaultField('subtitle', 'text'));
    const el1 = defaultText('el-1', 0, 0);
    designerStore.addElement(el1);
    const other = designerStore.get().scene!.fields.find((f) => f.id === 'subtitle')!;
    designerStore.addBinding(resolveBinding(other, el1)!);

    // 'subtitle' is bound; 'title' is still bindable.
    expect(canBindFromCanvas('subtitle', designerStore.get().scene!.bindings)).toBe(false);
    expect(canBindFromCanvas('title', designerStore.get().scene!.bindings)).toBe(true);
  });
});

describe('resolveBinding — element/field type matrix', () => {
  it('text field + text element → text binding', () => {
    const b = resolveBinding(defaultField('f', 'text'), defaultText('e', 0, 0));
    expect(b?.target.kind).toBe('text');
    expect(() => FieldBindingSchema.parse(b)).not.toThrow();
  });

  it('color field + shape element → color.fill binding', () => {
    const b = resolveBinding(defaultField('f', 'color'), defaultShape('e', 0, 0));
    expect(b?.target.kind).toBe('color');
    if (b?.target.kind === 'color') expect(b.target.property).toBe('fill');
  });

  it('color field + text element → color.text binding', () => {
    const b = resolveBinding(defaultField('f', 'color'), defaultText('e', 0, 0));
    if (b?.target.kind === 'color') expect(b.target.property).toBe('text');
  });

  it('boolean field + any element → visible binding', () => {
    const b = resolveBinding(defaultField('f', 'boolean'), defaultText('e', 0, 0));
    expect(b?.target.kind).toBe('visible');
  });

  it('number field + any element → transform.opacity binding', () => {
    const b = resolveBinding(defaultField('f', 'number'), defaultShape('e', 0, 0));
    expect(b?.target.kind).toBe('transform');
    if (b?.target.kind === 'transform') expect(b.target.property).toBe('opacity');
  });

  it('image field + image element → image binding', () => {
    const b = resolveBinding(defaultField('f', 'image'), defaultImage('e', 0, 0, 'asset-x'));
    expect(b?.target.kind).toBe('image');
  });

  it('text field + shape element → no auto-resolve (returns null)', () => {
    const b = resolveBinding(defaultField('f', 'text'), defaultShape('e', 0, 0));
    expect(b).toBeNull();
  });

  it('select field + any element → no auto-resolve (returns null)', () => {
    const b = resolveBinding(defaultField('f', 'select'), defaultText('e', 0, 0));
    expect(b).toBeNull();
  });
});
