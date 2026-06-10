import {
  activeRangeOf,
  aggregateCompositionFields,
  type AggregatedFields,
  type DynamicField,
  type Scene,
} from '@cg/shared-schema';

/**
 * GDD — Graphics Data Definition (superflytv). A JSON-schema subset that
 * standard CasparCG clients (SuperConductor, CasparCG Client, …) read to
 * auto-build a data-entry form for a template. The single-file exporter (D-019)
 * embeds the output of {@link buildGddSchema} in the page `<head>`.
 *
 * Generation is behind a tiny {@link SchemaExporter} interface so an OGraf
 * exporter can be slotted in later without touching the exporter. OGraf is NOT
 * implemented here — current CasparCG clients consume GDD.
 */

const GDD_META_SCHEMA =
  'https://superflytv.github.io/GraphicsDataDefinition/gdd-meta-schema/v1/schema.json';

export interface SchemaExporter {
  /** Stable id of the schema flavour (e.g. `'gdd'`). */
  readonly id: string;
  /** Build the schema object for a scene's dynamic fields. */
  build(scene: Scene): GddSchema;
}

export interface GddSchema {
  $schema: string;
  type: 'object';
  properties: Record<string, GddProperty>;
  required: string[];
  gddPlayoutOptions: {
    client: { duration: number | null; steps: number; dataformat: 'json' };
  };
}

export interface GddProperty {
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  label: string;
  description?: string;
  gddType?: 'single-line' | 'multi-line' | 'color-rrggbb';
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  minimum?: number;
  maximum?: number;
  enum?: string[];
  default?: string | number | boolean | Record<string, unknown>[];
  /** D-025 — for `type: 'object'` (a nested child-instance namespace). */
  properties?: Record<string, GddProperty>;
  required?: string[];
  /** D-028 — for `type: 'array'` (a list field): the item schema. */
  items?: GddProperty;
}

/**
 * Build the GDD JSON-schema for a scene: one `properties` entry per dynamic
 * field (keyed by field id), `required[]` for required fields, and
 * `gddPlayoutOptions.client` with the active-range duration in ms (`steps: 1`,
 * `dataformat: 'json'`).
 */
export function buildGddSchema(scene: Scene): GddSchema {
  // D-025 — aggregate the (active) composition's own fields plus each nested child
  // instance's fields under the instance's namespace, as nested objects. A scene
  // with no nested instances yields a flat schema (unchanged).
  const { properties, required } = gddPropertiesFor(aggregateCompositionFields(scene, scene));

  // The play window is the active range (resized scene bar), falling back to the
  // full frame range. There is no "manual out" in the model yet, so duration is
  // always a number; `null` is reserved for that future case.
  const range = activeRangeOf(scene);
  const durationMs = Math.round(((range.out - range.in) / scene.frameRate) * 1000);

  return {
    $schema: GDD_META_SCHEMA,
    type: 'object',
    properties,
    required,
    gddPlayoutOptions: {
      client: { duration: durationMs, steps: 1, dataformat: 'json' },
    },
  };
}

/** Build `properties`/`required` for an aggregate — flat fields + nested-instance
 *  namespaces as `type: 'object'` sub-schemas (recursive). */
function gddPropertiesFor(aggregate: AggregatedFields): {
  properties: Record<string, GddProperty>;
  required: string[];
} {
  const properties: Record<string, GddProperty> = {};
  const required: string[] = [];
  for (const field of aggregate.fields) {
    properties[field.id] = gddPropertyFor(field);
    if (field.required) required.push(field.id);
  }
  for (const group of aggregate.groups) {
    const sub = gddPropertiesFor(group.aggregate);
    properties[group.name] = {
      type: 'object',
      label: group.name,
      properties: sub.properties,
      ...(sub.required.length > 0 ? { required: sub.required } : {}),
    };
  }
  return { properties, required };
}

function gddPropertyFor(field: DynamicField): GddProperty {
  const base = {
    label: field.label,
    ...(field.description !== undefined && field.description !== ''
      ? { description: field.description }
      : {}),
  };
  switch (field.type) {
    case 'text':
      return {
        ...base,
        type: 'string',
        gddType: 'single-line',
        ...(field.minLength !== undefined ? { minLength: field.minLength } : {}),
        ...(field.maxLength !== undefined ? { maxLength: field.maxLength } : {}),
        ...(field.pattern !== undefined ? { pattern: field.pattern } : {}),
        default: field.default,
      };
    case 'multiline':
      return {
        ...base,
        type: 'string',
        gddType: 'multi-line',
        ...(field.minLength !== undefined ? { minLength: field.minLength } : {}),
        ...(field.pattern !== undefined ? { pattern: field.pattern } : {}),
        default: field.default,
      };
    case 'number':
      return {
        ...base,
        type: 'number',
        ...(field.min !== undefined ? { minimum: field.min } : {}),
        ...(field.max !== undefined ? { maximum: field.max } : {}),
        default: field.default,
      };
    case 'color':
      return {
        ...base,
        type: 'string',
        gddType: 'color-rrggbb',
        pattern: '^#[0-9a-fA-F]{6}$',
        default: field.default,
      };
    case 'boolean':
      return { ...base, type: 'boolean', default: field.default };
    case 'select':
      return {
        ...base,
        type: 'string',
        enum: field.options.map((o) => o.value),
        default: field.default,
      };
    case 'image':
      // Emitted as a plain string (the asset id). A third-party GDD client can't
      // resolve the project's assets — the exporter flags this in preflight.
      return { ...base, type: 'string', default: field.defaultAssetId ?? '' };
    case 'list':
      // D-028 — array of open item objects (stable `id` reconcile key; consumers
      // read the keys they know, e.g. the ticker reads `text`). GDD v1 has no
      // array gddType, and third-party clients may not render an array editor —
      // the exporter flags this in preflight. `id` is not GDD-required: the
      // runtime falls back to positional ids for clients that omit it.
      return {
        ...base,
        type: 'array',
        items: {
          type: 'object',
          label: field.label,
          properties: {
            id: { type: 'string', label: 'id' },
            text: { type: 'string', label: 'text', gddType: 'single-line' },
          },
        },
        default: field.default,
      };
  }
}

/** Default schema exporter — GDD v1. Add an `OGrafExporter` here later. */
export const gddExporter: SchemaExporter = { id: 'gdd', build: buildGddSchema };
