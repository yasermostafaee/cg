import {
  CUT_LOOK_TRANSITION,
  compositionClosure,
  lookGroupOf,
  type Composition,
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

/**
 * ⭐ `DESIGNER-FIX-0905` §5 / `B-219` — **the default name avoids every existing COMPOSITION
 * name too, not only every look id.** A removed look leaves its composition in the project by
 * design (see `removeLook`); this namer used to count only `group.looks`, so after removing
 * `look-1`…`look-3` the next `+ Look` was `look-1` again — a SECOND composition named `look-1`
 * beside the orphan (measured: a fresh empty entry, not a reuse and not an adoption, but
 * indistinguishable from either in the Compositions panel). A collidable default is the
 * mechanism behind all three readings, so the default no longer collides.
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

/** The composition a look's INSTANCE references, found in the group's home document. */
function lookCompositionId(scene: Scene, look: Look): string | undefined {
  for (const layer of activeLayersOf(scene)) {
    for (const el of layer.children) {
      if (el.id === look.instanceId) return (el as { compositionId?: string }).compositionId;
    }
  }
  return undefined;
}

/**
 * Where THE group lives: `null` for the root scene, else the composition's id. The group's
 * home is the document a look is instanced into, so it is the one composition that can never
 * itself become a look.
 */
function lookGroupHomeId(scene: Scene): string | null | undefined {
  if (lookGroupOf(scene) !== undefined) return null;
  const home = (scene.compositions ?? []).find((c) => lookGroupOf(c) !== undefined);
  return home === undefined ? undefined : home.id;
}

/**
 * ⭐ `DESIGNER-FIX-0905` §5 — **the compositions that can become a look, and are not one.**
 *
 * A composition is a REUSABLE object a look points at, not a look's private storage:
 * `removeLook` keeps it on purpose, as recoverable work. The defect was that nothing said so
 * where it mattered and nothing let the author reuse it — the Looks panel read "No looks
 * yet" while the Compositions panel listed `look-1`, `look-2`, `look-3`. This is the list the
 * panel offers back, with **Make it a look** beside each.
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
  const homeId = lookGroupHomeId(scene);
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
  const instanceId = designerStore.addCompositionInstance(compId);
  if (instanceId === null) return null;

  const withLook = activeLookGroup(current.scene);
  if (withLook === undefined) return null;
  const look: Look = {
    id: lookId,
    name,
    instanceId,
    entered: CUT_LOOK_TRANSITION,
  };
  const scene = writeGroup({
    ...withLook,
    looks: [...withLook.looks, look],
    defaultLookId: withLook.defaultLookId ?? look.id,
  });
  // `addElement` auto-selects the new instance, which flips the right panel to
  // ELEMENT properties — hiding this very section the moment a look is created (the
  // panel-switches-away phenomenon the section docstring warns about). The author's
  // next act lives in the looks list, so creation leaves nothing selected.
  if (scene !== null) set({ scene, activeLookId: look.id, selection: new Set<string>() });
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
    const lookId = freshLookId(group, existingComps);
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
    return registerLook(compId, lookId, lookId);
  },

  /**
   * ⭐ `DESIGNER-FIX-0905` §5 — **make an EXISTING composition a look**: the reuse door a
   * removed look's composition never had. Instances it full-frame in the group's home
   * document and registers it, through the same path `addLook` takes for a fresh one — the
   * authored sub-scene, plates and all, comes back as it was. No composition is created.
   *
   * The look's id is the composition's name when that is a free, id-shaped `look-N` (so a
   * restored `look-1` is `look-1` again — the id reaches the export, and an operator's
   * per-look mapping keys on it); otherwise a fresh id, with the composition's name as the
   * look's name. Refused (null) when there is no group on the active document, the
   * composition is unknown, is already a look, or cannot be nested without a cycle.
   */
  addLookFromComposition(compId: string): string | null {
    if (current.scene === null) return null;
    const group = activeLookGroup(current.scene);
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
   * Remove a look: its registration and its INSTANCE go; its COMPOSITION stays in the
   * project (the authored sub-scene is recoverable work, listed in the Compositions
   * panel — deleting it is the author's separate, explicit act). A removed default
   * promotes the first survivor, mirroring `removeArrangement`'s heir rule: a group with
   * looks but no default is unsavable by schema.
   *
   * `DESIGNER-FIX-0905` §5 — and it SAYS SO, at the moment it matters: a notice names the
   * composition that stays and the two doors it now has (the Looks panel's **Make it a
   * look**, the Compositions panel's delete). The panels used to contradict each other in
   * silence.
   */
  removeLook(id: string): void {
    const group = activeLookGroup(current.scene);
    const look = group?.looks.find((l) => l.id === id);
    if (group === undefined || look === undefined || current.scene === null) return;
    const compId = lookCompositionId(current.scene, look);
    const compName = (current.scene.compositions ?? []).find((c) => c.id === compId)?.name;
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
    if (compName !== undefined) {
      designerStore.showNotice(
        `Look “${look.name}” removed. Its composition “${compName}” stays in the project — ` +
          'make it a look again from the Looks panel, or delete it in the Compositions panel.',
      );
    }
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
