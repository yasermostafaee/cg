import { compositionClosure, type Scene } from '@cg/shared-schema';
import { compositionPackageId } from './package-id.js';

/**
 * Project one authoring composition into the Scene shape a `.vcg` plays.
 *
 * This sits below the Designer so internal export tools use the same root
 * flattening, field projection, nested-composition closure and package identity.
 * Editor-only optimisations remain the caller's responsibility.
 */
export function projectCompositionForExport(
  scene: Scene | null,
  compositionId: string | null,
): Scene | null {
  if (scene === null || compositionId === null) return null;
  const composition = scene.compositions?.find((candidate) => candidate.id === compositionId);
  if (composition === undefined) return null;

  const closure = compositionClosure(scene, compositionId);
  const projected: Scene = {
    ...scene,
    name: composition.name,
    resolution: composition.resolution,
    frameRate: scene.frameRate,
    frameRange: composition.frameRange,
    activeRange: composition.activeRange,
    lifecycle: composition.lifecycle,
    playout: composition.playout,
    editorBackdrop: composition.editorBackdrop,
    layers: composition.layers,
    fields: composition.fields ?? [],
    bindings: composition.bindings ?? [],
    arrangements: composition.arrangements ?? [],
    lookGroups: composition.lookGroups ?? [],
  };

  // The selected composition is now the root. Keeping the project entry pointer
  // would either leave a dangling id or misname a nested composition as the entry.
  const { entryCompositionId: _projectEntry, ...rootIsTheEntry } = projected;
  return {
    ...rootIsTheEntry,
    id: compositionPackageId(scene.id, compositionId),
    compositions: (scene.compositions ?? []).filter((candidate) => closure.has(candidate.id)),
  };
}
