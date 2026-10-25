import { describe, expect, it } from 'vitest';
import type { Composition, Element, Layer, Scene } from '@cg/shared-schema';
import { compositionPackageId, projectCompositionForExport } from '../src/index.js';

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

  it('returns null for a missing selection without changing the project', () => {
    const source = project();
    expect(projectCompositionForExport(source, 'missing')).toBeNull();
    expect(projectCompositionForExport(source, null)).toBeNull();
    expect(projectCompositionForExport(null, 'root')).toBeNull();
  });
});
