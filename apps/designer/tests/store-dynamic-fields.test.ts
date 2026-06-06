import { afterEach, describe, expect, it } from 'vitest';
import { MemoryKv, MemoryWorkspace } from '@cg/storage';
import { ProjectStore } from '../src/platform/ProjectStore.js';
import { designerStore, editSceneOf } from '../src/renderer/state/store.js';
import { defaultText } from '../src/renderer/state/element-defaults.js';

afterEach(() => {
  designerStore._reset();
});

function freshScene(): void {
  const projects = new ProjectStore(new MemoryWorkspace(), new MemoryKv());
  const { scene } = projects.newScene('demo', 'lower-third');
  designerStore.setScene(scene, null);
}

/** Project-global field/binding arrays (kept on the root scene by editSceneOf). */
function fields() {
  return designerStore.get().scene!.fields;
}
function bindings() {
  return designerStore.get().scene!.bindings;
}

describe('designerStore — D-018 Data key convenience layer', () => {
  it('setElementDataKey creates a field (seeded from the element text) + binding', () => {
    freshScene();
    designerScene_addText('el-1');
    const ok = designerStore.setElementDataKey('el-1', 'title');
    expect(ok).toBe(true);

    const f = fields().find((x) => x.id === 'title');
    expect(f).toMatchObject({
      id: 'title',
      type: 'text',
      required: false,
      default: 'New text',
      maxLength: 100, // sensible broadcast cap by default
    });
    expect(bindings()).toContainEqual({
      fieldId: 'title',
      target: { kind: 'text', elementId: 'el-1' },
    });
  });

  it('renaming the Data key renames the field id and keeps the binding in sync', () => {
    freshScene();
    designerScene_addText('el-1');
    designerStore.setElementDataKey('el-1', 'title');
    designerStore.setElementDataKey('el-1', 'headline');

    expect(fields().map((x) => x.id)).toEqual(['headline']);
    expect(bindings()).toHaveLength(1);
    expect(bindings()[0]).toMatchObject({ fieldId: 'headline', target: { elementId: 'el-1' } });
  });

  it('a duplicate Data key is rejected and creates no conflicting field', () => {
    freshScene();
    designerScene_addText('el-1');
    designerScene_addText('el-2');
    designerStore.setElementDataKey('el-1', 'headline');
    const ok = designerStore.setElementDataKey('el-2', 'headline');

    expect(ok).toBe(false);
    expect(fields().filter((x) => x.id === 'headline')).toHaveLength(1);
    // el-2 got no convenience binding.
    expect(bindings().some((b) => b.target.kind === 'text' && b.target.elementId === 'el-2')).toBe(
      false,
    );
  });

  it('clearing the Data key removes the backing field and its binding', () => {
    freshScene();
    designerScene_addText('el-1');
    designerStore.setElementDataKey('el-1', 'title');
    designerStore.setElementDataKey('el-1', '   '); // whitespace == cleared

    expect(fields().some((x) => x.id === 'title')).toBe(false);
    expect(bindings().some((b) => b.fieldId === 'title')).toBe(false);
  });

  it('re-adopts an orphaned field when the Data key is re-typed (after Bindings ×)', () => {
    freshScene();
    designerScene_addText('el-1');
    designerStore.setElementDataKey('el-1', 'title');
    const fieldCount = fields().length;

    // Simulate the Bindings "×": removes the binding but leaves the field.
    const idx = bindings().findIndex(
      (b) => b.target.kind === 'text' && b.target.elementId === 'el-1',
    );
    designerStore.removeBindingAt(idx);
    expect(bindings().some((b) => b.fieldId === 'title')).toBe(false); // orphaned
    expect(fields().some((f) => f.id === 'title')).toBe(true); // field remains

    // Re-typing the same key reconnects it — no duplicate field, returns true.
    expect(designerStore.setElementDataKey('el-1', 'title')).toBe(true);
    expect(fields().filter((f) => f.id === 'title')).toHaveLength(1);
    expect(fields().length).toBe(fieldCount);
    expect(bindings()).toContainEqual({
      fieldId: 'title',
      target: { kind: 'text', elementId: 'el-1' },
    });
  });

  it('setElementFieldMeta patches the backing field and switches variant to number', () => {
    freshScene();
    designerScene_addText('el-1');
    designerStore.setElementDataKey('el-1', 'count');

    designerStore.setElementFieldMeta('el-1', {
      title: 'Goals',
      required: true,
      minLength: 2,
      maxLength: 12,
      pattern: '^\\w+$',
    });
    expect(fields()[0]).toMatchObject({
      id: 'count',
      type: 'text',
      label: 'Goals',
      required: true,
      minLength: 2,
      maxLength: 12,
      pattern: '^\\w+$',
    });

    designerStore.setElementFieldMeta('el-1', { fieldType: 'number', default: 7 });
    const f = fields()[0]!;
    expect(f.type).toBe('number');
    expect(f).toMatchObject({ id: 'count', default: 7, label: 'Goals', required: true });
    // length/pattern constraints don't carry to the number variant.
    expect('minLength' in f).toBe(false);
    // the element text mirrors the (coerced) default so the editor stays in sync
    expect(textOf('el-1')).toBe('7');
  });

  it('editing the field default mirrors onto the element text (inline editor stays in sync)', () => {
    freshScene();
    designerScene_addText('el-1');
    designerStore.setElementDataKey('el-1', 'title');
    designerStore.setElementFieldMeta('el-1', { default: 'Hello world' });

    expect(fields().find((x) => x.id === 'title')).toMatchObject({ default: 'Hello world' });
    expect(textOf('el-1')).toBe('Hello world');
  });

  it('setElementText updates element.text and syncs a bound field default', () => {
    freshScene();
    designerScene_addText('el-1');
    designerStore.setElementDataKey('el-1', 'title');
    designerStore.setElementText('el-1', 'Updated');

    expect(fields().find((x) => x.id === 'title')).toMatchObject({ default: 'Updated' });
    const st = designerStore.get();
    const el = editSceneOf(st.scene, st.activeCompositionId)!.layers[0]!.children.find(
      (c) => c.id === 'el-1',
    );
    expect(el).toMatchObject({ type: 'text', text: 'Updated' });
  });

  it('setElementText on an unbound element just updates the text (no field created)', () => {
    freshScene();
    designerScene_addText('el-1');
    designerStore.setElementText('el-1', 'Hello');
    expect(fields()).toHaveLength(0);
  });

  it('removeElement cleans up the element’s dynamic field + binding', () => {
    freshScene();
    designerScene_addText('el-1');
    designerStore.setElementDataKey('el-1', 'title');
    expect(fields().some((f) => f.id === 'title')).toBe(true);

    designerStore.removeElement('el-1');
    expect(fields().some((f) => f.id === 'title')).toBe(false); // field removed
    expect(bindings().some((b) => b.target.kind === 'text' && b.target.elementId === 'el-1')).toBe(
      false,
    ); // no dangling binding
  });

  it('removeElement keeps a field still bound to another element', () => {
    freshScene();
    designerScene_addText('el-1');
    designerScene_addText('el-2');
    designerStore.setElementDataKey('el-1', 'shared');
    // A second (hand-authored) binding of the same field to el-2.
    designerStore.addBinding({ fieldId: 'shared', target: { kind: 'text', elementId: 'el-2' } });

    designerStore.removeElement('el-1');
    expect(fields().some((f) => f.id === 'shared')).toBe(true); // still used by el-2
    expect(bindings().some((b) => b.target.kind === 'text' && b.target.elementId === 'el-2')).toBe(
      true,
    );
    expect(bindings().some((b) => b.target.kind === 'text' && b.target.elementId === 'el-1')).toBe(
      false,
    );
  });

  it('is a no-op with no active scene / when the element has no Data key', () => {
    expect(designerStore.setElementDataKey('ghost', 'k')).toBe(false);
    freshScene();
    designerScene_addText('el-1');
    designerStore.setElementFieldMeta('el-1', { title: 'X' }); // no key yet → no-op
    expect(fields()).toHaveLength(0);
  });
});

/** Add a text element to the active composition. */
function designerScene_addText(id: string): void {
  designerStore.addElement(defaultText(id, 0, 0));
}

/** The `text` of a text element in the active composition. */
function textOf(id: string): string | undefined {
  const st = designerStore.get();
  const el = editSceneOf(st.scene, st.activeCompositionId)?.layers[0]?.children.find(
    (c) => c.id === id,
  );
  return el !== undefined && el.type === 'text' ? el.text : undefined;
}
