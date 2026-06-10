import type {
  DynamicField,
  FieldBinding,
  FrameRange,
  Layer,
  Lifecycle,
  Playout,
  Resolution,
  Scene,
} from '@cg/shared-schema';
import { current } from './store-core.js';

/**
 * The "active document" layer shared by every domain slice. The editor edits
 * either the main scene (`activeCompositionId === null`) or one of
 * `scene.compositions`; these accessors read and write that active document's
 * layers and doc-level fields (size / duration / background / fields+bindings)
 * so every mutation stays agnostic of which one is active. Plus `locate` (find
 * an element) and `editSceneOf` (project the active comp into a flat `Scene` for
 * the inspector/preview/exporter).
 *
 * Pure helpers — they take a `Scene` and return data or a fresh `Scene`. The one
 * exception is `activeCompId`, which reads the live `current.activeCompositionId`
 * from the engine. See `state/README.md`.
 */

export interface EditDocFields {
  resolution: Resolution;
  // D-026 — fps is project-level (`Scene.frameRate`), shared by every composition;
  // it is NOT a per-document field, so it is not edited through the active doc.
  frameRange: FrameRange;
  activeRange?: FrameRange | undefined;
  lifecycle?: Lifecycle | undefined;
  playout?: Playout | undefined;
  background: Scene['background'];
}

export function activeCompId(): string | null {
  return current.activeCompositionId;
}

export function activeLayersOf(scene: Scene): readonly Layer[] {
  const id = activeCompId();
  if (id !== null) {
    const c = scene.compositions?.find((x) => x.id === id);
    if (c !== undefined) return c.layers;
  }
  return scene.layers;
}

export function withActiveLayers(scene: Scene, layers: Layer[]): Scene {
  const id = activeCompId();
  if (id !== null && scene.compositions?.some((x) => x.id === id) === true) {
    return {
      ...scene,
      compositions: scene.compositions.map((c) => (c.id === id ? { ...c, layers } : c)),
    };
  }
  return { ...scene, layers };
}

export function activeDocOf(scene: Scene): EditDocFields {
  const id = activeCompId();
  if (id !== null) {
    const c = scene.compositions?.find((x) => x.id === id);
    if (c !== undefined) return c;
  }
  return scene;
}

export function withActiveDoc(scene: Scene, patch: Partial<EditDocFields>): Scene {
  const id = activeCompId();
  if (id !== null && scene.compositions?.some((x) => x.id === id) === true) {
    return {
      ...scene,
      compositions: scene.compositions.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    };
  }
  return { ...scene, ...patch };
}

/**
 * D-025 — the active document's OWN fields/bindings (per-composition). Mutations
 * to data keys / bindings go through here so they scope to the open composition,
 * not the project root.
 */
export function activeFieldData(scene: Scene): {
  fields: readonly DynamicField[];
  bindings: readonly FieldBinding[];
} {
  const id = activeCompId();
  const c = id !== null ? scene.compositions?.find((x) => x.id === id) : undefined;
  const doc = c ?? scene;
  return { fields: doc.fields ?? [], bindings: doc.bindings ?? [] };
}

export function withActiveFieldData(
  scene: Scene,
  patch: { fields?: DynamicField[]; bindings?: FieldBinding[] },
): Scene {
  const id = activeCompId();
  if (id !== null && scene.compositions?.some((x) => x.id === id) === true) {
    return {
      ...scene,
      compositions: scene.compositions.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    };
  }
  return { ...scene, ...patch };
}

export function editSceneOf(scene: Scene | null, id: string | null): Scene | null {
  // No "main scene": editing always targets a composition. When none is open
  // (or the id is stale) there is no editable surface — the UI shows the
  // "No Active Compositions" empty state.
  if (scene === null || id === null) return null;
  const c = scene.compositions?.find((x) => x.id === id);
  if (c === undefined) return null;
  return {
    ...scene,
    name: c.name,
    resolution: c.resolution,
    // D-026 — fps is project-level; the projected scene keeps the project fps.
    frameRate: scene.frameRate,
    frameRange: c.frameRange,
    activeRange: c.activeRange,
    lifecycle: c.lifecycle,
    playout: c.playout,
    background: c.background,
    layers: c.layers,
    // D-025 — fields/bindings are per-composition; surface the active comp's own
    // (the inspector/preview/exporter read these). `compositions` stays from the
    // root so nested instances resolve and aggregate.
    fields: c.fields ?? [],
    bindings: c.bindings ?? [],
  };
}

/** Find the layer + index of an element. Used by every mutation. */
export function locate(
  scene: Scene,
  elementId: string,
): { layer: Layer; layerIdx: number; elIdx: number } | null {
  const layers = activeLayersOf(scene);
  for (let li = 0; li < layers.length; li++) {
    const layer = layers[li];
    if (layer === undefined) continue;
    const elIdx = layer.children.findIndex((e) => e.id === elementId);
    if (elIdx !== -1) return { layer, layerIdx: li, elIdx };
  }
  return null;
}
