import { describe, expect, it } from 'vitest';
import {
  requiredRuntimeVersionForScene,
  SceneSchema,
  type Composition,
  type Element,
  type Layer,
  type Scene,
} from '@cg/shared-schema';
import {
  compositionPackageId,
  projectCompositionForExport,
  packProject,
  readProjectDocument,
} from '../src/index.js';

const transform = {
  position: { x: 0, y: 0 },
  size: { w: 100, h: 100 },
  scale: { x: 1, y: 1 },
  rotation: 0,
  anchor: { x: 0, y: 0 },
};

function instance(id: string, compositionId: string): Element {
  return {
    id,
    name: id,
    type: 'composition',
    compositionId,
    transform,
    opacity: 1,
    visible: true,
    locked: false,
    zIndex: 0,
  };
}

function layer(id: string, children: Element[]): Layer {
  return { id, name: id, visible: true, locked: false, blendMode: 'normal', children };
}

function composition(id: string, children: Element[]): Composition {
  return {
    id,
    name: `Name ${id}`,
    resolution: { width: 1280, height: 720 },
    frameRange: { in: 5, out: 80 },
    activeRange: { in: 10, out: 70 },
    editorBackdrop: '#112233',
    layers: [layer(`layer-${id}`, children)],
    fields: [{ id: `field-${id}`, label: id, required: false, type: 'text', default: id }],
    bindings: [],
  };
}

