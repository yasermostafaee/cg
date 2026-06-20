import type { DynamicField, FieldValue } from './fields.js';
import type { FieldBinding } from './bindings.js';
import type { Element } from './elements.js';
import type { Composition, Layer, Scene } from './scene.js';

/**
 * D-025 — instance-scoped field namespacing for nested compositions (Option C).
 *
 * Fields are per-composition (each composition owns its `fields`/`bindings`, flat
 * and unique within it). When a composition is nested as a child INSTANCE, its
 * fields are exposed in the parent under the instance's name as a NESTED OBJECT,
 * so the same child instanced twice (e.g. `home`/`away`) yields two independent
 * namespaces. These pure helpers compute that aggregation + the nested data/value
 * shape; the designer UI, runtime, GDD and exporter all share them.
 */

/** A doc that owns fields/bindings + layers: the root scene or a composition. */
export interface FieldDoc {
  fields?: readonly DynamicField[] | undefined;
  bindings?: readonly FieldBinding[] | undefined;
  layers: readonly Layer[];
}

/** A nested child instance contributing a namespace to its parent. */
export interface CompositionFieldGroup {
  /** The `composition` element id (unique within the parent). */
  instanceId: string;
  /** Namespace key = the instance's (user-editable, parent-unique) name. */
  name: string;
  /** The referenced child composition id. */
  compositionId: string;
  /** The child's own aggregate (recursive — arbitrary depth). */
  aggregate: AggregatedFields;
}

/** A composition's own flat fields plus its nested-instance namespaces. */
export interface AggregatedFields {
  fields: readonly DynamicField[];
  groups: readonly CompositionFieldGroup[];
}

/** Nested field-value payload: flat field values plus per-namespace sub-objects. */
export interface NestedFieldValues {
  [key: string]: FieldValue | NestedFieldValues;
}

const MAX_DEPTH = 8;

/** The `composition` instance elements directly placed in a doc's layers. */
export function compositionInstancesOf(
  doc: Pick<FieldDoc, 'layers'>,
): Extract<Element, { type: 'composition' }>[] {
  const out: Extract<Element, { type: 'composition' }>[] = [];
  for (const layer of doc.layers) {
    for (const el of layer.children) {
      if (el.type === 'composition') out.push(el);
    }
  }
  return out;
}

/**
 * Collect the child-composition ids DIRECTLY referenced within a layer tree —
 * BOTH `composition` instance elements AND `repeater` elements (each stamps a
 * child composition per row) — recursing into containers. The ONE ref-collector
 * shared by {@link compositionClosure} and the author-time cycle guard, so the two
 * can never disagree on which element kinds reference a composition.
 *
 * NB this is deliberately NOT used for field aggregation: a repeater's rows never
 * form a field namespace (the single bound `list` is its data surface), so
 * {@link compositionInstancesOf} — `composition`-only — is the right collector
 * there. Reference closure (export, cycle detection) is the opposite: a repeater
 * DOES pull its child composition's template + assets into the package, so it must
 * be followed here.
 */
export function collectChildCompositionRefs(
  children: readonly Element[],
  out: Set<string>,
): Set<string> {
  for (const el of children) {
    if (el.type === 'composition' || el.type === 'repeater') {
      out.add(el.compositionId);
    } else if (el.type === 'container') {
      collectChildCompositionRefs(el.children, out);
    }
  }
  return out;
}

/** The child-composition ids a single doc (scene or composition) directly references. */
export function directCompositionRefs(doc: Pick<FieldDoc, 'layers'>): Set<string> {
  const out = new Set<string>();
  for (const layer of doc.layers) collectChildCompositionRefs(layer.children, out);
  return out;
}

/**
 * The transitive nested CLOSURE of composition `rootId`: every composition reachable
 * from it by following child-composition references (`composition` + `repeater`), at
 * any depth. Does NOT include `rootId` itself (cycles are forbidden, so a comp never
 * reaches itself). This is exactly the set of compositions a per-composition export
 * must package alongside the root — sibling comps unreachable from the root are
 * excluded. A visited-set keeps it terminating even on a malformed cyclic scene.
 */
export function compositionClosure(
  scene: Pick<Scene, 'compositions'>,
  rootId: string,
): Set<string> {
  const byId = new Map((scene.compositions ?? []).map((c) => [c.id, c]));
  const closure = new Set<string>();
  const root = byId.get(rootId);
  if (root === undefined) return closure;
  const queue = [...directCompositionRefs(root)];
  while (queue.length > 0) {
    const id = queue.shift();
    if (id === undefined || closure.has(id)) continue;
    closure.add(id);
    const child = byId.get(id);
    if (child !== undefined) for (const ref of directCompositionRefs(child)) queue.push(ref);
  }
  return closure;
}

/**
 * Aggregate a composition's fields: its own flat fields plus, for each nested
 * child instance, that child's aggregate under the instance's namespace. A
 * standalone composition (no instances) returns just its flat fields with no
 * groups — i.e. unchanged, no namespacing.
 */
