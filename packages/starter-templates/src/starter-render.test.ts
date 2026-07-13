// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import {
  compositionClosure,
  migrateGlobalFieldsToCompositions,
  type Element,
  type FieldBinding,
  type Scene,
} from '@cg/shared-schema';
import { createRuntime } from '@cg/template-runtime';
import { STARTER_TEMPLATES } from './index.js';

/**
 * D-119 polish guard — a bound text field carries a REAL Persian default as the
 * element's base text, with the data key layered on top (no `{{token}}` base,
 * no binding `placeholder`). This test proves the two halves of that contract
 * against the REAL render engine, through the scene the Designer actually
 * exports:
 *
 *   - play with NO operator value  → the element shows the field's default
 *     (what the Designer canvas shows, and the on-air fallback).
 *   - play WITH an operator value  → the value replaces it.
 *
 * Fields live on the comp that owns their elements (the Designer's
 * `ensureCompositions` migration pushes them down), so an operator value is
 * namespaced by the composition-instance chain — see `docsOf` + `nest` below.
 */

/** Mirror the Designer's load + export projection (see import-starter-vcg.test.ts). */
function scopedExportOf(starterScene: Scene): Scene {
  const migrated = migrateGlobalFieldsToCompositions({ ...starterScene, layers: [] });
  const comps = migrated.compositions ?? [];
  const entryId = migrated.entryCompositionId ?? comps[0]?.id;
  const entry = comps.find((c) => c.id === entryId);
  if (entry === undefined) throw new Error('starter has no entry composition');
  const closure = compositionClosure(migrated, entry.id);
  return {
    ...migrated,
    name: entry.name,
    resolution: entry.resolution,
    frameRange: entry.frameRange,
    ...(entry.activeRange !== undefined ? { activeRange: entry.activeRange } : {}),
    ...(entry.lifecycle !== undefined ? { lifecycle: entry.lifecycle } : {}),
    ...(entry.playout !== undefined ? { playout: entry.playout } : {}),
    background: entry.background,
    layers: entry.layers,
    fields: entry.fields ?? [],
    bindings: entry.bindings ?? [],
    compositions: comps.filter((c) => closure.has(c.id)),
  };
}

/** Flatten a doc's layers to elements, descending through nesting containers. */
function elementsOf(layers: Scene['layers']): Element[] {
  const walk = (el: Element): Element[] =>
    el.type === 'container' ? [el, ...el.children.flatMap(walk)] : [el];
  return layers.flatMap((l) => l.children).flatMap(walk);
}

/** A field-owning doc (root scene or a composition) + its instance-name path. */
interface Doc {
  readonly path: readonly string[];
  readonly elements: readonly Element[];
  readonly fields: Scene['fields'];
  readonly bindings: readonly FieldBinding[];
}

/**
 * Every field-owning doc reachable from the root, keyed by the composition
 * INSTANCE-name chain the runtime namespaces values by (`applyScopedFieldValues`).
 */
function docsOf(scene: Scene): Doc[] {
  const out: Doc[] = [];
  const visit = (
    layers: Scene['layers'],
    fields: Scene['fields'],
    bindings: readonly FieldBinding[],
    path: readonly string[],
  ): void => {
    const elements = elementsOf(layers);
    out.push({ path, elements, fields, bindings });
    for (const el of elements) {
      if (el.type !== 'composition') continue;
      const comp = (scene.compositions ?? []).find((c) => c.id === el.compositionId);
      if (comp === undefined) continue;
      visit(comp.layers, comp.fields ?? [], comp.bindings ?? [], [...path, el.name]);
    }
  };
  visit(scene.layers, scene.fields, scene.bindings, []);
  return out;
}

/** Nest `leaf` under an instance-name `path` — the shape `runtime.play()` expects. */
function nest(path: readonly string[], leaf: Record<string, unknown>): Record<string, unknown> {
  return path.reduceRight<Record<string, unknown>>((acc, name) => ({ [name]: acc }), leaf);
}

/** Deep-merge the per-doc value namespaces into one operator payload. */
function merge(a: Record<string, unknown>, b: Record<string, unknown>): Record<string, unknown> {
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) {
    const prev = out[k];
    out[k] = isRecord(prev) && isRecord(v) ? merge(prev, v) : v;
  }
  return out;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** The bound TEXT fields of a scoped starter: element + default + namespace path. */
function boundTexts(
  scene: Scene,
): { elementId: string; fieldId: string; default: string; path: readonly string[] }[] {
  return docsOf(scene).flatMap((doc) =>
    doc.bindings.flatMap((b) => {
      if (b.target.kind !== 'text') return [];
      const el = doc.elements.find((e) => e.id === b.target.elementId);
      const field = doc.fields.find((f) => f.id === b.fieldId);
      if (el?.type !== 'text' || field?.type !== 'text') return [];
      return [{ elementId: el.id, fieldId: field.id, default: field.default, path: doc.path }];
    }),
  );
}

function textOf(root: HTMLElement, elementId: string): string {
  const el = root.querySelector(`[data-cg-element-id="${elementId}"]`);
  return el?.textContent ?? '';
}

describe('starter render — bound text shows its Persian default, operator value substitutes', () => {
  for (const starter of STARTER_TEMPLATES) {
    it(`${starter.id}: no operator value → the field default renders (never a raw token)`, async () => {
      const scoped = scopedExportOf(starter.scene);
      const bound = boundTexts(scoped);
      expect(bound.length, `${starter.id} has bound text`).toBeGreaterThan(0);

      const root = document.createElement('div');
      document.body.appendChild(root);
      const runtime = createRuntime(scoped, { skipFontLoad: true, root });
      await runtime.play({});

      for (const b of bound) {
        const rendered = textOf(root, b.elementId);
        expect(rendered, `${starter.id}.${b.fieldId} renders its default`).toBe(b.default);
        expect(rendered, `${starter.id}.${b.fieldId} shows no raw token`).not.toContain('{{');
      }
    });

    it(`${starter.id}: an operator value replaces the default`, async () => {
      const scoped = scopedExportOf(starter.scene);
      const bound = boundTexts(scoped);

      const values = bound
        .map((b) => nest(b.path, { [b.fieldId]: `مقدار ${b.fieldId}` }))
        .reduce<Record<string, unknown>>((acc, v) => merge(acc, v), {});

      const root = document.createElement('div');
      document.body.appendChild(root);
      const runtime = createRuntime(scoped, { skipFontLoad: true, root });
      await runtime.play(values);

      for (const b of bound) {
        expect(
          textOf(root, b.elementId),
          `${starter.id}.${b.fieldId} takes the operator value`,
        ).toBe(`مقدار ${b.fieldId}`);
      }
    });
  }
});
