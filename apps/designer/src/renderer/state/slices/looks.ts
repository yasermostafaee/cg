import {
  CUT_LOOK_TRANSITION,
  compositionClosure,
  compositionInstancesOf,
  lookGroupOf,
  uniqueInstanceName,
  type Composition,
  type Element,
  type Layer,
  type Look,
  type LookGroup,
  type Scene,
} from '@cg/shared-schema';
import { current, set } from '../store-core.js';
import {
  activeDocOf,
  deleteCompositionAndLinkedLooks,
  freshElementId,
  renameCompositionAndLinkedLooks,
  withActiveDoc,
} from '../scene-doc.js';
import { designerStore } from '../store.js';

/**
 * `multibox-layout-switch` §14 (LOOKS) phase 2 — **the LOOK authoring slice.**
 *
 * ── THE MODEL, restated where the actions live ──────────────────────────────
 *
 * A LOOK is a full sub-scene: a real COMPOSITION, instanced once at root level in the
 * multi-frame group's home document, and registered in the group by that instance's
 * element id. SOURCES are DERIVED from the plates (`deriveLookSources`) — `B-188` deleted the
 * group's declaration, so a source comes into existence by pointing a plate at a key and this
 * slice owns no source mutators at all. Exactly one look is active; the switch is a cut.
 *
 * ── WHY THE ACTIVE LOOK IS EDITOR STATE AND NOT SCENE STATE ─────────────────
 *
 * Which look the canvas SHOWS is a property of the session, like the selection and the
 * playhead. What a fresh take enters is the group's authored `defaultLookId` — that one
 * IS scene state, and the two must not be conflated: storing the session's pick in the
 * scene would put a value in the `.vcg` that the runtime must then be careful to ignore.
 *
 * ── 🔴 `B-188` — WHY THERE ARE NO SOURCE MUTATORS HERE ANY MORE ───────────
 *
 * `addLookSource` / `removeLookSource` are DELETED. They wrote a list that stored what the
 * plates already carried, and the cost of the second copy was `look-source-undeclared` — a
 * refusal that could only exist because two lists were able to disagree. Adding a source is now
 * pointing a plate at a key, in the Inspector; removing one is the last plate stopping.
 *
 * ⚠ **This also retires the no-rename policy, and it retires it in the author's favour.**
 * That policy read: _"a rename would have to rewrite every referencing plate in every look, and
 * a missed one is a dangling reference"_ — true, and it meant renaming `l1` to `cam1` was N
 * plate edits PLUS two declaration edits, with a window in which the scene was red. It is N
 * plate edits now, and no window: nothing can be dangling when the list IS the plates.
 */

/** The multi-frame group of the document being edited, or undefined. */
export function activeLookGroup(scene: Scene | null): LookGroup | undefined {
  if (scene === null) return undefined;
  return lookGroupOf(activeDocOf(scene));
}

/**
 * THE group of the whole PROJECT (v1: at most one per template) — root first, then the
 * compositions in order. The plate picker inside a look's composition needs the group
 * that lives on the PARENT document, which `activeLookGroup` cannot see from there.
 */
export function projectLookGroup(scene: Scene | null): LookGroup | undefined {
  if (scene === null) return undefined;
  const root = lookGroupOf(scene);
  if (root !== undefined) return root;
  for (const c of scene.compositions ?? []) {
    const g = lookGroupOf(c);
    if (g !== undefined) return g;
  }
  return undefined;
}

/**
 * Composition ids currently registered as Looks. A Look stores its INSTANCE id, so resolve that
 * reference through every possible group-home document rather than guessing from its name.
 */
export function registeredLookCompositionIds(scene: Scene | null): ReadonlySet<string> {
  const ids = new Set<string>();
  if (scene === null) return ids;
  const group = projectLookGroup(scene);
  if (group === undefined || group.looks.length === 0) return ids;
  const instanceIds = new Set(group.looks.map((look) => look.instanceId));
  for (const doc of [scene, ...(scene.compositions ?? [])]) {
    for (const layer of doc.layers) {
      for (const element of layer.children) {
        if (element.type === 'composition' && instanceIds.has(element.id)) {
          ids.add(element.compositionId);
        }
      }
    }
  }
  return ids;
}

