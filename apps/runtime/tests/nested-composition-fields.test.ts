import { describe, expect, it, beforeEach } from 'vitest';
import { pack } from '@cg/vcg-format';
import { CommandBuilder } from '@cg/caspar-bridge';
import {
  aggregateCompositionFields,
  compositionClosure,
  defaultNestedValues,
  isFieldNamespace,
  migrateGlobalFieldsToCompositions,
  type AssetEntry,
  type FieldValues,
  type FontReference,
  type Manifest,
  type Scene,
} from '@cg/shared-schema';
import { STARTER_TEMPLATES } from '@cg/starter-templates';
import { produceTemplateDelivery } from '../src/renderer/features/library/templateDelivery.js';
import {
  __resetDraftsForTest,
  buildApplyPayload,
  stageField,
  valueAt,
} from '../src/renderer/features/inspector/draftStore.js';

/**
 * B-067 — a D-119 starter is TWO compositions: the graphic (a title card) nested inside a
 * full-frame composition that positions it. The authored fields live on the NESTED comp,
 * so the Runtime — which built the operator's form from the ENTRY comp's flat fields —
 * showed "No fields." and the starter could not be edited on air.
 *
 * The address a nested field needs is not invented here: it is the composition instance's
 * stable `name`, which the `.vcg`'s own GDD already advertises as
 * `{ instanceName: { fieldId } }` and which `@cg/template-runtime` resolves at render
 * (`bindings.ts` reads `values[child.name]`; see its `nested-fields.test.ts` and
 * `starter-templates/src/starter-render.test.ts`, which prove that shape RENDERS). These
 * tests pin the Runtime half of that chain: import → Inspector draft → applied payload →
 * the `CG UPDATE` data argument, all under that same key.
 */

/** The Designer's real export projection for a starter (mirrors import-starter-vcg.test.ts). */
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
    layers: entry.layers,
    fields: entry.fields ?? [],
    bindings: entry.bindings ?? [],
    compositions: comps.filter((c) => closure.has(c.id)),
  };
}

async function starterVcg(id: string, scene: Scene): Promise<Uint8Array> {
  const fontDeps: readonly FontReference[] = scene.fonts;
  const assetIndex: readonly AssetEntry[] = [];
  const manifestExtras = {
    id: `tpl-${id}`,
    name: scene.name,
    authoring: {
      designerVersion: '0.0.0',
      createdAt: '2026-07-13T00:00:00.000Z',
      exportedAt: '2026-07-13T00:01:00.000Z',
    },
    compatibility: { minRuntimeVersion: '0.0.0', minCasparCGVersion: '2.3.0' },
    fontDeps,
    assetIndex,
  } satisfies Pick<Manifest, 'id' | 'name' | 'authoring' | 'compatibility'> & {
    fontDeps: readonly FontReference[];
    assetIndex: readonly AssetEntry[];
  };
  return pack({
    scene,
    manifestExtras,
    indexHtml: '<!doctype html><html><body>placeholder</body></html>',
    cgJs: '/* placeholder template runtime */',
    cgCss: '/* placeholder template styles */',
    assets: new Map(),
  });
}

/** A starter whose fields live ONLY in a nested composition — the B-067 shape. */
function nestedStarter(): { id: string; scene: Scene } {
  for (const starter of STARTER_TEMPLATES) {
    const scoped = scopedExportOf(starter.scene);
    const aggregate = aggregateCompositionFields(scoped, scoped);
    const nestedFieldCount = aggregate.groups.reduce((n, g) => n + g.aggregate.fields.length, 0);
    if (aggregate.fields.length === 0 && nestedFieldCount > 0) {
      return { id: starter.id, scene: scoped };
    }
  }
  throw new Error('no starter with fields exclusively in a nested composition');
}

beforeEach(() => {
  __resetDraftsForTest();
});

