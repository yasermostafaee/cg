import { describe, expect, it } from 'vitest';
import {
  aggregateCompositionFields,
  compositionClosure,
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
  return {
    id: `l-${children.length}`,
    name: 'L',
    visible: true,
    locked: false,
    children,
    blendMode: 'normal',
  };
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

/** D-083 — a sequence element with the given items (text and/or composition). */
function sequenceEl(id: string, name: string, items: unknown[]): Element {
  return {
    id,
    name,
    type: 'sequence',
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
    font: {
      family: 'X',
      weight: 400,
      style: 'normal',
      size: 16,
      lineHeight: 1.2,
      letterSpacing: 0,
    },
    color: '#FFFFFF',
    align: 'start',
    verticalAlign: 'middle',
    direction: 'ltr',
    items,
    defaultDwellMs: 5000,
    advance: 'auto',
    transitionIn: 'bottom',
    transitionOut: 'top',
    transitionTiming: 'simultaneous',
    transitionMs: 400,
    repeat: 'infinite',
  } as unknown as Element;
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

  it('(D-083 follow-up) a non-bound MIXED sequence: an UNBOUND text item is NOT exposed; a composition item still is', () => {
    const card = comp({ id: 'card', fields: [textField('label', 'City')] });
    const seq = sequenceEl('seq', 'Now/Next', [
      { id: 't1', text: 'Headline' }, // UNBOUND text item → NOT auto-exposed (static)
      { id: 'c1', kind: 'composition', compositionId: 'card' }, // COMPOSITION item → a group (kept)
    ]);
    const parent = comp({ id: 'parent', layers: [layer([seq])] });
    const scene = { compositions: [card, parent] } as Pick<Scene, 'compositions'>;
    const agg = aggregateCompositionFields(scene, parent);
    // The unbound text item contributes NO field — sequences never auto-expose their items.
    expect(agg.fields).toEqual([]);
    // The COMPOSITION item is still a group (id-based key, friendly label, its comp's fields).
    expect(agg.groups).toHaveLength(1);
    expect(agg.groups[0]?.name).toBe('seq:c1');
    expect(agg.groups[0]?.label).toBe('Now/Next[1]');
    expect(agg.groups[0]?.aggregate.fields.map((f) => f.id)).toEqual(['label']);
    // The value object carries ONLY the comp item (no scalar for the unbound text item).
    expect(defaultNestedValues(agg)).toEqual({ 'seq:c1': { label: 'City' } });
  });

  it('(D-083 follow-up) a non-bound text-only sequence exposes NOTHING (text is static unless explicitly bound)', () => {
    const seq = sequenceEl('seq', 'Rundown', [
      { id: 'a', text: 'one' },
      { id: 'b', text: 'two' },
    ]);
    const parent = comp({ id: 'parent', layers: [layer([seq])] });
    const scene = { compositions: [parent] } as Pick<Scene, 'compositions'>;
    const agg = aggregateCompositionFields(scene, parent);
    expect(agg.fields).toEqual([]);
    expect(agg.groups).toEqual([]);
    expect(defaultNestedValues(agg)).toEqual({});
  });

  it('(D-083 follow-up) an EXPLICITLY-bound text item surfaces its field; an unbound sibling does not', () => {
    const seq = sequenceEl('seq', 'Rundown', [
      { id: 'a', text: 'one' }, // explicitly bound to the 'headline' field
      { id: 'b', text: 'two' }, // unbound → stays static, not exposed
    ]);
    const parent = comp({
      id: 'parent',
      layers: [layer([seq])],
      fields: [
        {
          id: 'headline',
          type: 'text',
          label: 'Headline',
          required: false,
          default: 'one',
        } as DynamicField,
      ],
      bindings: [
        {
          fieldId: 'headline',
          target: { kind: 'sequence-item-text', elementId: 'seq', itemId: 'a' },
        } as FieldBinding,
      ],
    });
    const scene = { compositions: [parent] } as Pick<Scene, 'compositions'>;
    const agg = aggregateCompositionFields(scene, parent);
    // The bound text item's field surfaces as a normal doc field; the unbound sibling 'b' does not.
    expect(agg.fields.map((f) => f.id)).toEqual(['headline']);
    expect(agg.groups).toEqual([]);
    expect(defaultNestedValues(agg)).toEqual({ headline: 'one' });
  });

  it('(D-083) a LIST-BOUND sequence exposes NO per-item fields (the list owns the items)', () => {
    const seq = sequenceEl('seq', 'Rundown', [
      { id: 'a', text: 'one' },
      { id: 'b', text: 'two' },
    ]);
    const parent = comp({
      id: 'parent',
      layers: [layer([seq])],
      fields: [
        {
          id: 'rundown',
          type: 'list',
          label: 'Rundown',
          required: false,
          default: [
            { id: 'a', text: 'one' },
            { id: 'b', text: 'two' },
          ],
        } as DynamicField,
      ],
      bindings: [
        {
          fieldId: 'rundown',
          target: { kind: 'sequence-items', elementId: 'seq' },
        } as FieldBinding,
      ],
    });
    const scene = { compositions: [parent] } as Pick<Scene, 'compositions'>;
    const agg = aggregateCompositionFields(scene, parent);
    // Only the bound list field — no synthetic per-item fields, no groups (no double-exposure).
    expect(agg.fields.map((f) => f.id)).toEqual(['rundown']);
    expect(agg.groups).toEqual([]);
  });

  it('(D-083) TWO same-named sequences get DISTINCT stable keys (no collision/collapse)', () => {
    const card = comp({ id: 'card', fields: [textField('label')] });
    const s1 = sequenceEl('s1', 'Sequence', [
      { id: 'a', kind: 'composition', compositionId: 'card' },
    ]);
    const s2 = sequenceEl('s2', 'Sequence', [
      { id: 'b', kind: 'composition', compositionId: 'card' },
    ]);
    const parent = comp({ id: 'parent', layers: [layer([s1, s2])] });
    const scene = { compositions: [card, parent] } as Pick<Scene, 'compositions'>;
    const agg = aggregateCompositionFields(scene, parent);
    // Distinct id-based KEYS even though both sequences share the default name 'Sequence'…
    expect(agg.groups.map((g) => g.name)).toEqual(['s1:a', 's2:b']);
    // …with the same friendly DISPLAY label (the operator disambiguates by element).
    expect(agg.groups.map((g) => g.label)).toEqual(['Sequence[0]', 'Sequence[0]']);
    // No collapse: both namespaces survive in the value object.
    expect(Object.keys(defaultNestedValues(agg))).toEqual(['s1:a', 's2:b']);
  });

  it('(D-083) a sequence comp item inside a composition instance nests under the instance namespace', () => {
    const card = comp({ id: 'card', fields: [textField('label')] });
    const mid = comp({
      id: 'mid',
      layers: [
        layer([
          sequenceEl('sq', 'Seq', [{ id: 'c1', kind: 'composition', compositionId: 'card' }]),
        ]),
      ],
    });
    const root = comp({ id: 'root', layers: [layer([instance('i1', 'mid', 'home')])] });
    const scene = { compositions: [card, mid, root] } as Pick<Scene, 'compositions'>;
    // The comp item's values nest under the parent instance namespace ('home'), keyed by
    // the stable id-based item key — the runtime reads the same parent-scoped path.
    expect(defaultNestedValues(aggregateCompositionFields(scene, root))).toEqual({
      home: { 'sq:c1': { label: '' } },
    });
  });
});