/** The registered Look backed by `compositionId`, resolved through its real instance link. */
export function registeredLookForComposition(
  scene: Scene | null,
  compositionId: string,
): Look | undefined {
  if (scene === null) return undefined;
  const group = projectLookGroup(scene);
  if (group === undefined) return undefined;
  const instanceIds = new Set<string>();
  for (const doc of [scene, ...(scene.compositions ?? [])]) {
    for (const layer of doc.layers) {
      for (const element of layer.children) {
        if (element.type === 'composition' && element.compositionId === compositionId) {
          instanceIds.add(element.id);
        }
      }
    }
  }
  return group.looks.find((look) => instanceIds.has(look.instanceId));
}

/**
 * The look the canvas is currently showing, or null. Resolved rather than read: a stale
 * session id (its look deleted, another composition opened) must read as "the default",
 * never as a claim about a look that no longer exists.
 */
export function activeLook(scene: Scene | null): Look | null {
  const group = activeLookGroup(scene);
  if (group === undefined) return null;
  const picked = group.looks.find((l) => l.id === current.activeLookId);
  if (picked !== undefined) return picked;
  return group.looks.find((l) => l.id === group.defaultLookId) ?? group.looks[0] ?? null;
}

function writeGroup(next: LookGroup): Scene | null {
  if (current.scene === null) return null;
  return withActiveDoc(current.scene, { lookGroups: [next] });
}

/** Write the project's single Look group no matter which composition is currently open. */
function writeProjectGroup(scene: Scene, next: LookGroup): Scene {
  if (lookGroupOf(scene) !== undefined) return { ...scene, lookGroups: [next] };
  return {
    ...scene,
    compositions: (scene.compositions ?? []).map((composition) =>
      lookGroupOf(composition) !== undefined ? { ...composition, lookGroups: [next] } : composition,
    ),
  };
}

/**
 * The default name avoids every existing composition name/id as well as every Look id. Ordinary
 * full-frame compositions can be promoted to Looks, so a collision would still make the panel
 * ambiguous even though deleting a registered Look now deletes its backing composition too.
 */
function freshLookId(group: LookGroup, compositions: readonly Composition[]): string {
  const taken = new Set<string>([
    ...group.looks.map((l) => l.id),
    ...compositions.map((c) => c.name),
    ...compositions.map((c) => c.id),
  ]);
  let n = group.looks.length + 1;
  while (taken.has(`look-${String(n)}`)) n++;
  return `look-${String(n)}`;
}

/**
 * User-facing default name for a newly authored Preset. The stored Look id deliberately keeps its
 * legacy `look-N` shape so existing runtime payloads and saved projects need no migration.
 */
function freshPresetName(group: LookGroup, compositions: readonly Composition[]): string {
  const taken = new Set<string>([
    ...group.looks.flatMap((look) => [look.id, look.name]),
    ...compositions.flatMap((composition) => [composition.id, composition.name]),
  ]);
  let n = group.looks.length + 1;
  while (taken.has(`preset-${String(n)}`)) n++;
  return `preset-${String(n)}`;
}

/** The composition a Look's INSTANCE references, found project-wide by immutable instance id. */
function lookCompositionId(scene: Scene, look: Look): string | undefined {
  for (const doc of [scene, ...(scene.compositions ?? [])]) {
    for (const layer of doc.layers) {
      for (const element of layer.children) {
        if (element.id === look.instanceId && element.type === 'composition') {
          return element.compositionId;
        }
      }
    }
  }
  return undefined;
}

/**
 * Where THE group lives: `null` for the root scene, else the composition's id. The group's
 * home is the document a look is instanced into, so it is the one composition that can never
 * itself become a look.
 */
export function projectLookGroupHomeId(scene: Scene): string | null | undefined {
  if (lookGroupOf(scene) !== undefined) return null;
  const home = (scene.compositions ?? []).find((c) => lookGroupOf(c) !== undefined);
  return home === undefined ? undefined : home.id;
}

