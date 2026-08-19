import { afterEach, describe, expect, it } from 'vitest';
import { MemoryKv, MemoryWorkspace } from '@cg/storage';
import { ProjectStore } from '../src/platform/ProjectStore.js';
import { designerStore } from '../src/renderer/state/store.js';
import {
  activeLook,
  activeLookGroup,
  projectLookGroup,
} from '../src/renderer/state/slices/looks.js';
import { activeLayersOf } from '../src/renderer/state/scene-doc.js';

/**
 * `multibox-layout-switch` §14 (LOOKS) phase 2 — **the LOOK authoring slice.**
 *
 * The model under test: a LOOK is a real COMPOSITION instanced once at root level and
 * registered in the group by that instance's element id; SOURCES are declared once on
 * the group; the session's active look is editor state, the group's default is scene
 * state, and the two never conflate.
 */

afterEach(() => {
  designerStore._reset();
});

function fresh(): void {
  const projects = new ProjectStore(new MemoryWorkspace(), new MemoryKv());
  const { scene } = projects.newScene('looks', 'custom');
  designerStore.setScene(scene, null);
}

const scene = () => designerStore.get().scene;

describe('createLookGroup — the toolbar action', () => {
  it('creates THE group on the active document; pressing twice creates nothing more', () => {
    fresh();
    expect(projectLookGroup(scene())).toBeUndefined();
    designerStore.createLookGroup();
    designerStore.createLookGroup();
    const group = projectLookGroup(scene());
    expect(group?.sources).toEqual([]);
    expect(group?.looks).toEqual([]);
    // A fresh project opens INSIDE its entry composition, so the group lands on that
    // composition (the projection carries it to the export path) — count every home.
    const all = [
      ...(scene()?.lookGroups ?? []),
      ...(scene()?.compositions ?? []).flatMap((c) => c.lookGroups ?? []),
    ];
    expect(all).toHaveLength(1);
  });

  it('🔴 the guard is PROJECT-wide — no second group from inside another composition', () => {
    fresh();
    designerStore.createLookGroup();
    const compId = designerStore.addComposition();
    expect(compId).not.toBeNull();
    // The active doc is now the new composition; a create here must refuse — a group
    // made inside a sub-document would be v1's forbidden second group.
    designerStore.createLookGroup();
    const all = [
      ...(scene()?.lookGroups ?? []),
      ...(scene()?.compositions ?? []).flatMap((c) => c.lookGroups ?? []),
    ];
    expect(all).toHaveLength(1);
  });
});

describe('sources — declared once, add/remove, routeKey fixed at declaration', () => {
  it('adds unique sources; duplicates and blanks are no-ops', () => {
    fresh();
    designerStore.createLookGroup();
    designerStore.addLookSource('live-1');
    designerStore.addLookSource('live-1');
    designerStore.addLookSource('  ');
    designerStore.addLookSource('live-2');
    expect(activeLookGroup(scene())?.sources.map((s) => s.routeKey)).toEqual(['live-1', 'live-2']);
  });

  it('removes a source; the plates that still reference it are for the PREFLIGHT to name', () => {
    fresh();
    designerStore.createLookGroup();
    designerStore.addLookSource('live-1');
    designerStore.removeLookSource('live-1');
    expect(activeLookGroup(scene())?.sources).toEqual([]);
  });
});

describe('addLook — a real composition, instanced at root, registered by instance id', () => {
  it('creates the sub-scene comp + a full-frame root instance, registers it, first look is default and active', () => {
    fresh();
    const editingHome = designerStore.get().activeCompositionId;
    designerStore.createLookGroup();
    const id = designerStore.addLook();
    expect(id).toBe('look-1');

    const group = activeLookGroup(scene());
    const look = group?.looks[0];
    expect(group?.defaultLookId).toBe('look-1');
    expect(designerStore.get().activeLookId).toBe('look-1');

    // The instance element exists at root level of the group's home document…
    const rootChildren = activeLayersOf(scene()!).flatMap((l) => [...l.children]);
    const instance = rootChildren.find((el) => el.id === look?.instanceId);
    expect(instance?.type).toBe('composition');
    // …full-frame at the origin, so look-local coordinates ARE scene coordinates.
    expect(instance?.transform.position).toEqual({ x: 0, y: 0 });
    expect(instance?.transform.size).toEqual({
      w: scene()!.resolution.width,
      h: scene()!.resolution.height,
    });
    // …and its composition is in the project.
    const compId = (instance as { compositionId?: string }).compositionId;
    expect(scene()?.compositions?.some((c) => c.id === compId)).toBe(true);
    // Creation did NOT navigate into the sub-scene (authoring enters explicitly).
    expect(designerStore.get().activeCompositionId).toBe(editingHome);
  });

  it('a second look does not steal the default', () => {
    fresh();
    designerStore.createLookGroup();
    designerStore.addLook();
    designerStore.addLook();
    const group = activeLookGroup(scene());
    expect(group?.looks.map((l) => l.id)).toEqual(['look-1', 'look-2']);
    expect(group?.defaultLookId).toBe('look-1');
  });
});

describe('removeLook — the registration and the INSTANCE go; the composition stays', () => {
  it('removes instance + registration, promotes the default heir, keeps the sub-scene comp', () => {
    fresh();
    designerStore.createLookGroup();
    designerStore.addLook();
    designerStore.addLook();
    const group = activeLookGroup(scene());
    const first = group?.looks[0];
    const compCountBefore = scene()?.compositions?.length ?? 0;

    designerStore.removeLook('look-1');

    const after = activeLookGroup(scene());
    expect(after?.looks.map((l) => l.id)).toEqual(['look-2']);
    expect(after?.defaultLookId).toBe('look-2');
    const rootChildren = activeLayersOf(scene()!).flatMap((l) => [...l.children]);
    expect(rootChildren.some((el) => el.id === first?.instanceId)).toBe(false);
    // The authored sub-scene is recoverable work — it stays in the project.
    expect(scene()?.compositions?.length).toBe(compCountBefore);
  });
});

describe('default vs active — scene state vs session state, never conflated', () => {
  it('setDefaultLook changes what a take enters; setActiveLook changes only the session', () => {
    fresh();
    designerStore.createLookGroup();
    designerStore.addLook();
    designerStore.addLook();

    designerStore.setDefaultLook('look-2');
    expect(activeLookGroup(scene())?.defaultLookId).toBe('look-2');

    designerStore.setActiveLook('look-1');
    expect(designerStore.get().activeLookId).toBe('look-1');
    expect(activeLookGroup(scene())?.defaultLookId).toBe('look-2');

    // A stale session id resolves to the default, never to a claim about a dead look.
    designerStore.setActiveLook('look-gone');
    expect(activeLook(scene())?.id).toBe('look-2');
  });
});

describe('editLookContents — the same navigation as the Compositions panel', () => {
  it('opens the sub-scene composition of the look for authoring', () => {
    fresh();
    designerStore.createLookGroup();
    designerStore.addLook();
    designerStore.editLookContents('look-1');
    const st = designerStore.get();
    expect(st.activeCompositionId).not.toBeNull();
    const comp = st.scene?.compositions?.find((c) => c.id === st.activeCompositionId);
    expect(comp?.name).toBe('look-1');
  });
});
