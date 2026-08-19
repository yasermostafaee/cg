import {
  CUT_LOOK_TRANSITION,
  lookGroupOf,
  type Look,
  type LookGroup,
  type Scene,
} from '@cg/shared-schema';
import { current, set } from '../store-core.js';
import { activeDocOf, activeLayersOf, withActiveDoc } from '../scene-doc.js';
import { designerStore } from '../store.js';

/**
 * `multibox-layout-switch` §14 (LOOKS) phase 2 — **the LOOK authoring slice.**
 *
 * ── THE MODEL, restated where the actions live ──────────────────────────────
 *
 * A LOOK is a full sub-scene: a real COMPOSITION, instanced once at root level in the
 * multi-frame group's home document, and registered in the group by that instance's
 * element id. SOURCES are declared ONCE on the group; a plate REFERENCES a declared
 * source through a picker (never a free-typed routeKey — identity stays structural).
 * Exactly one look is active; the switch is a cut.
 *
 * ── WHY THE ACTIVE LOOK IS EDITOR STATE AND NOT SCENE STATE ─────────────────
 *
 * Which look the canvas SHOWS is a property of the session, like the selection and the
 * playhead. What a fresh take enters is the group's authored `defaultLookId` — that one
 * IS scene state, and the two must not be conflated: storing the session's pick in the
 * scene would put a value in the `.vcg` that the runtime must then be careful to ignore.
 *
 * ── WHY A SOURCE'S routeKey IS FIXED AT DECLARATION (add/remove, no rename) ─
 *
 * Plates reference a source BY its routeKey. An in-place rename would have to rewrite
 * every referencing plate across every look's composition, and a missed one is a dangling
 * reference that surfaces only at export. Add + remove keeps the failure mode legible:
 * removing a referenced source leaves plates the preflight names one by one
 * (`look-source-undeclared`), which is exactly the surface built to carry that news.
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

function freshLookId(group: LookGroup): string {
  let n = group.looks.length + 1;
  while (group.looks.some((l) => l.id === `look-${String(n)}`)) n++;
  return `look-${String(n)}`;
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
    const scene = writeGroup({ id: 'group-1', sources: [], looks: [] });
    if (scene !== null) set({ scene });
  },

  /** Declare a source ONCE on the group. Empty or duplicate routeKeys are no-ops. */
  addLookSource(routeKey: string): void {
    const group = activeLookGroup(current.scene);
    const key = routeKey.trim();
    if (group === undefined || key === '') return;
    if (group.sources.some((s) => s.routeKey === key)) return;
    const scene = writeGroup({
      ...group,
      sources: [...group.sources, { routeKey: key, dynamic: false }],
    });
    if (scene !== null) set({ scene });
  },

  /**
   * Remove a declared source. Plates still referencing it become the preflight's
   * `look-source-undeclared` refusals — deliberately allowed, so removal is always
   * possible and the consequences are named per plate rather than blocked wholesale.
   */
  removeLookSource(routeKey: string): void {
    const group = activeLookGroup(current.scene);
    if (group === undefined) return;
    if (!group.sources.some((s) => s.routeKey === routeKey)) return;
    const scene = writeGroup({
      ...group,
      sources: group.sources.filter((s) => s.routeKey !== routeKey),
    });
    if (scene !== null) set({ scene });
  },

  /**
   * Add a LOOK: a new full-frame composition (the sub-scene), instanced at (0, 0) at
   * full size in the group's home document, registered by the instance's element id.
   * The first look becomes the default (the schema requires a default once any look
   * exists). Returns the new look's id, or null if there is no group to add to.
   */
  addLook(): string | null {
    if (current.scene === null) return null;
    const group = activeLookGroup(current.scene);
    if (group === undefined) return null;

    // The sub-scene composition, sized to the home document. Created WITHOUT navigating
    // into it (unlike `addComposition`) — authoring enters it explicitly via
    // `editLookContents` or the canvas double-click drill (D-024).
    const doc = activeDocOf(current.scene);
    const existingComps = current.scene.compositions ?? [];
    let n = existingComps.length + 1;
    while (existingComps.some((c) => c.id === `comp-${String(n)}`)) n++;
    const lookId = freshLookId(group);
    const compId = `comp-${String(n)}`;
    const comp = {
      id: compId,
      name: lookId,
      resolution: { ...doc.resolution },
      frameRange: { in: 0, out: Math.max(1, current.scene.frameRange.out) },
      editorBackdrop: 'transparent' as const,
      layers: [],
    };
    set({ scene: { ...current.scene, compositions: [...existingComps, comp] } });

    const instanceId = designerStore.addCompositionInstance(compId);
    if (instanceId === null) return null;

    const withLook = activeLookGroup(current.scene);
    if (withLook === undefined) return null;
    const look: Look = {
      id: lookId,
      name: lookId,
      instanceId,
      entered: CUT_LOOK_TRANSITION,
    };
    const scene = writeGroup({
      ...withLook,
      looks: [...withLook.looks, look],
      defaultLookId: withLook.defaultLookId ?? look.id,
    });
    if (scene !== null) set({ scene, activeLookId: look.id });
    return look.id;
  },

  /**
   * Remove a look: its registration and its INSTANCE go; its COMPOSITION stays in the
   * project (the authored sub-scene is recoverable work, listed in the Compositions
   * panel — deleting it is the author's separate, explicit act). A removed default
   * promotes the first survivor, mirroring `removeArrangement`'s heir rule: a group with
   * looks but no default is unsavable by schema.
   */
  removeLook(id: string): void {
    const group = activeLookGroup(current.scene);
    const look = group?.looks.find((l) => l.id === id);
    if (group === undefined || look === undefined) return;
    const remaining = group.looks.filter((l) => l.id !== id);
    const next: LookGroup = { ...group, looks: remaining };
    if (group.defaultLookId === id) {
      if (remaining[0] !== undefined) next.defaultLookId = remaining[0].id;
      else delete next.defaultLookId;
    }
    const scene = writeGroup(next);
    if (scene !== null) {
      set({ scene, ...(current.activeLookId === id ? { activeLookId: null } : {}) });
    }
    designerStore.removeElement(look.instanceId);
  },

  renameLook(id: string, name: string): void {
    const group = activeLookGroup(current.scene);
    if (group === undefined || name.trim() === '') return;
    if (!group.looks.some((l) => l.id === id)) return;
    const scene = writeGroup({
      ...group,
      looks: group.looks.map((l) => (l.id === id ? { ...l, name: name.trim() } : l)),
    });
    if (scene !== null) set({ scene });
  },

  /** Which look a fresh TAKE enters — scene state, the schema's required default. */
  setDefaultLook(id: string): void {
    const group = activeLookGroup(current.scene);
    if (group === undefined || !group.looks.some((l) => l.id === id)) return;
    const scene = writeGroup({ ...group, defaultLookId: id });
    if (scene !== null) set({ scene });
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
    const group = activeLookGroup(current.scene);
    const look = group?.looks.find((l) => l.id === id);
    if (look === undefined || current.scene === null) return;
    const instance = (function find(): { compositionId?: string } | undefined {
      for (const layer of activeLayersOf(current.scene as Scene)) {
        for (const el of layer.children) {
          if (el.id === look.instanceId) return el as { compositionId?: string };
        }
      }
      return undefined;
    })();
    if (instance?.compositionId === undefined) return;
    set({ activeLookId: look.id });
    designerStore.openCompositionAndSelect(instance.compositionId, null);
  },
} as const;
