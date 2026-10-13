import { afterEach, describe, expect, it } from 'vitest';
import { MemoryKv, MemoryWorkspace } from '@cg/storage';
import type { Element } from '@cg/shared-schema';
import { ProjectStore } from '../src/platform/ProjectStore.js';
import { designerStore } from '../src/renderer/state/store.js';
import { activeLookGroup, detachedLookCompositions } from '../src/renderer/state/slices/looks.js';
import { activeLayersOf } from '../src/renderer/state/scene-doc.js';
import { defaultLiveSource } from '../src/renderer/state/element-defaults.js';

/**
 * ⭐ `DESIGNER-FIX-0905` §5 / `B-219` — **the orphan composition, ESTABLISHED before it was fixed.**
 *
 * The report: the Compositions panel listed `comp1`, `look-1`, `look-2`, `look-3` while the
 * Looks section read "No looks yet", and the next `+ Look` was named `look-1` again. Three
 * things that could mean, in rising order of harm — (1) a SECOND entry appears, (2) the new
 * look REUSES the orphan's entry, (3) the new look silently ADOPTS the orphan's content,
 * arriving pre-populated with an old look's plates. The third is far worse than clutter and
 * had not been reported, which is exactly why it was measured rather than assumed.
 *
 * 🔴 MEASURED on `e02215c5`, before any fix, by the first version of this file: **case (1)**.
 * `addLook` built a fresh composition with a fresh id (`comp-N`, skipping existing ids) and NO
 * layers, named it `look-1` because `freshLookId` counted only the group's looks, and left the
 * three orphans untouched. No reuse, no adoption — a second `look-1` beside the first.
 *
 * The model, and therefore the fix: a composition is a REUSABLE object a look points at
 * (`removeLook` keeps it as recoverable work, by design). So the orphan is not the bug; that
 * nothing said so and nothing let the author reuse it was. Below: the namer no longer
 * collides, the composition is offered back, **Make it a look** restores it as authored, and
 * removal says where the composition went. Deleting a composition stays the author's own act.
 */

afterEach(() => {
  designerStore._reset();
});

const scene = () => designerStore.get().scene;
const comps = () => scene()?.compositions ?? [];
const looks = () => activeLookGroup(scene())?.looks ?? [];

function fresh(): string | null {
  const projects = new ProjectStore(new MemoryWorkspace(), new MemoryKv());
  const { scene } = projects.newScene('looks', 'custom');
  designerStore.setScene(scene, null);
  return designerStore.get().activeCompositionId;
}

/** Three looks, each authored with one plate, then all three removed — the owner's state. */
function threeOrphans(): { home: string | null; orphanIds: string[] } {
  const home = fresh();
  designerStore.createLookGroup();
  const orphanIds: string[] = [];
  for (let i = 1; i <= 3; i++) {
    const lookId = designerStore.addLook();
    if (lookId === null) throw new Error('addLook refused');
    designerStore.editLookContents(lookId);
    const compId = designerStore.get().activeCompositionId;
    if (compId === null) throw new Error('editLookContents did not open the sub-scene');
    orphanIds.push(compId);
    designerStore.addElement({
      ...defaultLiveSource(`plate-${String(i)}`, 100 * i, 100),
      routeKey: `guest-${String(i)}`,
    } as unknown as Element);
    designerStore.setActiveComposition(home);
  }
  for (const id of ['look-1', 'look-2', 'look-3']) designerStore.removeLook(id);
  return { home, orphanIds };
}

const platesIn = (compId: string): string[] =>
  (comps().find((c) => c.id === compId)?.layers ?? [])
    .flatMap((l) => l.children)
    .filter((el) => el.type === 'video-placeholder')
    .map((el) => el.id);

