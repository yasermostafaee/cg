import { afterEach, describe, expect, it } from 'vitest';
import { DynamicFieldSchema, FieldBindingSchema, SceneSchema } from '@cg/shared-schema';
import { MemoryKv, MemoryWorkspace } from '@cg/storage';
import { ProjectStore } from '../src/platform/ProjectStore.js';
import { designerStore, editSceneOf } from '../src/renderer/state/store.js';
import { defaultShape, defaultText, defaultImage } from '../src/renderer/state/element-defaults.js';
import { defaultField, FIELD_KINDS } from '../src/renderer/features/fields/field-defaults.js';
import { resolveBinding } from '../src/renderer/features/fields/bind-resolver.js';

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