export function aggregateCompositionFields(
  scene: Pick<Scene, 'compositions'>,
  doc: FieldDoc,
  depth = 0,
): AggregatedFields {
  const groups: CompositionFieldGroup[] = [];
  if (depth < MAX_DEPTH) {
    for (const inst of compositionInstancesOf(doc)) {
      const child = scene.compositions?.find((c) => c.id === inst.compositionId);
      if (child === undefined) continue;
      groups.push({
        instanceId: inst.id,
        name: inst.name,
        compositionId: child.id,
        aggregate: aggregateCompositionFields(scene, child, depth + 1),
      });
    }
  }
  return { fields: doc.fields ?? [], groups };
}

/** The seed value for a single field (mirrors the preview's `seedDefaults`). */
export function defaultFieldValue(field: DynamicField): FieldValue {
  return field.type === 'image'
    ? { assetId: field.defaultAssetId ?? '' }
    : (field.default as FieldValue);
}

/** Build the default NESTED value object for an aggregate (own defaults + groups). */
export function defaultNestedValues(aggregate: AggregatedFields): NestedFieldValues {
  const out: NestedFieldValues = {};
  for (const f of aggregate.fields) out[f.id] = defaultFieldValue(f);
  for (const g of aggregate.groups) out[g.name] = defaultNestedValues(g.aggregate);
  return out;
}

/**
 * Data keys that appear on more than one field within a SINGLE composition (the
 * flat-uniqueness rule still applies inside a composition).
 */
export function duplicateFieldKeys(fields: readonly DynamicField[]): string[] {
  const seen = new Set<string>();
  const dupes = new Set<string>();
  for (const f of fields) {
    if (seen.has(f.id)) dupes.add(f.id);
    seen.add(f.id);
  }
  return [...dupes];
}

/**
 * A parent-unique instance name. Returns `base` when free, else `base 2`,
 * `base 3`, … skipping any name already used by another instance in `taken`.
 */
export function uniqueInstanceName(base: string, taken: readonly string[]): string {
  const used = new Set(taken);
  if (!used.has(base)) return base;
  for (let n = 2; ; n++) {
    const candidate = `${base} ${String(n)}`;
    if (!used.has(candidate)) return candidate;
  }
}

/** Which composition directly contains `elementId`, if any. */
function compOwningElement(
  comps: readonly Composition[],
  elementId: string,
): Composition | undefined {
  return comps.find((c) => c.layers.some((l) => l.children.some((el) => el.id === elementId)));
}

/**
 * Migrate a legacy project whose fields/bindings live globally on the root scene
 * into per-composition ownership. Each binding moves to the composition that
 * directly contains its target element; the bound field def follows. Idempotent:
 * a no-op once the root `fields`/`bindings` are empty (i.e. already per-comp, or a
 * brand-new project). Standalone compositions end up with flat fields — no
 * namespacing, exactly as before.
 */
export function migrateGlobalFieldsToCompositions(scene: Scene): Scene {
  if (scene.fields.length === 0 && scene.bindings.length === 0) return scene;
  const comps = scene.compositions ?? [];
  if (comps.length === 0) return scene; // nothing to migrate into

  const perComp = new Map<string, { fields: DynamicField[]; bindings: FieldBinding[] }>();
  const ensure = (id: string): { fields: DynamicField[]; bindings: FieldBinding[] } => {
    let e = perComp.get(id);
    if (e === undefined) {
      e = { fields: [], bindings: [] };
      perComp.set(id, e);
    }
    return e;
  };

  const fieldById = new Map(scene.fields.map((f) => [f.id, f]));
  for (const binding of scene.bindings) {
    const target = binding.target;
    const elementId = target.kind === 'scene-background' ? undefined : target.elementId;
    const owner =
      elementId === undefined ? comps[0] : (compOwningElement(comps, elementId) ?? comps[0]);
    if (owner === undefined) continue;
    const bucket = ensure(owner.id);
    bucket.bindings.push(binding);
    const field = fieldById.get(binding.fieldId);
    if (field !== undefined && !bucket.fields.some((f) => f.id === field.id)) {
      bucket.fields.push(field);
    }
  }

  const nextComps = comps.map((c) => {
    const bucket = perComp.get(c.id);
    if (bucket === undefined) return c;
    // Keep any fields already on the comp; append migrated ones not already present.
    const ownFields = c.fields ?? [];
    const ownBindings = c.bindings ?? [];
    const ids = new Set(ownFields.map((f) => f.id));
    const mergedFields = [...ownFields, ...bucket.fields.filter((f) => !ids.has(f.id))];
    return { ...c, fields: mergedFields, bindings: [...ownBindings, ...bucket.bindings] };
  });

  return { ...scene, compositions: nextComps, fields: [], bindings: [] };
}
