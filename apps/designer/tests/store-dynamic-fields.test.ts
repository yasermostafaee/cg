import { afterEach, describe, expect, it } from 'vitest';
import { MemoryKv, MemoryWorkspace } from '@cg/storage';
import { ProjectStore } from '../src/platform/ProjectStore.js';
import { designerStore, editSceneOf } from '../src/renderer/state/store.js';
import {
  defaultRepeater,
  defaultSequence,
  defaultText,
  defaultTicker,
} from '../src/renderer/state/element-defaults.js';

afterEach(() => {
  designerStore._reset();
});

function freshScene(): void {
  const projects = new ProjectStore(new MemoryWorkspace(), new MemoryKv());
  const { scene } = projects.newScene('demo', 'lower-third');
  designerStore.setScene(scene, null);
}

/** The ACTIVE composition's own fields/bindings (D-025 — fields are per-comp). */
function fields() {
  const st = designerStore.get();
  return editSceneOf(st.scene, st.activeCompositionId)!.fields;
}
function bindings() {
  const st = designerStore.get();
  return editSceneOf(st.scene, st.activeCompositionId)!.bindings;
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

describe('designerStore — D-028 ticker Data key + items', () => {
  function addTicker(id: string): void {
    designerStore.addElement(defaultTicker(id, 0, 0));
  }
  function tickerItemsOf(id: string): { id: string; text: string }[] | undefined {
    const st = designerStore.get();
    const scene = editSceneOf(st.scene, st.activeCompositionId)!;
    for (const layer of scene.layers) {
      for (const el of layer.children) {
        if (el.id === id && el.type === 'ticker') return el.items;
      }
    }
    return undefined;
  }

  it('setElementDataKey on a ticker seeds a LIST field from the authored items + ticker-items binding', () => {
    freshScene();
    addTicker('tk-1');
    const ok = designerStore.setElementDataKey('tk-1', 'headlines');
    expect(ok).toBe(true);

    const f = fields().find((x) => x.id === 'headlines');
    expect(f?.type).toBe('list');
    if (f?.type === 'list') {
      expect(f.default).toEqual(tickerItemsOf('tk-1'));
      expect(f.default.length).toBeGreaterThan(0);
    }
    expect(bindings()).toContainEqual({
      fieldId: 'headlines',
      target: { kind: 'ticker-items', elementId: 'tk-1' },
    });
  });

  it('one key, one owner — a ticker key conflicts with a text key of the same name', () => {
    freshScene();
    designerScene_addText('el-1');
    addTicker('tk-1');
    designerStore.setElementDataKey('el-1', 'headline');
    expect(designerStore.setElementDataKey('tk-1', 'headline')).toBe(false);
    expect(
      bindings().some((b) => b.target.kind === 'ticker-items' && b.target.elementId === 'tk-1'),
    ).toBe(false);
  });

  it('a ticker cannot adopt an orphaned TEXT field (kind mismatch)', () => {
    freshScene();
    designerScene_addText('el-1');
    designerStore.setElementDataKey('el-1', 'title');
    // Orphan the text field (remove its binding, keep the field).
    const idx = bindings().findIndex((b) => b.fieldId === 'title');
    designerStore.removeBindingAt(idx);
    addTicker('tk-1');
    expect(designerStore.setElementDataKey('tk-1', 'title')).toBe(false);
  });

  it('setTickerItems updates the element AND keeps the bound list field default in lockstep', () => {
    freshScene();
    addTicker('tk-1');
    designerStore.setElementDataKey('tk-1', 'headlines');
    const next = [
      { id: 'n1', text: 'خبر تازه' },
      { id: 'n2', text: 'Brand X', note: 'extra fields survive' },
    ];
    designerStore.setTickerItems('tk-1', next);

    // The element stores only what it renders ({id, text})…
    expect(tickerItemsOf('tk-1')).toEqual([
      { id: 'n1', text: 'خبر تازه' },
      { id: 'n2', text: 'Brand X' },
    ]);
    // …while the field default keeps the FULL open item shape.
    const f = fields().find((x) => x.id === 'headlines');
    expect(f?.type).toBe('list');
    if (f?.type === 'list') expect(f.default).toEqual(next);
  });

  it('setTickerItems without a Data key edits only the element (no field side-effects)', () => {
    freshScene();
    addTicker('tk-1');
    const fieldCount = fields().length;
    designerStore.setTickerItems('tk-1', [{ id: 'a', text: 'فقط عنصر' }]);
    expect(tickerItemsOf('tk-1')).toEqual([{ id: 'a', text: 'فقط عنصر' }]);
    expect(fields()).toHaveLength(fieldCount);
  });

  it('ticker field meta keeps the list variant (title/required apply; no type switch)', () => {
    freshScene();
    addTicker('tk-1');
    designerStore.setElementDataKey('tk-1', 'headlines');
    designerStore.setElementFieldMeta('tk-1', { title: 'Headlines', required: true });
    const f = fields().find((x) => x.id === 'headlines');
    expect(f).toMatchObject({ type: 'list', label: 'Headlines', required: true });
  });
});

describe('designerStore — D-029 sequence Data key + items', () => {
  function addSequence(id: string): void {
    designerStore.addElement(defaultSequence(id, 0, 0));
  }
  function sequenceItemsOf(
    id: string,
  ): { id: string; text: string; dwellMs?: number }[] | undefined {
    const st = designerStore.get();
    const scene = editSceneOf(st.scene, st.activeCompositionId)!;
    for (const layer of scene.layers) {
      for (const el of layer.children) {
        if (el.id === id && el.type === 'sequence') return el.items;
      }
    }
    return undefined;
  }

  it('setElementDataKey on a sequence seeds a LIST field + sequence-items binding', () => {
    freshScene();
    addSequence('sq-1');
    expect(designerStore.setElementDataKey('sq-1', 'rundown')).toBe(true);

    const f = fields().find((x) => x.id === 'rundown');
    expect(f?.type).toBe('list');
    if (f?.type === 'list') {
      expect(f.default).toEqual(sequenceItemsOf('sq-1'));
      expect(f.default.length).toBeGreaterThan(0);
    }
    expect(bindings()).toContainEqual({
      fieldId: 'rundown',
      target: { kind: 'sequence-items', elementId: 'sq-1' },
    });
  });

  it('one key, one owner — across ticker and sequence too', () => {
    freshScene();
    addTickerForConflict('tk-1');
    addSequence('sq-1');
    designerStore.setElementDataKey('tk-1', 'shared');
    expect(designerStore.setElementDataKey('sq-1', 'shared')).toBe(false);
    expect(
      bindings().some((b) => b.target.kind === 'sequence-items' && b.target.elementId === 'sq-1'),
    ).toBe(false);
  });

  it('setSequenceItems keeps element + bound field in lockstep, preserving dwellMs and extras', () => {
    freshScene();
    addSequence('sq-1');
    designerStore.setElementDataKey('sq-1', 'rundown');
    const next = [
      { id: 'n1', text: 'اکنون: خبر ویژه', dwellMs: 8000 },
      { id: 'n2', text: 'سپس: Brand X', note: 'extra fields survive' },
    ];
    designerStore.setSequenceItems('sq-1', next);

    // The element stores what it renders ({id, text, dwellMs?})…
    expect(sequenceItemsOf('sq-1')).toEqual([
      { id: 'n1', text: 'اکنون: خبر ویژه', dwellMs: 8000 },
      { id: 'n2', text: 'سپس: Brand X' },
    ]);
    // …while the field default keeps the FULL open item shape.
    const f = fields().find((x) => x.id === 'rundown');
    expect(f?.type).toBe('list');
    if (f?.type === 'list') expect(f.default).toEqual(next);
  });
});

/** A ticker for cross-kind conflict tests (avoids shadowing the D-028 helper). */
function addTickerForConflict(id: string): void {
  designerStore.addElement(defaultTicker(id, 0, 0));
}

describe('designerStore — D-030 repeater Data key + rows', () => {
  function addRepeater(id: string): void {
    designerStore.addElement(
      defaultRepeater(id, 0, 0, {
        id: 'child-1',
        fields: [{ id: 'name', label: 'Name', required: false, type: 'text', default: 'تیم' }],
      }),
    );
  }
  function repeaterItemsOf(id: string): Record<string, unknown>[] | undefined {
    const st = designerStore.get();
    const scene = editSceneOf(st.scene, st.activeCompositionId)!;
    for (const layer of scene.layers) {
      for (const el of layer.children) {
        if (el.id === id && el.type === 'repeater') return el.items as Record<string, unknown>[];
      }
    }
    return undefined;
  }

  it('setElementDataKey on a repeater seeds a LIST field + repeater-items binding', () => {
    freshScene();
    addRepeater('rp-1');
    expect(designerStore.setElementDataKey('rp-1', 'standings')).toBe(true);
    const f = fields().find((x) => x.id === 'standings');
    expect(f?.type).toBe('list');
    if (f?.type === 'list') expect(f.default).toEqual(repeaterItemsOf('rp-1'));
    expect(bindings()).toContainEqual({
      fieldId: 'standings',
      target: { kind: 'repeater-items', elementId: 'rp-1' },
    });
  });

  it('setRepeaterItems keeps the FULL open rows on the element AND the bound field', () => {
    freshScene();
    addRepeater('rp-1');
    designerStore.setElementDataKey('rp-1', 'standings');
    const next = [
      { id: 'r1', name: 'تیم یک', score: 3, extra: 'survives' },
      { id: 'r2', name: 'Brand X', score: 1 },
    ];
    designerStore.setRepeaterItems('rp-1', next);
    expect(repeaterItemsOf('rp-1')).toEqual(next); // open rows stay whole
    const f = fields().find((x) => x.id === 'standings');
    if (f?.type === 'list') expect(f.default).toEqual(next);
  });
});