/**
 * ⭐ `DESIGNER-FIX-0905` §5 — **the compositions that can become a look, and are not one.**
 *
 * A composition may be explicitly promoted into a Look from the Compositions panel. Registered
 * Looks themselves have a synchronized lifecycle and are therefore excluded from this candidate
 * list.
 *
 * Eligible: every composition the size of the group's home document (a look is always
 * full-frame — a smaller one is a box, a title, a sub-part, and would be offered for the wrong
 * job) that is not the home itself, is not already a look, and can be nested into the home
 * without a cycle (the SAME reachability the Compositions panel's "Add to composition" uses —
 * `compositionClosure`, never a second walker).
 */
export function detachedLookCompositions(scene: Scene | null): Composition[] {
  if (scene === null) return [];
  const group = projectLookGroup(scene);
  if (group === undefined) return [];
  const homeId = projectLookGroupHomeId(scene);
  if (homeId === undefined) return [];
  const compositions = scene.compositions ?? [];
  const home = homeId === null ? scene : compositions.find((c) => c.id === homeId);
  if (home === undefined) return [];
  // The looks' compositions, read from the HOME document's instances — the group may live on
  // a composition that is not the active one, so this walks from the project root.
  const homeLayers = homeId === null ? scene.layers : home.layers;
  const lookComps = new Set<string>();
  for (const look of group.looks) {
    for (const layer of homeLayers) {
      for (const el of layer.children) {
        if (el.id === look.instanceId && el.type === 'composition') lookComps.add(el.compositionId);
      }
    }
  }
  return compositions.filter(
    (c) =>
      c.id !== homeId &&
      !lookComps.has(c.id) &&
      c.resolution.width === home.resolution.width &&
      c.resolution.height === home.resolution.height &&
      (homeId === null || !compositionClosure(scene, c.id).has(homeId)),
  );
}

/**
 * Instance `compId` full-frame in the group's home document and register it as a look —
 * the ONE registration path `addLook` (a fresh composition) and `addLookFromComposition`
 * (an existing one) share, so the two cannot come to register differently.
 */
function registerLook(compId: string, lookId: string, name: string): string | null {
  if (current.scene === null) return null;
  const homeId = projectLookGroupHomeId(current.scene);
  const withLook = projectLookGroup(current.scene);
  const composition = (current.scene.compositions ?? []).find(
    (candidate) => candidate.id === compId,
  );
  if (homeId === undefined || withLook === undefined || composition === undefined) return null;
  const home =
    homeId === null
      ? current.scene
      : current.scene.compositions?.find((candidate) => candidate.id === homeId);
  if (home === undefined) return null;
  const instanceId = freshElementId();
  const instance: Element = {
    id: instanceId,
    name: uniqueInstanceName(
      composition.name,
      compositionInstancesOf({ layers: home.layers }).map((candidate) => candidate.name),
    ),
    type: 'composition',
    compositionId: compId,
    transform: {
      position: { x: 0, y: 0 },
      size: { w: composition.resolution.width, h: composition.resolution.height },
      scale: { x: 1, y: 1 },
      rotation: 0,
      anchor: { x: 0, y: 0 },
    },
    opacity: 1,
    visible: true,
    locked: false,
    zIndex: 0,
  };
  const addToHome = (layers: readonly Layer[]): Layer[] =>
    layers.length === 0
      ? [
          {
            id: `L${String(Date.now())}`,
            name: 'Layer 1',
            visible: true,
            locked: false,
            children: [instance],
            blendMode: 'normal',
          },
        ]
      : layers.map((layer, index) =>
          index === 0 ? { ...layer, children: [...layer.children, instance] } : layer,
        );
  const look: Look = {
    id: lookId,
    name,
    instanceId,
    entered: CUT_LOOK_TRANSITION,
  };
  const nextGroup: LookGroup = {
    ...withLook,
    looks: [...withLook.looks, look],
    defaultLookId: withLook.defaultLookId ?? look.id,
  };
  const sceneWithInstance: Scene =
    homeId === null
      ? { ...current.scene, layers: addToHome(current.scene.layers) }
      : {
          ...current.scene,
          compositions: (current.scene.compositions ?? []).map((candidate) =>
            candidate.id === homeId
              ? { ...candidate, layers: addToHome(candidate.layers) }
              : candidate,
          ),
        };
  const scene = writeProjectGroup(sceneWithInstance, nextGroup);
  set({ scene, activeLookId: look.id, selection: new Set<string>() });
  return look.id;
}

