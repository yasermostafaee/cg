import type {
  AnimatableProperty,
  Composition,
  DynamicField,
  Element,
  ElementAnimation,
  FieldBinding,
  FrameRange,
  Layer,
  Lifecycle,
  Playout,
  Resolution,
  Scene,
} from '@cg/shared-schema';
import { compositionClosure, migrateGlobalFieldsToCompositions } from '@cg/shared-schema';
import { current } from './store-core.js';
import { dropFullyOffFrameForExport } from './off-frame.js';

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

/**
 * D-086 — project a composition for EXPORT: {@link editSceneOf}'s layer projection
 * (so the root comp renders as `scene.layers` — the runtime's only play-entry) PLUS
 * filter `scene.compositions` to `rootId`'s transitive nested CLOSURE, so sibling
 * compositions — and their images/fonts/assets — are excluded from the package, and
 * the exporter's preflight (which walks `scene.compositions`) auto-scopes to the
 * closure too. Project-level fields (fonts, metadata) are preserved. Returns null
 * when no comp is open / the id is stale (same contract as `editSceneOf`).
 *
 * The closure follows BOTH `composition` and `repeater` child refs, so a comp pulled
 * in only by a repeater is still packaged (the runtime resolves a repeater's child
 * from `scene.compositions`). The root comp itself is NOT left in `compositions`
 * (its layers are now the top-level doc; nothing reachable references it).
 */
export function scopeSceneToComposition(scene: Scene | null, id: string | null): Scene | null {
  const projected = editSceneOf(scene, id);
  if (projected === null || scene === null || id === null) return null;
  const closure = compositionClosure(scene, id);
  const scoped: Scene = {
    ...projected,
    compositions: (scene.compositions ?? []).filter((c) => closure.has(c.id)),
  };
  // D-071 Phase A — EXPORT-ONLY: drop fully-off-frame STATIC elements so they don't
  // bloat the package. Output is unchanged (they were already clipped invisible by
  // the runtime's `.cg-stage { overflow: hidden }`). `editSceneOf` (the canvas
  // projection) and Save are NOT routed through here, so staging shapes persist.
  return dropFullyOffFrameForExport(scene, scoped);
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

// ── Shared id generators + scene-load transforms ───────────────────────────

export function freshCompositionId(): string {
  return `comp-${String(Date.now())}-${String(Math.floor(Math.random() * 1e6))}`;
}

export function freshKeyframeId(): string {
  return `kf-${String(Date.now())}-${String(Math.floor(Math.random() * 1e6))}`;
}

/** A short unique element id in the `el-…` convention used across the app. */
export function freshElementId(): string {
  return `el-${String(Date.now())}-${String(Math.floor(Math.random() * 1e6))}`;
}

/**
 * Reassign a fresh id to an element and (recursively) to every nested container
 * child, so a pasted / duplicated subtree never collides with the original ids.
 * Keeps the name (used for nested children + composition duplication).
 */
export function reassignIdsDeep(el: Element): Element {
  const next = { ...el, id: freshElementId() } as Element;
  if (next.type === 'container') {
    next.children = next.children.map(reassignIdsDeep);
  }
  return next;
}

/**
 * Normalise a loaded project to the composition model (no "main scene"). If it
 * already has compositions, open the first. Otherwise, if the legacy root has
 * any layers, migrate them into one composition and open it. A genuinely empty
 * project gets no compositions and opens to the empty state. Returns the
 * (possibly rewritten) scene and the composition to open.
 */
export function ensureCompositions(scene: Scene): { scene: Scene; activeId: string | null } {
  const comps = scene.compositions ?? [];
  if (comps.length > 0) {
    // D-025 — distribute any legacy GLOBAL fields/bindings into the owning comps.
    const next = migrateGlobalFieldsToCompositions({ ...scene, layers: [] });
    return { scene: next, activeId: comps[0]?.id ?? null };
  }
  const rootLayers = Array.isArray(scene.layers) ? scene.layers : [];
  if (rootLayers.length > 0) {
    const comp: Composition = {
      id: freshCompositionId(),
      name: scene.name === '' ? 'comp1' : scene.name,
      resolution: scene.resolution,
      frameRange: scene.frameRange,
      ...(scene.activeRange !== undefined ? { activeRange: scene.activeRange } : {}),
      background: scene.background,
      layers: rootLayers,
      fields: [],
      bindings: [],
    };
    // Move the root's global fields/bindings into the migrated composition.
    const next = migrateGlobalFieldsToCompositions({
      ...scene,
      compositions: [comp],
      layers: [],
    });
    return { scene: next, activeId: comp.id };
  }
  return { scene: { ...scene, compositions: [], layers: [] }, activeId: null };
}

/**
 * Ensure every keyframe carries an `id`. Scenes authored before the id field
 * (or starter templates) load without ids; assigning them on load means the
 * timeline can always track/stack points reliably. The runtime ignores ids.
 */
export function normalizeKeyframeIds(scene: Scene): Scene {
  if (!Array.isArray(scene.layers)) return scene;
  function fixEl(el: Element): Element {
    let next = el;
    if (el.animation !== undefined) {
      const tracks = el.animation.tracks;
      const nextTracks: ElementAnimation['tracks'] = {};
      for (const key of Object.keys(tracks) as AnimatableProperty[]) {
        const track = tracks[key];
        if (track === undefined) continue;
        nextTracks[key] = {
          keyframes: track.keyframes.map((k) =>
            k.id === undefined ? { ...k, id: freshKeyframeId() } : k,
          ),
        };
      }
      next = { ...next, animation: { tracks: nextTracks } } as Element;
    }
    if (next.type === 'container') {
      next = { ...next, children: next.children.map(fixEl) } as Element;
    }
    return next;
  }
  return { ...scene, layers: scene.layers.map((l) => ({ ...l, children: l.children.map(fixEl) })) };
}