describe('B-067 — a two-composition starter exposes its nested fields', () => {
  it('the delivered TemplateInfo carries the nested fields (not an empty form)', async () => {
    const { id, scene } = nestedStarter();
    const delivery = await produceTemplateDelivery(await starterVcg(id, scene));
    const { template } = delivery;

    // The pre-fix behavior: the ENTRY comp's own fields are genuinely empty — which is
    // exactly why reading them alone rendered "No fields."
    expect(scene.fields ?? []).toEqual([]);
    expect(template.fields).toEqual([]);

    // …but the field CLOSURE is not: the nested instance contributes a namespace group.
    const groups = template.groups ?? [];
    expect(groups.length).toBeGreaterThan(0);
    const nestedFields = groups.flatMap((g) => g.aggregate.fields);
    expect(nestedFields.length).toBeGreaterThan(0);

    // The Inspector's "is there anything to show?" test now passes.
    const somethingToRender = template.fields.length > 0 || groups.length > 0;
    expect(somethingToRender).toBe(true);
  });

  it('the group key is the composition INSTANCE NAME — the key the renderer binds by', async () => {
    const { id, scene } = nestedStarter();
    const { template } = await produceTemplateDelivery(await starterVcg(id, scene));
    const group = (template.groups ?? [])[0];
    if (group === undefined) throw new Error('expected a nested group');

    // Derived INDEPENDENTLY from the scene: the `composition` element instance whose
    // referenced comp owns the fields. `@cg/template-runtime` resolves a nested binding
    // via `values[<that instance name>]`, so this equality is what makes an edited value
    // actually reach the graphic.
    const instances = scene.layers
      .flatMap((l) => l.children)
      .filter((e) => e.type === 'composition');
    expect(instances.map((e) => e.name)).toContain(group.name);
    expect(group.compositionId).toBe(instances.find((e) => e.name === group.name)?.compositionId);
  });

  it('load seeds the NESTED value shape, so CG ADD carries real data under the namespace', async () => {
    const { id, scene } = nestedStarter();
    const { template } = await produceTemplateDelivery(await starterVcg(id, scene));

    // Exactly what LibraryPanel.loadOntoStack seeds.
    const seeded: FieldValues = defaultNestedValues({
      fields: template.fields,
      groups: template.groups ?? [],
    });

    const group = (template.groups ?? [])[0];
    if (group === undefined) throw new Error('expected a nested group');
    const namespace = seeded[group.name];
    expect(isFieldNamespace(namespace)).toBe(true);
    for (const f of group.aggregate.fields) {
      expect(valueAt(seeded, [group.name, f.id])).toBeDefined();
    }
  });
});

describe('B-067 — an edited nested field round-trips to the wire under its binding key', () => {
  it('the applied payload nests the edit, and CG UPDATE carries it verbatim', async () => {
    const { id, scene } = nestedStarter();
    const { template } = await produceTemplateDelivery(await starterVcg(id, scene));
    const group = (template.groups ?? [])[0];
    const field = group?.aggregate.fields[0];
    if (group === undefined || field === undefined) throw new Error('expected a nested field');

    const applied: FieldValues = defaultNestedValues({
      fields: template.fields,
      groups: template.groups ?? [],
    });

    // The operator edits the nested field in the Inspector (R-003 staging), then applies.
    stageField('item-1', [group.name, field.id], 'خبر فوری');
    const payload = buildApplyPayload('item-1', applied);

    // It lands at { <instanceName>: { <fieldId>: value } } — NOT at a flat top-level key.
    expect(valueAt(payload, [group.name, field.id])).toBe('خبر فوری');
    expect(payload[field.id]).toBeUndefined();

    // …and the un-edited siblings in that namespace survive (a shallow overlay would
    // have replaced the whole namespace object and dropped them).
    for (const sibling of group.aggregate.fields.filter((f) => f.id !== field.id)) {
      expect(valueAt(payload, [group.name, sibling.id])).toEqual(
        valueAt(applied, [group.name, sibling.id]),
      );
    }

    // THE WIRE: the real CommandBuilder the bridge uses. The nested object survives
    // serialization + AMCP escaping unchanged, so `window.update` JSON.parses back
    // exactly the shape `@cg/template-runtime` binds by. No AMCP/quoter change was needed.
    const line = new CommandBuilder().update({ channel: 1, layer: 10 }, payload);
    const dataArg = /CG 1-10 UPDATE 0 "(.*)"$/s.exec(line)?.[1];
    if (dataArg === undefined) throw new Error(`unexpected CG UPDATE line: ${line}`);
    const onWire: unknown = JSON.parse(dataArg.replace(/\\"/g, '"').replace(/\\\\/g, '\\'));
    expect(valueAt(onWire as FieldValues, [group.name, field.id])).toBe('خبر فوری');
  });

  it('same-id fields in two different instances stay distinct', () => {
    // Two instances of the same composition — the `home`/`away` case D-025 exists for.
    const applied: FieldValues = {
      home: { teamName: 'HOME', score: 0 },
      away: { teamName: 'AWAY', score: 0 },
    };
    stageField('item-1', ['home', 'teamName'], 'CHANGED');
    const payload = buildApplyPayload('item-1', applied);

    expect(valueAt(payload, ['home', 'teamName'])).toBe('CHANGED');
    expect(valueAt(payload, ['away', 'teamName'])).toBe('AWAY'); // untouched
    expect(valueAt(payload, ['home', 'score'])).toBe(0); // sibling survives
  });

  it('REGRESSION — a flat (single-composition) template is unchanged', () => {
    const applied: FieldValues = { headline: 'old', ticker: 'keep' };
    stageField('item-1', ['headline'], 'new');
    expect(buildApplyPayload('item-1', applied)).toEqual({ headline: 'new', ticker: 'keep' });
  });
});