export const looksSlice = {
  /**
   * The toolbar icon's action: give the ACTIVE document its multi-frame group. A second
   * group is refused here as well as by the preflight — v1 is one group per template,
   * and an idempotent create keeps the toolbar button safe to press twice.
   */
  createLookGroup(): void {
    if (current.scene === null) return;
    // PROJECT-wide guard, not active-doc: v1 is ONE group per template, and the active
    // doc may be a look's own composition — a group created there would be a nested
    // second group the preflight then refuses. Idempotent, so the toolbar button is
    // safe to press twice.
    if (projectLookGroup(current.scene) !== undefined) return;
    const scene = writeGroup({ id: 'group-1', looks: [] });
    if (scene !== null) set({ scene });
  },

  /**
   * Remove the project's multi-frame group and every Look it owns. The UI confirms first when
   * the group is non-empty; this store action performs the accepted operation atomically so one
   * undo restores the group, registrations, instances and backing compositions together.
   */
  removeLookGroup(): void {
    if (current.scene === null) return;
    const group = projectLookGroup(current.scene);
    const homeId = projectLookGroupHomeId(current.scene);
    if (group === undefined || homeId === undefined) return;
    const compositionIds = group.looks
      .map((look) => lookCompositionId(current.scene as Scene, look))
      .filter((id): id is string => id !== undefined);
    let nextScene = current.scene;
    for (const compositionId of compositionIds) {
      nextScene = deleteCompositionAndLinkedLooks(nextScene, compositionId).scene;
    }
    if (homeId === null) {
      nextScene = { ...nextScene };
      delete nextScene.lookGroups;
    } else {
      nextScene = {
        ...nextScene,
        compositions: (nextScene.compositions ?? []).map((composition) => {
          if (composition.id !== homeId) return composition;
          const next = { ...composition };
          delete next.lookGroups;
          return next;
        }),
      };
    }
    const activeWasDeleted =
      current.activeCompositionId !== null && compositionIds.includes(current.activeCompositionId);
    const home =
      homeId === null
        ? nextScene
        : nextScene.compositions?.find((composition) => composition.id === homeId);
    set({
      scene: nextScene,
      activeLookId: null,
      ...(activeWasDeleted
        ? {
            activeCompositionId: homeId,
            selection: new Set<string>(),
            selectedKeyframe: null,
            selectedKeyframes: [],
            keyframeInspectorOpen: false,
            currentFrame: home?.frameRange.in ?? nextScene.frameRange.in,
            timelinePlaying: false,
            timelinePlaybackMode: null,
          }
        : {}),
    });
    designerStore.showNotice(
      group.looks.length === 0
        ? 'Multi-frame group removed.'
        : `Multi-frame group and ${String(group.looks.length)} Preset${group.looks.length === 1 ? '' : 's'} deleted.`,
      { tone: 'neutral' },
    );
  },

  /**
   * Add a LOOK: a new full-frame composition (the sub-scene), instanced at (0, 0) at
   * full size in the group's home document, registered by the instance's element id.
   * The first look becomes the default (the schema requires a default once any look
   * exists). Returns the new look's id, or null if there is no group to add to.
   */
  addLook(): string | null {
    if (current.scene === null) return null;
    const group = projectLookGroup(current.scene);
    if (group === undefined) return null;

    // The sub-scene composition, sized to the home document. Created WITHOUT navigating
    // into it (unlike `addComposition`) — authoring enters it explicitly via
    // `editLookContents` or the canvas double-click drill (D-024).
    const homeId = projectLookGroupHomeId(current.scene);
    const doc =
      homeId === null
        ? current.scene
        : current.scene.compositions?.find((composition) => composition.id === homeId);
    if (doc === undefined) return null;
    const existingComps = current.scene.compositions ?? [];
    let n = existingComps.length + 1;
    while (existingComps.some((c) => c.id === `comp-${String(n)}`)) n++;
    const lookId = freshLookId(group, existingComps);
    const presetName = freshPresetName(group, existingComps);
    const compId = `comp-${String(n)}`;
    const comp = {
      id: compId,
      name: presetName,
      resolution: { ...doc.resolution },
      frameRange: { in: 0, out: Math.max(1, current.scene.frameRange.out) },
      editorBackdrop: 'transparent' as const,
      layers: [],
    };
    set({ scene: { ...current.scene, compositions: [...existingComps, comp] } });
    return registerLook(compId, lookId, presetName);
  },

  /**
   * Make an EXISTING eligible composition a Look. Instance it full-frame in the group's home
   * document and register it through the same path `addLook` uses. No composition is created.
   *
   * The look's id is the composition's name when that is a free, id-shaped `look-N` (so a
   * restored `look-1` is `look-1` again — the id reaches the export, and an operator's
   * per-look mapping keys on it); otherwise a fresh id, with the composition's name as the
   * look's name. Refused (null) when there is no group on the active document, the
   * composition is unknown, is already a look, or cannot be nested without a cycle.
   */
  addLookFromComposition(compId: string): string | null {
    if (current.scene === null) return null;
    const group = projectLookGroup(current.scene);
    if (group === undefined) return null;
    if (!detachedLookCompositions(current.scene).some((c) => c.id === compId)) return null;
    const comp = (current.scene.compositions ?? []).find((c) => c.id === compId);
    if (comp === undefined) return null;
    const wanted = comp.name.trim();
    const idFree = !group.looks.some((l) => l.id === wanted);
    const lookId =
      /^look-\d+$/.test(wanted) && idFree
        ? wanted
        : freshLookId(group, current.scene.compositions ?? []);
    return registerLook(compId, lookId, wanted === '' ? lookId : wanted);
  },

  /**
   * Remove one authored Look object: registration, home-document instance and backing
   * composition. The shared composition deletion path owns the atomic cleanup so deleting
   * from either the Inspector or Compositions panel produces the same project.
   */
  removeLook(id: string): void {
    const group = projectLookGroup(current.scene);
    const look = group?.looks.find((l) => l.id === id);
    if (group === undefined || look === undefined || current.scene === null) return;
    const compId = lookCompositionId(current.scene, look);
    if (compId !== undefined) designerStore.deleteComposition(compId);
  },

  renameLook(id: string, name: string): void {
    const group = projectLookGroup(current.scene);
    const trimmed = name.trim();
    if (group === undefined || trimmed === '' || current.scene === null) return;
    const look = group.looks.find((candidate) => candidate.id === id);
    if (look === undefined) return;
    let scene: Scene | null = writeProjectGroup(current.scene, {
      ...group,
      looks: group.looks.map((candidate) =>
        candidate.id === id ? { ...candidate, name: trimmed } : candidate,
      ),
    });
    const compositionId = lookCompositionId(current.scene, look);
    if (scene !== null && compositionId !== undefined) {
      scene = renameCompositionAndLinkedLooks(scene, compositionId, trimmed);
    }
    if (scene !== null) set({ scene });
  },

  /** Which look a fresh TAKE enters — scene state, the schema's required default. */
  setDefaultLook(id: string): void {
    if (current.scene === null) return;
    const group = projectLookGroup(current.scene);
    if (group === undefined || !group.looks.some((l) => l.id === id)) return;
    set({ scene: writeProjectGroup(current.scene, { ...group, defaultLookId: id }) });
  },

  /** Which look the CANVAS shows — session state, driven by the picker. */
  setActiveLook(id: string | null): void {
    set({ activeLookId: id });
  },

  /**
   * Open a look's sub-scene for authoring — the same navigation as the Compositions
   * panel and the D-024 double-click drill, named here so the inspector can offer it
   * beside the look it belongs to.
   */
  editLookContents(id: string): void {
    const group = projectLookGroup(current.scene);
    const look = group?.looks.find((l) => l.id === id);
    if (look === undefined || current.scene === null) return;
    const compositionId = lookCompositionId(current.scene, look);
    if (compositionId === undefined) return;
    set({ activeLookId: look.id });
    designerStore.openCompositionAndSelect(compositionId, null);
  },
} as const;
