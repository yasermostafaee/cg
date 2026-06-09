import { describe, expect, it } from 'vitest';
import {
  aggregateCompositionFields,
  defaultNestedValues,
  migrateGlobalFieldsToCompositions,
  uniqueInstanceName,
  type Composition,
  type DynamicField,
  type Element,
  type FieldBinding,
  type Layer,
  type Scene,
} from '../src/index.js';

function textField(id: string, def = ''): DynamicField {
  return { id, type: 'text', label: id, required: false, default: def };
}

function layer(children: Element[]): Layer {
  return { id: `l-${children.length}`, name: 'L', visible: true, locked: false, children, blendMode: 'normal' };
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

function comp(over: Partial<Composition> & { id: string }): Composition {
  return {
    name: over.id,
    resolution: { width: 200, height: 100 },
    frameRange: { in: 0, out: 50 },
    background: 'transparent',
    layers: [],
    fields: [],
    bindings: [],
    ...over,
  };
}

describe('aggregateCompositionFields (D-025)', () => {
  it('(a) a standalone composition shows only its own field(s), no namespaces', () => {
    const child = comp({ id: 'child', fields: [textField('teamName')] });
    const scene = { compositions: [child] } as Pick<Scene, 'compositions'>;
    const agg = aggregateCompositionFields(scene, child);
    expect(agg.fields.map((f) => f.id)).toEqual(['teamName']);
    expect(agg.groups).toEqual([]);
  });

  it('(b) a parent exposes a nested child under the instance namespace', () => {
    const child = comp({ id: 'child', fields: [textField('teamName'), textField('score')] });
    const parent = comp({ id: 'parent', layers: [layer([instance('i1', 'child', 'home')])] });
    const scene = { compositions: [child, parent] } as Pick<Scene, 'compositions'>;
    const agg = aggregateCompositionFields(scene, parent);
    expect(agg.fields).toEqual([]); // parent has no own fields
    expect(agg.groups).toHaveLength(1);
    const group = agg.groups[0];
    expect(group?.name).toBe('home');
    expect(group?.aggregate.fields.map((f) => f.id)).toEqual(['teamName', 'score']);
  });

  it('(c) the SAME child instanced twice yields two independent namespaces', () => {
    const child = comp({ id: 'child', fields: [textField('teamName')] });
    const parent = comp({
      id: 'parent',
      layers: [layer([instance('i1', 'child', 'home'), instance('i2', 'child', 'away')])],
    });
    const scene = { compositions: [child, parent] } as Pick<Scene, 'compositions'>;
    const agg = aggregateCompositionFields(scene, parent);
    expect(agg.groups.map((g) => g.name)).toEqual(['home', 'away']);
    // Default nested values are independent objects.
    const data = defaultNestedValues(agg);
    expect(data).toEqual({ home: { teamName: '' }, away: { teamName: '' } });
  });

  it('nests deeper for arbitrary depth (a.b)', () => {
    const leaf = comp({ id: 'leaf', fields: [textField('v')] });
    const mid = comp({ id: 'mid', layers: [layer([instance('m1', 'leaf', 'inner')])] });
    const root = comp({ id: 'root', layers: [layer([instance('r1', 'mid', 'outer')])] });
    const scene = { compositions: [leaf, mid, root] } as Pick<Scene, 'compositions'>;
    const data = defaultNestedValues(aggregateCompositionFields(scene, root));
    expect(data).toEqual({ outer: { inner: { v: '' } } });
  });
});

describe('uniqueInstanceName', () => {
  it('returns the base when free, else appends an incrementing suffix', () => {
    expect(uniqueInstanceName('Scoreboard', [])).toBe('Scoreboard');
    expect(uniqueInstanceName('Scoreboard', ['Scoreboard'])).toBe('Scoreboard 2');
    expect(uniqueInstanceName('Scoreboard', ['Scoreboard', 'Scoreboard 2'])).toBe('Scoreboard 3');
  });
});

describe('migrateGlobalFieldsToCompositions', () => {
  it('moves global fields/bindings into the composition that owns the bound element', () => {
    const elInChild: Element = {
      id: 'txt',
      name: 'txt',
      type: 'text',
      text: 'x',
      transform: {
        position: { x: 0, y: 0 },
        size: { w: 10, h: 10 },
        scale: { x: 1, y: 1 },
        rotation: 0,
        anchor: { x: 0, y: 0 },
      },
      opacity: 1,
      visible: true,
      locked: false,
      zIndex: 0,
      font: { family: 'Inter', size: 20, weight: 400, lineHeight: 1.2, letterSpacing: 0 },
      color: '#fff',
      align: 'start',
    } as unknown as Element;
    const child = comp({ id: 'child', layers: [layer([elInChild])] });
    const binding: FieldBinding = { fieldId: 'title', target: { kind: 'text', elementId: 'txt' } };
    const scene = {
      compositions: [child],
      fields: [textField('title')],
      bindings: [binding],
    } as unknown as Scene;

    const migrated = migrateGlobalFieldsToCompositions(scene);
    expect(migrated.fields).toEqual([]); // root drained
    expect(migrated.bindings).toEqual([]);
    const c = (migrated.compositions ?? [])[0];
    expect(c?.fields?.map((f) => f.id)).toEqual(['title']);
    expect(c?.bindings).toEqual([binding]);
  });

  it('is a no-op when the root has no global fields/bindings', () => {
    const child = comp({ id: 'child', fields: [textField('a')] });
    const scene = { compositions: [child], fields: [], bindings: [] } as unknown as Scene;
    expect(migrateGlobalFieldsToCompositions(scene)).toBe(scene);
  });
});