function project(): Scene {
  return {
    schemaVersion: 1,
    id: 'project-1',
    name: 'Project',
    templateType: 'custom',
    resolution: { width: 1920, height: 1080 },
    frameRate: 50,
    safeAreas: { title: 10, action: 5 },
    frameRange: { in: 0, out: 100 },
    editorBackdrop: 'transparent',
    layers: [],
    entryCompositionId: 'root',
    compositions: [
      composition('root', [instance('nested-instance', 'nested')]),
      composition('nested', []),
      composition('sibling', []),
    ],
    fields: [],
    bindings: [],
    fonts: [],
    metadata: {
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
  };
}

describe('projectCompositionForExport', () => {
  it('flattens the selected composition, keeps only its nested closure and drops the project entry', () => {
    const source = project();
    const projected = projectCompositionForExport(source, 'root');

    expect(projected).not.toBeNull();
    expect(projected?.name).toBe('Name root');
    expect(projected?.resolution).toEqual({ width: 1280, height: 720 });
    expect(projected?.layers[0]?.id).toBe('layer-root');
    expect(projected?.fields[0]?.id).toBe('field-root');
    expect(projected?.compositions?.map((candidate) => candidate.id)).toEqual(['nested']);
    expect(projected?.id).toBe(compositionPackageId(source.id, 'root'));
    expect(projected).not.toHaveProperty('entryCompositionId');
    expect(source.entryCompositionId).toBe('root');
  });

  it('exports only the selected authored position and removes the editor output reference', () => {
    const source = project();
    source.outputRaster = { width: 3840, height: 2160 };
    source.defaultPosition = { anchor: 'top-left', offset: { x: 10, y: 20 } };
    const root = source.compositions?.find((candidate) => candidate.id === 'root');
    if (root === undefined) throw new Error('Missing root');
    root.defaultPosition = { anchor: 'bottom-right', offset: { x: -40, y: -30 } };
    const projected = projectCompositionForExport(source, 'root');
    expect(projected?.defaultPosition).toEqual(root.defaultPosition);
    expect(projected?.resolution).toEqual(root.resolution);
    expect(projected?.layers).toBe(root.layers);
    expect(projected?.compositions?.[0]?.layers).toBe(source.compositions?.[1]?.layers);
    expect(projected).not.toHaveProperty('outputRaster');
    expect(projected?.outputReference).toEqual(source.outputRaster);
    expect(projectCompositionForExport(source, 'nested')?.defaultPosition).toEqual(
      source.defaultPosition,
    );
    expect(source.outputRaster).toEqual({ width: 3840, height: 2160 });
  });

  it('derives native output reference from the original project and keeps legacy default reference absent', () => {
    const source = project();
    expect(projectCompositionForExport(source, 'root')).not.toHaveProperty('outputReference');
    source.resolution = { width: 1280, height: 720 };
    const hd = projectCompositionForExport(source, 'root');
    expect(hd?.outputReference).toEqual({ width: 1280, height: 720 });
    expect(hd?.resolution).toEqual({ width: 1280, height: 720 });
    if (hd === null) throw new Error('Missing projected HD composition');
    expect(requiredRuntimeVersionForScene(hd)).toBe('1.2.12');
    source.outputRaster = { width: 1024, height: 1024 };
    expect(projectCompositionForExport(source, 'nested')?.outputReference).toEqual({
      width: 1024,
      height: 1024,
    });
    source.outputRaster = { width: 1920, height: 1080 };
    source.outputReference = { width: 1280, height: 720 };
    expect(projectCompositionForExport(source, 'root')).not.toHaveProperty('outputReference');
  });

  it('retains a cropped native export reference through a saved imported project snapshot and re-export', async () => {
    const source = project();
    source.outputRaster = { width: 1280, height: 720 };
    const root = source.compositions?.find(({ id }) => id === 'root');
    if (root === undefined) throw new Error('Missing root');
    root.resolution = { width: 100, height: 100 };
    const compiled = projectCompositionForExport(source, 'root');
    if (compiled === null) throw new Error('Missing compiled composition');
    const { outputRaster: _editorRaster, ...reopenedProject } = {
      ...source,
      resolution: compiled.resolution,
      outputReference: compiled.outputReference,
    };
    const snapshot = await packProject({
      scene: reopenedProject,
      index: [],
      files: new Map(),
      savedAt: '2026-11-18T00:00:00.000Z',
    });
    const restored = (await readProjectDocument(snapshot)).scene;
    const reexported = projectCompositionForExport(restored, 'root');
    expect(restored).not.toHaveProperty('outputRaster');
    expect(restored.outputReference).toEqual({ width: 1280, height: 720 });
    expect(reexported?.outputReference).toEqual({ width: 1280, height: 720 });
    expect(reexported?.resolution).toEqual({ width: 100, height: 100 });
    expect(restored.layers).toEqual(source.layers);
  });

  it('projects Auto layout permission only from the composition being exported', () => {
    const original = project();
    const authored = SceneSchema.parse({
      ...original,
      compositions: original.compositions?.map((candidate) =>
        candidate.id === 'nested' ? { ...candidate, allowOperatorAutoLayout: true } : candidate,
      ),
    });

    const parent = projectCompositionForExport(authored, 'root');
    const child = projectCompositionForExport(authored, 'nested');
    const originalChild = projectCompositionForExport(original, 'nested');
    if (child === null || originalChild === null) throw new Error('Missing nested composition');
    expect(parent?.allowOperatorAutoLayout).toBeUndefined();
    expect(parent?.compositions?.[0]?.allowOperatorAutoLayout).toBe(true);
    expect(child.allowOperatorAutoLayout).toBe(true);
    expect(requiredRuntimeVersionForScene(child)).toBe(
      requiredRuntimeVersionForScene(originalChild),
    );
  });

  it('removes cross-composition wires in the export without removing published fields', () => {
    const original = project();
    const [root, nested] = original.compositions ?? [];
    const layer = nested?.layers[0];
    if (root === undefined || nested === undefined || layer === undefined) {
      throw new Error('Missing source composition or nested layer');
    }
    const localElement = {
      ...instance('local-target', 'sibling'),
      valueRules: {
        input: { kind: 'field', fieldId: 'rule-input' },
        rules: [
          {
            condition: { comparator: '=', value: 'hide' },
            effect: { elementId: 'local-target', property: 'visible', value: false },
          },
        ],
      },
    } satisfies Element;
    layer.children.push(localElement);
    const field = (id: string) =>
      ({ id, label: id, required: false, type: 'text', default: id }) as const;
    nested.fields = ['unused', 'multi-wire', 'unbound', 'rule-input'].map(field);
    nested.bindings = [
      { fieldId: 'unused', target: { kind: 'text', elementId: 'nested-instance' } },
      { fieldId: 'multi-wire', target: { kind: 'visible', elementId: 'nested-instance' } },
      { fieldId: 'multi-wire', target: { kind: 'visible', elementId: localElement.id } },
      { fieldId: 'rule-input', target: { kind: 'text', elementId: 'nested-instance' } },
    ];
    root.fields = [field('root-unused'), field('root-unbound')];
    root.bindings = [
      { fieldId: 'root-unused', target: { kind: 'text', elementId: localElement.id } },
    ];

    const projected = projectCompositionForExport(original, 'root');
    const exportedChild = projected?.compositions?.find(({ id }) => id === 'nested');

    expect(projected?.fields.map(({ id }) => id)).toEqual(['root-unbound']);
    expect(projected?.bindings).toEqual([]);
    expect(exportedChild?.fields?.map(({ id }) => id)).toEqual([
      'multi-wire',
      'unbound',
      'rule-input',
    ]);
    expect(exportedChild?.bindings).toEqual([
      { fieldId: 'multi-wire', target: { kind: 'visible', elementId: localElement.id } },
    ]);
    expect(root?.bindings).toHaveLength(1);
    expect(nested?.bindings).toHaveLength(4);
  });

  it('returns null for a missing selection without changing the project', () => {
    const source = project();
    expect(projectCompositionForExport(source, 'missing')).toBeNull();
    expect(projectCompositionForExport(source, null)).toBeNull();
    expect(projectCompositionForExport(null, 'root')).toBeNull();
  });
});