describe('compositionClosure (D-086)', () => {
  // Minimal STRUCTURAL scenes — compositionClosure walks the ref graph by type +
  // compositionId; it does not schema-validate (mirrors collectImageElements' test).
  const inst = (compositionId: string): unknown => ({ type: 'composition', compositionId });
  const rep = (compositionId: string): unknown => ({ type: 'repeater', compositionId });
  const box = (children: unknown[]): unknown => ({ type: 'container', children });
  const compOf = (id: string, children: unknown[]): unknown => ({ id, layers: [{ children }] });

  it('includes children reached via BOTH a composition instance AND a repeater', () => {
    const scene = {
      compositions: [
        compOf('root', [inst('childA'), rep('childB')]),
        compOf('childA', []),
        compOf('childB', []),
        compOf('sibling', []), // never referenced by root
      ],
    } as unknown as Scene;
    const closure = compositionClosure(scene, 'root');
    expect([...closure].sort()).toEqual(['childA', 'childB']);
    expect(closure.has('sibling')).toBe(false);
  });

  it('follows refs transitively + recurses containers, and excludes the (acyclic) root', () => {
    const scene = {
      compositions: [
        compOf('root', [box([inst('mid')])]), // ref nested inside a container
        compOf('mid', [rep('leaf')]), // repeater one level down
        compOf('leaf', []),
        compOf('sibling', [inst('root')]), // points back at root but is unreachable from it
      ],
    } as unknown as Scene;
    const closure = compositionClosure(scene, 'root');
    expect([...closure].sort()).toEqual(['leaf', 'mid']);
    expect(closure.has('root')).toBe(false);
    expect(closure.has('sibling')).toBe(false);
  });

  it('returns an empty set for an unknown / standalone root', () => {
    const scene = { compositions: [compOf('solo', [])] } as unknown as Scene;
    expect(compositionClosure(scene, 'solo').size).toBe(0);
    expect(compositionClosure(scene, 'ghost').size).toBe(0);
  });

  it('terminates on a malformed cyclic scene (visited-set guard)', () => {
    const scene = {
      compositions: [compOf('a', [inst('b')]), compOf('b', [rep('a')])], // a → b → a
    } as unknown as Scene;
    expect([...compositionClosure(scene, 'a')].sort()).toEqual(['a', 'b']);
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