describe('§5 — the orphan compositions', () => {
  it('removing every look keeps every composition, plates and all', () => {
    const { orphanIds } = threeOrphans();
    expect(looks()).toEqual([]);
    for (const [i, id] of orphanIds.entries()) {
      expect(platesIn(id), `${id} keeps its plate`).toEqual([`plate-${String(i + 1)}`]);
    }
    expect(comps().map((c) => c.name)).toEqual(
      expect.arrayContaining(['look-1', 'look-2', 'look-3']),
    );
  });

  it('removing a look SAYS where its composition went', () => {
    fresh();
    designerStore.createLookGroup();
    designerStore.addLook();
    designerStore.removeLook('look-1');
    expect(designerStore.get().notice).toMatch(/composition “look-1” stays in the project/i);
    expect(designerStore.get().notice).toMatch(/make it a look again/i);
  });

  it('🔴 the next + Look no longer collides: `look-4`, a fresh EMPTY composition, the orphans untouched', () => {
    const { orphanIds } = threeOrphans();
    const before = comps().length;
    const lookId = designerStore.addLook();
    // Case 1 was a second `look-1`; the namer now avoids every existing composition name.
    expect(lookId).toBe('look-4');
    const look = looks().find((l) => l.id === lookId);
    const instance = activeLayersOf(scene()!)
      .flatMap((l) => [...l.children])
      .find((el) => el.id === look?.instanceId) as { compositionId?: string } | undefined;
    const newComp = comps().find((c) => c.id === instance?.compositionId);
    expect(newComp?.name).toBe('look-4');
    // A new entry beside the orphans (never a reuse)…
    expect(comps().length).toBe(before + 1);
    expect(orphanIds).not.toContain(newComp?.id);
    // …carrying none of their content (never an adoption)…
    expect(newComp?.layers.flatMap((l) => l.children)).toEqual([]);
    // …and the orphans are untouched.
    for (const [i, id] of orphanIds.entries()) {
      expect(platesIn(id)).toEqual([`plate-${String(i + 1)}`]);
    }
  });

  it('the orphans are OFFERED back — full-frame, not a look, nestable; the home and a box are not', () => {
    const { home, orphanIds } = threeOrphans();
    // A BOX-sized composition (a title, a sub-part) is not a candidate for a full-frame look.
    designerStore.addComposition();
    const boxId = designerStore.get().activeCompositionId;
    if (boxId === null) throw new Error('no box comp');
    designerStore.updateScene({ resolution: { width: 640, height: 360 } });
    designerStore.setActiveComposition(home);

    const offered = detachedLookCompositions(scene()).map((c) => c.id);
    expect(offered).toEqual(orphanIds);
    expect(offered).not.toContain(home);
    expect(offered).not.toContain(boxId);
  });

  it('⭐ Make it a look RESTORES the authored look — same id, its plate back on stage, no new composition', () => {
    const { orphanIds } = threeOrphans();
    const before = comps().length;
    const first = orphanIds[0];
    if (first === undefined) throw new Error('no orphan');

    const id = designerStore.addLookFromComposition(first);

    expect(id).toBe('look-1');
    expect(looks().map((l) => l.id)).toEqual(['look-1']);
    expect(looks()[0]?.name).toBe('look-1');
    expect(activeLookGroup(scene())?.defaultLookId).toBe('look-1');
    expect(designerStore.get().activeLookId).toBe('look-1');
    // The instance sits full-frame at the origin of the home document and points at the
    // ORPHAN — no composition was created.
    const instance = activeLayersOf(scene()!)
      .flatMap((l) => [...l.children])
      .find((el) => el.id === looks()[0]?.instanceId) as
      | { compositionId?: string; transform: { position: { x: number; y: number } } }
      | undefined;
    expect(instance?.compositionId).toBe(first);
    expect(instance?.transform.position).toEqual({ x: 0, y: 0 });
    expect(comps().length).toBe(before);
    expect(platesIn(first)).toEqual(['plate-1']);
    // And it is no longer offered, while the other two still are.
    expect(detachedLookCompositions(scene()).map((c) => c.id)).toEqual(orphanIds.slice(1));
  });

  it('a composition whose name is not id-shaped gets a fresh id and keeps its name', () => {
    const { orphanIds } = threeOrphans();
    const first = orphanIds[0];
    if (first === undefined) throw new Error('no orphan');
    designerStore.renameComposition(first, 'Two guests');
    const id = designerStore.addLookFromComposition(first);
    expect(id).toBe('look-1');
    expect(looks()[0]?.name).toBe('Two guests');
  });

  it('refuses what it cannot honour: an unknown composition, a composition already a look, no group', () => {
    const { orphanIds } = threeOrphans();
    expect(designerStore.addLookFromComposition('nope')).toBeNull();
    const first = orphanIds[0];
    if (first === undefined) throw new Error('no orphan');
    designerStore.addLookFromComposition(first);
    expect(designerStore.addLookFromComposition(first)).toBeNull();
    expect(looks()).toHaveLength(1);
    // From INSIDE a look's sub-scene there is no group on the active document.
    designerStore.editLookContents('look-1');
    expect(designerStore.addLookFromComposition(orphanIds[1] ?? '')).toBeNull();
  });

  it('removing a look never deletes a composition, and Undo restores the look', () => {
    fresh();
    designerStore.createLookGroup();
    designerStore.addLook();
    const before = comps().length;
    designerStore.markHistoryBoundary();
    designerStore.removeLook('look-1');
    expect(looks()).toEqual([]);
    expect(comps().length).toBe(before);
    designerStore.undo();
    expect(looks().map((l) => l.id)).toEqual(['look-1']);
    expect(comps().length).toBe(before);
  });
});
